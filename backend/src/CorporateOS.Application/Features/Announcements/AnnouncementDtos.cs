using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using FluentValidation;

namespace CorporateOS.Application.Features.Announcements;

public sealed class AnnouncementQuery : PagedQuery
{
    public AnnouncementPriority? Priority { get; set; }
    public AnnouncementTarget? TargetType { get; set; }

    /// <summary>Administrators only: include scheduled and expired announcements.</summary>
    public bool IncludeInactive { get; set; }
}

public enum AnnouncementState
{
    Scheduled = 1,
    Active = 2,
    Expired = 3
}

public sealed record AnnouncementDto(
    int Id,
    string Title,
    string Content,
    AnnouncementPriority Priority,
    DateTime PublishDate,
    DateTime? ExpireDate,
    bool IsPinned,
    AnnouncementTarget TargetType,
    int? DepartmentId,
    string? DepartmentName,
    string CreatedByName,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    AnnouncementState State);

public sealed record SaveAnnouncementRequest(
    string Title,
    string Content,
    AnnouncementPriority Priority,
    DateTime? PublishDate,
    DateTime? ExpireDate,
    bool IsPinned,
    AnnouncementTarget TargetType,
    int? DepartmentId);

public sealed record PinAnnouncementRequest(bool IsPinned);

public sealed class SaveAnnouncementRequestValidator : AbstractValidator<SaveAnnouncementRequest>
{
    public SaveAnnouncementRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Content).NotEmpty().MaximumLength(8000);
        RuleFor(x => x.Priority).IsInEnum();
        RuleFor(x => x.TargetType).IsInEnum();
        RuleFor(x => x.DepartmentId).NotNull().When(x => x.TargetType == AnnouncementTarget.SpecificDepartment)
            .WithMessage(_ => Text.Get("announcement.departmentRequired"));
        RuleFor(x => x.ExpireDate)
            .GreaterThan(x => x.PublishDate ?? DateTime.UtcNow).When(x => x.ExpireDate.HasValue)
            .WithMessage(_ => Text.Get("announcement.expiryAfterPublish"));
    }
}
