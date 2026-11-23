using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Common.Activity;

/// <summary>Builds activity timelines (employee, project, task) from the audit log.</summary>
public static class ActivityQueries
{
    public static async Task<IReadOnlyList<ActivityItemDto>> ForEntityAsync(
        IApplicationDbContext db,
        string entityName,
        string entityId,
        int take,
        CancellationToken cancellationToken,
        params string[] relatedEntityNames)
    {
        var names = relatedEntityNames.Prepend(entityName).ToArray();
        return await Project(db.AuditLogs.AsNoTracking()
                .Where(a => names.Contains(a.EntityName) && a.EntityId == entityId))
            .Take(take)
            .ToListAsync(cancellationToken);
    }

    public static IQueryable<ActivityItemDto> Project(IQueryable<Domain.Entities.AuditLog> query) =>
        query.OrderByDescending(a => a.CreatedAt)
            .Select(a => new ActivityItemDto(
                a.Id,
                a.Action,
                a.EntityName,
                a.EntityId,
                a.User != null ? a.User.DisplayName : a.UserEmail,
                a.NewValues,
                a.CreatedAt));
}
