using System.Text.Json;
using System.Text.Json.Serialization;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Domain.Entities;

namespace CorporateOS.Infrastructure.Services;

public sealed class AuditService(IApplicationDbContext db, ICurrentUserService currentUser, TimeProvider clock)
    : IAuditService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter() },
        MaxDepth = 8
    };

    public void Record(
        string action,
        string entityName,
        string? entityId,
        object? oldValues = null,
        object? newValues = null,
        Guid? userId = null,
        string? userEmail = null)
    {
        db.AuditLogs.Add(new AuditLog
        {
            UserId = userId ?? currentUser.UserId,
            UserEmail = Truncate(userEmail ?? currentUser.Email, 256),
            Action = action,
            EntityName = entityName,
            EntityId = entityId,
            OldValues = Serialize(oldValues),
            NewValues = Serialize(newValues),
            IpAddress = Truncate(currentUser.IpAddress, 64),
            UserAgent = Truncate(currentUser.UserAgent, 512),
            CreatedAt = clock.GetUtcNow().UtcDateTime
        });
    }

    private static string? Serialize(object? value) =>
        value is null ? null : JsonSerializer.Serialize(value, JsonOptions);

    private static string? Truncate(string? value, int max) =>
        value is null || value.Length <= max ? value : value[..max];
}
