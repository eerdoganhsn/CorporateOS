using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using FluentValidation;

namespace CorporateOS.Application.Features.Departments;

public sealed class DepartmentQuery : PagedQuery
{
    public RecordStatus? Status { get; set; }
}

public sealed record DepartmentListItemDto(
    int Id,
    string Name,
    string Code,
    string? Description,
    RecordStatus Status,
    int? ManagerId,
    string? ManagerName,
    int EmployeeCount,
    int ActiveProjectCount);

public sealed record DepartmentTaskSummary(int Open, int Overdue, int CompletedLast30Days);

public sealed record DepartmentLeaveSummary(int Pending, int ApprovedDaysThisYear, int OnLeaveToday);

public sealed record DepartmentExpenseSummary(int Pending, decimal ApprovedThisMonth, decimal ApprovedThisYear);

public sealed record DepartmentProjectDto(int Id, string Name, string ProjectCode, ProjectStatus Status, int ProgressPercentage, DateOnly? EndDate);

public sealed record DepartmentDetailDto(
    int Id,
    string Name,
    string Code,
    string? Description,
    RecordStatus Status,
    EmployeeSummaryDto? Manager,
    int EmployeeCount,
    IReadOnlyList<EmployeeSummaryDto> Employees,
    IReadOnlyList<DepartmentProjectDto> ActiveProjects,
    DepartmentTaskSummary Tasks,
    DepartmentLeaveSummary Leave,
    DepartmentExpenseSummary Expenses,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public sealed record SaveDepartmentRequest(
    string Name,
    string Code,
    string? Description,
    int? ManagerId,
    RecordStatus Status);

public sealed class SaveDepartmentRequestValidator : AbstractValidator<SaveDepartmentRequest>
{
    public SaveDepartmentRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20)
            .Matches("^[A-Za-z0-9-]+$").WithMessage(_ => Text.Get("error.codeFormat"));
        RuleFor(x => x.Description).MaximumLength(1000);
        RuleFor(x => x.Status).IsInEnum();
        RuleFor(x => x.ManagerId).GreaterThan(0).When(x => x.ManagerId.HasValue);
    }
}
