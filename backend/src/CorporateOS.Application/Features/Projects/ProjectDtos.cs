using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using FluentValidation;

namespace CorporateOS.Application.Features.Projects;

public sealed class ProjectQuery : PagedQuery
{
    public ProjectStatus? Status { get; set; }
    public Priority? Priority { get; set; }
    public int? DepartmentId { get; set; }
    public int? ProjectManagerId { get; set; }
    public bool IncludeArchived { get; set; }
}

public sealed record ProjectListItemDto(
    int Id,
    string Name,
    string ProjectCode,
    ProjectStatus Status,
    Priority Priority,
    DateOnly StartDate,
    DateOnly? EndDate,
    int ProgressPercentage,
    int? ProjectManagerId,
    string? ProjectManagerName,
    int? DepartmentId,
    string? DepartmentName,
    int MemberCount,
    int OpenTaskCount,
    decimal? Budget,
    bool IsArchived);

public sealed record ProjectMemberDto(
    int EmployeeId,
    string FullName,
    string EmployeeNumber,
    string? PositionTitle,
    string? DepartmentName,
    string Role,
    DateTime JoinedAt,
    string? AvatarUrl);

public sealed record ProjectTaskStats(int Total, int Todo, int InProgress, int Review, int Completed, int Cancelled, int Overdue);

public sealed record ProjectDetailDto(
    int Id,
    string Name,
    string ProjectCode,
    string? Description,
    ProjectStatus Status,
    Priority Priority,
    DateOnly StartDate,
    DateOnly? EndDate,
    int ProgressPercentage,
    decimal? Budget,
    bool CanViewBudget,
    decimal? ActualCost,
    EmployeeSummaryDto? ProjectManager,
    int? DepartmentId,
    string? DepartmentName,
    bool IsArchived,
    IReadOnlyList<ProjectMemberDto> Members,
    ProjectTaskStats TaskStats,
    bool CanManage,
    bool CanManageTasks,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public sealed record SaveProjectRequest(
    string Name,
    string ProjectCode,
    string? Description,
    DateOnly StartDate,
    DateOnly? EndDate,
    ProjectStatus Status,
    Priority Priority,
    decimal? Budget,
    int ProgressPercentage,
    int? ProjectManagerId,
    int? DepartmentId);

public sealed record AddProjectMemberRequest(int EmployeeId, string? Role);

public sealed class SaveProjectRequestValidator : AbstractValidator<SaveProjectRequest>
{
    public SaveProjectRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ProjectCode).NotEmpty().MaximumLength(20)
            .Matches("^[A-Za-z0-9-]+$").WithMessage(_ => Text.Get("project.codeFormat"));
        RuleFor(x => x.Description).MaximumLength(4000);
        RuleFor(x => x.StartDate).NotEmpty();
        RuleFor(x => x.EndDate)
            .GreaterThanOrEqualTo(x => x.StartDate).When(x => x.EndDate.HasValue)
            .WithMessage(_ => Text.Get("error.endBeforeStart"));
        RuleFor(x => x.Status).IsInEnum();
        RuleFor(x => x.Priority).IsInEnum();
        RuleFor(x => x.Budget).GreaterThanOrEqualTo(0).When(x => x.Budget.HasValue);
        RuleFor(x => x.ProgressPercentage).InclusiveBetween(0, 100);
    }
}

public sealed class AddProjectMemberRequestValidator : AbstractValidator<AddProjectMemberRequest>
{
    public AddProjectMemberRequestValidator()
    {
        RuleFor(x => x.EmployeeId).GreaterThan(0);
        RuleFor(x => x.Role).MaximumLength(100);
    }
}
