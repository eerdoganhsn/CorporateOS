using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Enums;
using Mapster;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Notifications;

public sealed class NotificationQuery : PagedQuery
{
    public bool UnreadOnly { get; set; }
}

/// <summary>Mapped with Mapster.</summary>
public sealed class NotificationDto
{
    public long Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
    public NotificationType Type { get; init; }
    public bool IsRead { get; init; }
    public string? RelatedEntityId { get; init; }
    public string? RelatedEntityType { get; init; }
    public DateTime CreatedAt { get; init; }
}

public sealed record UnreadCountDto(int Count);

public interface INotificationService
{
    Task<PagedResult<NotificationDto>> ListAsync(NotificationQuery query, CancellationToken cancellationToken);
    Task<UnreadCountDto> GetUnreadCountAsync(CancellationToken cancellationToken);
    Task MarkReadAsync(long id, CancellationToken cancellationToken);
    Task<int> MarkAllReadAsync(CancellationToken cancellationToken);
}

/// <summary>The signed-in user's notification inbox. Users only ever see their own notifications.</summary>
public sealed class NotificationService(IApplicationDbContext db, ICurrentUserService currentUser, TimeProvider clock)
    : INotificationService
{
    public Task<PagedResult<NotificationDto>> ListAsync(NotificationQuery query, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        return db.Notifications.AsNoTracking()
            .Where(n => n.UserId == userId)
            .WhereIf(query.UnreadOnly, n => !n.IsRead)
            .OrderByDescending(n => n.CreatedAt)
            .ProjectToType<NotificationDto>()
            .ToPagedResultAsync(query, cancellationToken);
    }

    public async Task<UnreadCountDto> GetUnreadCountAsync(CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        return new UnreadCountDto(await db.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead, cancellationToken));
    }

    public async Task MarkReadAsync(long id, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        var notification = await db.Notifications.FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId, cancellationToken)
                           ?? throw new NotFoundException("Notification", id);
        if (!notification.IsRead)
        {
            notification.IsRead = true;
            notification.ReadAt = clock.GetUtcNow().UtcDateTime;
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<int> MarkAllReadAsync(CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        return await db.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true).SetProperty(n => n.ReadAt, now), cancellationToken);
    }

    private Guid RequireUserId() => currentUser.UserId ?? throw new UnauthorizedException();
}
