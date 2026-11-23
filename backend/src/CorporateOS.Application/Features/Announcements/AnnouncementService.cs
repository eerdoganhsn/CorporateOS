using CorporateOS.Application.Common.Audience;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Announcements;

public interface IAnnouncementService
{
    Task<PagedResult<AnnouncementDto>> ListAsync(AnnouncementQuery query, CancellationToken cancellationToken);
    Task<AnnouncementDto> GetAsync(int id, CancellationToken cancellationToken);
    Task<AnnouncementDto> CreateAsync(SaveAnnouncementRequest request, CancellationToken cancellationToken);
    Task<AnnouncementDto> UpdateAsync(int id, SaveAnnouncementRequest request, CancellationToken cancellationToken);
    Task<AnnouncementDto> SetPinnedAsync(int id, bool pinned, CancellationToken cancellationToken);
    Task DeleteAsync(int id, CancellationToken cancellationToken);

    /// <summary>Background job: notifies audiences of announcements whose publish date has arrived.</summary>
    Task<int> PublishPendingNotificationsAsync(CancellationToken cancellationToken);
}

public sealed class AnnouncementService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IAuditService audit,
    INotificationPublisher notifications,
    TimeProvider clock) : IAnnouncementService
{
    public async Task<PagedResult<AnnouncementDto>> ListAsync(AnnouncementQuery query, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var now = Now;
        var includeInactive = query.IncludeInactive && scope.IsAdmin;
        var search = query.Search?.Trim();

        var announcements = Visible(scope, includeInactive)
            .WhereIf(query.Priority.HasValue, a => a.Priority == query.Priority)
            .WhereIf(query.TargetType.HasValue, a => a.TargetType == query.TargetType)
            .WhereIf(!string.IsNullOrEmpty(search), a => a.Title.Contains(search!) || a.Content.Contains(search!))
            .OrderByDescending(a => a.IsPinned)
            .ThenByDescending(a => a.PublishDate);

        return await Project(announcements, now).ToPagedResultAsync(query, cancellationToken);
    }

    public async Task<AnnouncementDto> GetAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        return await Project(Visible(scope, includeInactive: scope.IsAdmin).Where(a => a.Id == id), Now).FirstOrDefaultAsync(cancellationToken)
               ?? throw new NotFoundException("Announcement", id);
    }

    public async Task<AnnouncementDto> CreateAsync(SaveAnnouncementRequest request, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        await ValidateDepartmentAsync(request, cancellationToken);

        var announcement = new Announcement { CreatedById = scope.UserId };
        Apply(announcement, request);
        db.Announcements.Add(announcement);
        await db.SaveChangesAsync(cancellationToken);

        if (announcement.PublishDate <= Now)
        {
            await NotifyAudienceAsync(announcement, cancellationToken);
        }

        audit.Record("Announcement.Created", nameof(Announcement), announcement.Id.ToString(), newValues: Snapshot(announcement));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(announcement.Id, cancellationToken);
    }

    public async Task<AnnouncementDto> UpdateAsync(int id, SaveAnnouncementRequest request, CancellationToken cancellationToken)
    {
        var announcement = await db.Announcements.FirstOrDefaultAsync(a => a.Id == id, cancellationToken)
                           ?? throw new NotFoundException("Announcement", id);
        await ValidateDepartmentAsync(request, cancellationToken);

        var before = Snapshot(announcement);
        Apply(announcement, request);

        if (announcement.NotificationsSentAt is null && announcement.PublishDate <= Now)
        {
            await NotifyAudienceAsync(announcement, cancellationToken);
        }

        audit.Record("Announcement.Updated", nameof(Announcement), id.ToString(), before, Snapshot(announcement));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<AnnouncementDto> SetPinnedAsync(int id, bool pinned, CancellationToken cancellationToken)
    {
        var announcement = await db.Announcements.FirstOrDefaultAsync(a => a.Id == id, cancellationToken)
                           ?? throw new NotFoundException("Announcement", id);
        announcement.IsPinned = pinned;
        audit.Record(pinned ? "Announcement.Pinned" : "Announcement.Unpinned", nameof(Announcement), id.ToString());
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken)
    {
        var announcement = await db.Announcements.FirstOrDefaultAsync(a => a.Id == id, cancellationToken)
                           ?? throw new NotFoundException("Announcement", id);
        db.Announcements.Remove(announcement); // soft delete
        audit.Record("Announcement.Deleted", nameof(Announcement), id.ToString(), Snapshot(announcement));
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<int> PublishPendingNotificationsAsync(CancellationToken cancellationToken)
    {
        var now = Now;
        var due = await db.Announcements
            .Where(a => a.NotificationsSentAt == null && a.PublishDate <= now && (a.ExpireDate == null || a.ExpireDate > now))
            .ToListAsync(cancellationToken);

        foreach (var announcement in due)
        {
            await NotifyAudienceAsync(announcement, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        return due.Count;
    }

    /// <summary>Published, unexpired and targeted at the caller (administrators see every target).</summary>
    private IQueryable<Announcement> Visible(UserScope scope, bool includeInactive)
    {
        var now = Now;
        var announcements = db.Announcements.AsNoTracking();

        if (!includeInactive)
        {
            announcements = announcements.Where(a => a.PublishDate <= now && (a.ExpireDate == null || a.ExpireDate > now));
        }

        if (scope.IsAdmin)
        {
            return announcements;
        }

        var departmentId = scope.DepartmentId ?? -1;
        var isManager = scope.IsManager;
        return announcements.Where(a =>
            a.TargetType == AnnouncementTarget.AllEmployees ||
            (a.TargetType == AnnouncementTarget.SpecificDepartment && a.DepartmentId == departmentId) ||
            (a.TargetType == AnnouncementTarget.ManagersOnly && isManager));
    }

    private async Task NotifyAudienceAsync(Announcement announcement, CancellationToken cancellationToken)
    {
        var audience = announcement.TargetType switch
        {
            AnnouncementTarget.SpecificDepartment => await AudienceResolver.DepartmentUsersAsync(db, announcement.DepartmentId!.Value, cancellationToken),
            AnnouncementTarget.ManagersOnly => await AudienceResolver.ManagersAndAdminsAsync(db, cancellationToken),
            _ => await AudienceResolver.AllActiveUsersAsync(db, cancellationToken)
        };

        var preview = announcement.Content.Length > 160 ? announcement.Content[..157] + "..." : announcement.Content;
        foreach (var userId in audience.Where(u => u != announcement.CreatedById))
        {
            notifications.Notify(userId, announcement.Title, preview, NotificationType.AnnouncementPublished,
                nameof(Announcement), announcement.Id.ToString());
        }

        announcement.NotificationsSentAt = Now;
    }

    private async Task ValidateDepartmentAsync(SaveAnnouncementRequest request, CancellationToken cancellationToken)
    {
        if (request.TargetType == AnnouncementTarget.SpecificDepartment &&
            !await db.Departments.AnyAsync(d => d.Id == request.DepartmentId, cancellationToken))
        {
            throw new RequestValidationException("departmentId", "The selected department does not exist.");
        }
    }

    private void Apply(Announcement announcement, SaveAnnouncementRequest request)
    {
        announcement.Title = request.Title.Trim();
        announcement.Content = request.Content.Trim();
        announcement.Priority = request.Priority;
        announcement.PublishDate = request.PublishDate?.ToUniversalTime() ?? Now;
        announcement.ExpireDate = request.ExpireDate?.ToUniversalTime();
        announcement.IsPinned = request.IsPinned;
        announcement.TargetType = request.TargetType;
        announcement.DepartmentId = request.TargetType == AnnouncementTarget.SpecificDepartment ? request.DepartmentId : null;
    }

    private static IQueryable<AnnouncementDto> Project(IQueryable<Announcement> query, DateTime now) =>
        query.Select(a => new AnnouncementDto(
            a.Id, a.Title, a.Content, a.Priority, a.PublishDate, a.ExpireDate, a.IsPinned, a.TargetType,
            a.DepartmentId, a.Department != null ? a.Department.Name : null, a.CreatedByUser.DisplayName,
            a.CreatedAt, a.UpdatedAt,
            a.PublishDate > now ? AnnouncementState.Scheduled
                : a.ExpireDate != null && a.ExpireDate <= now ? AnnouncementState.Expired
                : AnnouncementState.Active));

    private static object Snapshot(Announcement a) => new
    {
        a.Title, a.Priority, a.PublishDate, a.ExpireDate, a.IsPinned, a.TargetType, a.DepartmentId
    };

    private DateTime Now => clock.GetUtcNow().UtcDateTime;
}
