using CorporateOS.Domain.Common;
using CorporateOS.Domain.Enums;

namespace CorporateOS.Domain.Entities;

public class Announcement : AuditableEntity, ISoftDeletable
{
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public AnnouncementPriority Priority { get; set; } = AnnouncementPriority.Normal;
    public DateTime PublishDate { get; set; }
    public DateTime? ExpireDate { get; set; }
    public bool IsPinned { get; set; }
    public Guid CreatedById { get; set; }
    public ApplicationUser CreatedByUser { get; set; } = null!;
    public AnnouncementTarget TargetType { get; set; } = AnnouncementTarget.AllEmployees;
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }

    /// <summary>Set once audience notifications have been created (immediately or by the scheduler).</summary>
    public DateTime? NotificationsSentAt { get; set; }

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }
}

public class Document : AuditableEntity, ISoftDeletable
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public string FileType { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public DocumentCategory Category { get; set; } = DocumentCategory.General;
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }
    public DocumentAccessLevel AccessLevel { get; set; } = DocumentAccessLevel.AllEmployees;
    public Guid UploadedById { get; set; }
    public ApplicationUser UploadedBy { get; set; } = null!;

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }
}

public class Notification
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public NotificationType Type { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
    public string? RelatedEntityId { get; set; }
    public string? RelatedEntityType { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>Immutable record of a security- or business-relevant action. Never updated or deleted.</summary>
public class AuditLog
{
    public long Id { get; set; }
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }
    public string? UserEmail { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityName { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public string? OldValues { get; set; }
    public string? NewValues { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class SystemSetting
{
    public int Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public SettingDataType DataType { get; set; }
    public bool IsAdvanced { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
}
