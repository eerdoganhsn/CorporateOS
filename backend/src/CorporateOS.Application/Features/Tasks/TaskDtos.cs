using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using FluentValidation;

namespace CorporateOS.Application.Features.Tasks;

public sealed class TaskQuery : PagedQuery
{
    public int? ProjectId { get; set; }
    public int? AssignedToId { get; set; }
    public TaskItemStatus? Status { get; set; }
    public Priority? Priority { get; set; }
    public DateOnly? DueFrom { get; set; }
    public DateOnly? DueTo { get; set; }
    public bool OverdueOnly { get; set; }

    /// <summary>Restrict to tasks assigned to the caller.</summary>
    public bool Mine { get; set; }
}

public sealed record TaskListItemDto(
    int Id,
    string Title,
    int ProjectId,
    string ProjectName,
    string ProjectCode,
    int? AssignedToId,
    string? AssignedToName,
    string? AssignedToAvatarUrl,
    TaskItemStatus Status,
    Priority Priority,
    DateOnly? DueDate,
    int ProgressPercentage,
    decimal? EstimatedHours,
    decimal? ActualHours,
    bool IsOverdue,
    int CommentCount,
    DateTime CreatedAt);

public sealed record TaskBoardColumnDto(TaskItemStatus Status, IReadOnlyList<TaskListItemDto> Items);

public sealed record TaskCommentDto(int Id, Guid AuthorId, string AuthorName, string? AuthorAvatarUrl, string Content, DateTime CreatedAt);

public sealed record TaskDetailDto(
    int Id,
    string Title,
    string? Description,
    int ProjectId,
    string ProjectName,
    string ProjectCode,
    EmployeeSummaryDto? AssignedTo,
    string? AssignedByName,
    TaskItemStatus Status,
    Priority Priority,
    DateOnly? DueDate,
    decimal? EstimatedHours,
    decimal? ActualHours,
    int ProgressPercentage,
    bool IsOverdue,
    DateTime? CompletedAt,
    IReadOnlyList<TaskCommentDto> Comments,
    bool CanEdit,
    bool CanUpdateProgress,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public sealed record CreateTaskRequest(
    int ProjectId,
    string Title,
    string? Description,
    int? AssignedToId,
    TaskItemStatus Status,
    Priority Priority,
    DateOnly? DueDate,
    decimal? EstimatedHours);

public sealed record UpdateTaskRequest(
    string Title,
    string? Description,
    int? AssignedToId,
    TaskItemStatus Status,
    Priority Priority,
    DateOnly? DueDate,
    decimal? EstimatedHours,
    decimal? ActualHours,
    int ProgressPercentage);

public sealed record UpdateTaskStatusRequest(TaskItemStatus Status, int? ProgressPercentage, decimal? ActualHours);

public sealed record AddTaskCommentRequest(string Content);

public sealed class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator(TimeProvider clock)
    {
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        RuleFor(x => x.ProjectId).GreaterThan(0).WithMessage(_ => Text.Get("task.projectRequired"));
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(4000);
        RuleFor(x => x.Status).IsInEnum();
        RuleFor(x => x.Priority).IsInEnum();
        RuleFor(x => x.DueDate).GreaterThanOrEqualTo(today).When(x => x.DueDate.HasValue)
            .WithMessage(_ => Text.Get("task.dueInPast"));
        RuleFor(x => x.EstimatedHours).InclusiveBetween(0, 10_000).When(x => x.EstimatedHours.HasValue);
    }
}

public sealed class UpdateTaskRequestValidator : AbstractValidator<UpdateTaskRequest>
{
    public UpdateTaskRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(4000);
        RuleFor(x => x.Status).IsInEnum();
        RuleFor(x => x.Priority).IsInEnum();
        RuleFor(x => x.DueDate).GreaterThan(new DateOnly(2000, 1, 1)).When(x => x.DueDate.HasValue).WithMessage(_ => Text.Get("task.dueInvalid"));
        RuleFor(x => x.EstimatedHours).InclusiveBetween(0, 10_000).When(x => x.EstimatedHours.HasValue);
        RuleFor(x => x.ActualHours).InclusiveBetween(0, 10_000).When(x => x.ActualHours.HasValue);
        RuleFor(x => x.ProgressPercentage).InclusiveBetween(0, 100);
    }
}

public sealed class UpdateTaskStatusRequestValidator : AbstractValidator<UpdateTaskStatusRequest>
{
    public UpdateTaskStatusRequestValidator()
    {
        RuleFor(x => x.Status).IsInEnum();
        RuleFor(x => x.ProgressPercentage).InclusiveBetween(0, 100).When(x => x.ProgressPercentage.HasValue);
        RuleFor(x => x.ActualHours).InclusiveBetween(0, 10_000).When(x => x.ActualHours.HasValue);
    }
}

public sealed class AddTaskCommentRequestValidator : AbstractValidator<AddTaskCommentRequest>
{
    public AddTaskCommentRequestValidator() => RuleFor(x => x.Content).NotEmpty().MaximumLength(2000);
}
