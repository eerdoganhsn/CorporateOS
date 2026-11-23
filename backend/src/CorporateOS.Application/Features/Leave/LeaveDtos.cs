using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Enums;
using FluentValidation;

namespace CorporateOS.Application.Features.Leave;

public enum RequestListScope
{
    /// <summary>The caller's own requests.</summary>
    Mine = 1,
    /// <summary>Pending requests the caller is allowed to decide.</summary>
    Approvals = 2,
    /// <summary>Everything the caller may see (own, department or company).</summary>
    All = 3
}

public sealed class LeaveQuery : PagedQuery
{
    public RequestListScope Scope { get; set; } = RequestListScope.Mine;
    public int? EmployeeId { get; set; }
    public int? DepartmentId { get; set; }
    public LeaveRequestStatus? Status { get; set; }
    public LeaveType? LeaveType { get; set; }
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
}

public sealed record LeaveRequestDto(
    int Id,
    int EmployeeId,
    string EmployeeName,
    string EmployeeNumber,
    string DepartmentName,
    string? EmployeeAvatarUrl,
    LeaveType LeaveType,
    DateOnly StartDate,
    DateOnly EndDate,
    int TotalDays,
    string? Reason,
    LeaveRequestStatus Status,
    string? ApprovedByName,
    DateTime? ApprovedAt,
    string? ApprovalNote,
    string? RejectionReason,
    DateTime CreatedAt,
    bool CanApprove,
    bool CanCancel);

public sealed record LeaveBalanceDto(
    int EmployeeId,
    string EmployeeName,
    string DepartmentName,
    int Year,
    int TotalDays,
    int UsedDays,
    int PendingDays,
    int RemainingDays);

public sealed record LeaveTypeUsageDto(LeaveType LeaveType, int ApprovedDays, int PendingDays);

public sealed record MyLeaveSummaryDto(LeaveBalanceDto Balance, IReadOnlyList<LeaveTypeUsageDto> UsageByType);

public sealed record LeaveCalendarEntryDto(
    int Id,
    int EmployeeId,
    string EmployeeName,
    string DepartmentName,
    LeaveType LeaveType,
    DateOnly StartDate,
    DateOnly EndDate,
    int TotalDays,
    LeaveRequestStatus Status);

public sealed class LeaveBalanceQuery : PagedQuery
{
    public int? Year { get; set; }
    public int? DepartmentId { get; set; }
}

public sealed record CreateLeaveRequest(LeaveType LeaveType, DateOnly StartDate, DateOnly EndDate, string? Reason, int? EmployeeId);

public sealed record ApproveLeaveRequest(string? Note);

public sealed record RejectLeaveRequest(string Reason);

public sealed record UpdateLeaveBalanceRequest(int TotalDays);

public sealed class CreateLeaveRequestValidator : AbstractValidator<CreateLeaveRequest>
{
    public CreateLeaveRequestValidator(TimeProvider clock)
    {
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);

        RuleFor(x => x.LeaveType).IsInEnum().WithMessage("Leave type is required.");
        RuleFor(x => x.StartDate).NotEmpty()
            .GreaterThanOrEqualTo(today.AddDays(-30)).WithMessage("Leave cannot start more than 30 days in the past.");
        RuleFor(x => x.EndDate).NotEmpty()
            .GreaterThanOrEqualTo(x => x.StartDate).WithMessage("End date cannot be earlier than start date.");
        RuleFor(x => x).Must(x => x.EndDate.DayNumber - x.StartDate.DayNumber <= 365)
            .WithName("endDate").WithMessage("A single request cannot exceed one year.");
        RuleFor(x => x.Reason).MaximumLength(1000);
        RuleFor(x => x.Reason).NotEmpty().When(x => x.LeaveType == LeaveType.Other)
            .WithMessage("Please describe the reason for this leave type.");
        RuleFor(x => x.EmployeeId).GreaterThan(0).When(x => x.EmployeeId.HasValue);
    }
}

public sealed class ApproveLeaveRequestValidator : AbstractValidator<ApproveLeaveRequest>
{
    public ApproveLeaveRequestValidator() => RuleFor(x => x.Note).MaximumLength(1000);
}

public sealed class RejectLeaveRequestValidator : AbstractValidator<RejectLeaveRequest>
{
    public RejectLeaveRequestValidator() =>
        RuleFor(x => x.Reason).NotEmpty().WithMessage("A rejection reason is required.").MaximumLength(1000);
}

public sealed class UpdateLeaveBalanceRequestValidator : AbstractValidator<UpdateLeaveBalanceRequest>
{
    public UpdateLeaveBalanceRequestValidator() => RuleFor(x => x.TotalDays).InclusiveBetween(0, 90);
}
