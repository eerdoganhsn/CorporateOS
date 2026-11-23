using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Notifications;

public sealed class NotificationPublisher(IApplicationDbContext db, TimeProvider clock) : INotificationPublisher
{
    public void Notify(Guid userId, string title, string message, NotificationType type, string? entityType = null, string? entityId = null)
    {
        db.Notifications.Add(new Notification
        {
            UserId = userId,
            Title = Truncate(title, 200),
            Message = Truncate(message, 1000),
            Type = type,
            RelatedEntityType = entityType,
            RelatedEntityId = entityId,
            CreatedAt = clock.GetUtcNow().UtcDateTime
        });
    }

    public async Task NotifyEmployeesAsync(
        IEnumerable<int> employeeIds,
        string title,
        string message,
        NotificationType type,
        string? entityType = null,
        string? entityId = null,
        CancellationToken cancellationToken = default)
    {
        var ids = employeeIds.Distinct().ToList();
        if (ids.Count == 0)
        {
            return;
        }

        var userIds = await db.Employees.AsNoTracking()
            .Where(e => ids.Contains(e.Id) && e.UserId != null)
            .Select(e => e.UserId!.Value)
            .ToListAsync(cancellationToken);

        foreach (var userId in userIds)
        {
            Notify(userId, title, message, type, entityType, entityId);
        }
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..(max - 1)] + "…";
}
