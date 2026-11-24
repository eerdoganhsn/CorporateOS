using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Notifications;

public sealed class NotificationPublisher(IApplicationDbContext db, TimeProvider clock) : INotificationPublisher
{
    public async Task NotifyUsersAsync(
        IEnumerable<Guid> userIds,
        LocalizedText title,
        LocalizedText message,
        NotificationType type,
        string? entityType = null,
        string? entityId = null,
        CancellationToken cancellationToken = default)
    {
        var ids = userIds.Distinct().ToList();
        if (ids.Count == 0)
        {
            return;
        }

        var recipients = await db.Users.AsNoTracking()
            .Where(u => ids.Contains(u.Id))
            .Select(u => new { u.Id, u.PreferredLanguage })
            .ToListAsync(cancellationToken);

        var now = clock.GetUtcNow().UtcDateTime;
        foreach (var group in recipients.GroupBy(r => Languages.Normalize(r.PreferredLanguage)))
        {
            // Render once per language, not once per recipient.
            var renderedTitle = Truncate(title.Render(group.Key), 200);
            var renderedMessage = Truncate(message.Render(group.Key), 1000);
            foreach (var recipient in group)
            {
                db.Notifications.Add(new Notification
                {
                    UserId = recipient.Id,
                    Title = renderedTitle,
                    Message = renderedMessage,
                    Type = type,
                    RelatedEntityType = entityType,
                    RelatedEntityId = entityId,
                    CreatedAt = now
                });
            }
        }
    }

    public async Task NotifyEmployeesAsync(
        IEnumerable<int> employeeIds,
        LocalizedText title,
        LocalizedText message,
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

        await NotifyUsersAsync(userIds, title, message, type, entityType, entityId, cancellationToken);
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..(max - 1)] + "…";
}
