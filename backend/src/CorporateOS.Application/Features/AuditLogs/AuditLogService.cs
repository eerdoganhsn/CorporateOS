using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.AuditLogs;

public sealed class AuditLogQuery : PagedQuery
{
    public Guid? UserId { get; set; }
    public string? Action { get; set; }
    public string? EntityName { get; set; }
    public string? EntityId { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
}

public sealed record AuditLogDto(
    long Id,
    Guid? UserId,
    string? UserEmail,
    string? UserName,
    string Action,
    string EntityName,
    string? EntityId,
    string? OldValues,
    string? NewValues,
    string? IpAddress,
    string? UserAgent,
    DateTime CreatedAt);

public sealed record AuditLogFiltersDto(IReadOnlyList<string> Actions, IReadOnlyList<string> EntityNames);

public interface IAuditLogService
{
    Task<PagedResult<AuditLogDto>> ListAsync(AuditLogQuery query, CancellationToken cancellationToken);
    Task<AuditLogFiltersDto> GetFiltersAsync(CancellationToken cancellationToken);
    Task<ReportTable> ExportAsync(AuditLogQuery query, CancellationToken cancellationToken);
}

/// <summary>
/// Read-only access to the audit trail. SuperAdmins see everything; Admins see business
/// activity but not security events (sign-ins, user/role changes, settings).
/// </summary>
public sealed class AuditLogService(IApplicationDbContext db, ICurrentUserService currentUser) : IAuditLogService
{
    private const int ExportLimit = 10_000;
    private static readonly string[] SecurityEntities = ["User", "Role", "SystemSetting"];

    public async Task<PagedResult<AuditLogDto>> ListAsync(AuditLogQuery query, CancellationToken cancellationToken) =>
        await Project(await FilterAsync(query, cancellationToken)).ToPagedResultAsync(query, cancellationToken);

    public async Task<AuditLogFiltersDto> GetFiltersAsync(CancellationToken cancellationToken)
    {
        var logs = await BaseQueryAsync(cancellationToken);
        var actions = await logs.Select(a => a.Action).Distinct().OrderBy(a => a).ToListAsync(cancellationToken);
        var entities = await logs.Select(a => a.EntityName).Distinct().OrderBy(e => e).ToListAsync(cancellationToken);
        return new AuditLogFiltersDto(actions, entities);
    }

    public async Task<ReportTable> ExportAsync(AuditLogQuery query, CancellationToken cancellationToken)
    {
        var rows = await Project(await FilterAsync(query, cancellationToken)).Take(ExportLimit).ToListAsync(cancellationToken);
        return new ReportTable(
            "Audit Log",
            ["Timestamp (UTC)", "User", "Email", "Action", "Entity", "Entity ID", "IP Address", "Old Values", "New Values"],
            rows.Select(r => (IReadOnlyList<object?>)[r.CreatedAt, r.UserName, r.UserEmail, r.Action, r.EntityName, r.EntityId, r.IpAddress, r.OldValues, r.NewValues]).ToList());
    }

    private async Task<IQueryable<AuditLog>> BaseQueryAsync(CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var logs = db.AuditLogs.AsNoTracking();
        return scope.IsSuperAdmin ? logs : logs.Where(a => !SecurityEntities.Contains(a.EntityName));
    }

    private async Task<IQueryable<AuditLog>> FilterAsync(AuditLogQuery query, CancellationToken cancellationToken)
    {
        var search = query.Search?.Trim();
        var to = query.To?.Date.AddDays(1);
        return (await BaseQueryAsync(cancellationToken))
            .WhereIf(query.UserId.HasValue, a => a.UserId == query.UserId)
            .WhereIf(!string.IsNullOrWhiteSpace(query.Action), a => a.Action == query.Action)
            .WhereIf(!string.IsNullOrWhiteSpace(query.EntityName), a => a.EntityName == query.EntityName)
            .WhereIf(!string.IsNullOrWhiteSpace(query.EntityId), a => a.EntityId == query.EntityId)
            .WhereIf(query.From.HasValue, a => a.CreatedAt >= query.From!.Value.Date)
            .WhereIf(to.HasValue, a => a.CreatedAt < to)
            .WhereIf(!string.IsNullOrEmpty(search), a =>
                (a.UserEmail != null && a.UserEmail.Contains(search!)) || a.Action.Contains(search!) ||
                (a.EntityId != null && a.EntityId == search));
    }

    private static IQueryable<AuditLogDto> Project(IQueryable<AuditLog> query) =>
        query.OrderByDescending(a => a.CreatedAt).ThenByDescending(a => a.Id)
            .Select(a => new AuditLogDto(
                a.Id, a.UserId, a.UserEmail, a.User != null ? a.User.DisplayName : null, a.Action, a.EntityName, a.EntityId,
                a.OldValues, a.NewValues, a.IpAddress, a.UserAgent, a.CreatedAt));
}
