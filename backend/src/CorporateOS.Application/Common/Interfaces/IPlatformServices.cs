using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;

namespace CorporateOS.Application.Common.Interfaces;

/// <summary>Adds audit entries to the current unit of work; they persist with the next SaveChanges.</summary>
public interface IAuditService
{
    void Record(
        string action,
        string entityName,
        string? entityId,
        object? oldValues = null,
        object? newValues = null,
        Guid? userId = null,
        string? userEmail = null);
}

/// <summary>Adds in-app notifications to the current unit of work.</summary>
public interface INotificationPublisher
{
    void Notify(Guid userId, string title, string message, NotificationType type, string? entityType = null, string? entityId = null);

    Task NotifyEmployeesAsync(
        IEnumerable<int> employeeIds,
        string title,
        string message,
        NotificationType type,
        string? entityType = null,
        string? entityId = null,
        CancellationToken cancellationToken = default);
}

public interface IFileStorage
{
    /// <summary>Stores content under a generated name. Returns the relative storage path.</summary>
    Task<string> SaveAsync(Stream content, string folder, string extension, CancellationToken cancellationToken = default);

    Task<Stream?> OpenReadAsync(string relativePath, CancellationToken cancellationToken = default);

    Task DeleteAsync(string relativePath, CancellationToken cancellationToken = default);
}

public interface IEmailService
{
    Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default);
}

public sealed record AccessToken(string Token, DateTime ExpiresAt);

public interface ITokenService
{
    AccessToken CreateAccessToken(ApplicationUser user, IReadOnlyCollection<string> roles, int lifetimeMinutes);
    string GenerateRefreshToken();
    string HashToken(string token);
}

public interface ISettingsService
{
    Task<string> GetAsync(string key, CancellationToken cancellationToken = default);
    Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default);
    Task<bool> GetBoolAsync(string key, CancellationToken cancellationToken = default);
    Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken cancellationToken = default);
    void Invalidate();
}

public interface IExportService
{
    ExportFile ToCsv(ReportTable table);
    ExportFile ToExcel(ReportTable table);
}
