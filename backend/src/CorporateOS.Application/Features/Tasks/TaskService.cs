using CorporateOS.Application.Common.Activity;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Common.Options;
using CorporateOS.Application.Features.Projects;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Tasks;

public interface ITaskService
{
    Task<PagedResult<TaskListItemDto>> ListAsync(TaskQuery query, CancellationToken cancellationToken);
    Task<IReadOnlyList<TaskBoardColumnDto>> GetBoardAsync(TaskQuery query, CancellationToken cancellationToken);
    Task<TaskDetailDto> GetAsync(int id, CancellationToken cancellationToken);
    Task<TaskDetailDto> CreateAsync(CreateTaskRequest request, CancellationToken cancellationToken);
    Task<TaskDetailDto> UpdateAsync(int id, UpdateTaskRequest request, CancellationToken cancellationToken);
    Task<TaskDetailDto> UpdateStatusAsync(int id, UpdateTaskStatusRequest request, CancellationToken cancellationToken);
    Task DeleteAsync(int id, CancellationToken cancellationToken);
    Task<TaskCommentDto> AddCommentAsync(int id, AddTaskCommentRequest request, CancellationToken cancellationToken);
    Task<IReadOnlyList<ActivityItemDto>> GetActivityAsync(int id, CancellationToken cancellationToken);

    /// <summary>Background job: notifies assignees of tasks due within 24 hours (once per task).</summary>
    Task<int> SendDueSoonRemindersAsync(CancellationToken cancellationToken);
}

public sealed class TaskService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IAuditService audit,
    INotificationPublisher notifications,
    TimeProvider clock) : ITaskService
{
    private const string EntityName = "Task";
    private const int BoardLimit = 500;

    // Sorting is applied to the entity before projection so EF Core can translate it.
    private static readonly IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<TaskItem, object?>>> Sort =
        SortMap.For<TaskItem>(
            ("title", t => t.Title),
            ("project", t => t.Project.Name),
            ("assignee", t => t.AssignedTo != null ? t.AssignedTo.FirstName + " " + t.AssignedTo.LastName : null),
            ("status", t => t.Status),
            // Enums are stored as strings, so rank explicitly instead of sorting alphabetically.
            ("priority", t => t.Priority == Priority.Critical ? 4 : t.Priority == Priority.High ? 3 : t.Priority == Priority.Medium ? 2 : 1),
            ("dueDate", t => t.DueDate),
            ("progress", t => t.ProgressPercentage),
            ("createdAt", t => t.CreatedAt));

    public async Task<PagedResult<TaskListItemDto>> ListAsync(TaskQuery query, CancellationToken cancellationToken)
    {
        var filtered = await BuildQueryAsync(query, cancellationToken);
        var page = await Project(filtered.ApplySort(query, Sort, "dueDate"))
            .ToPagedResultAsync(query, cancellationToken);

        return new PagedResult<TaskListItemDto>
        {
            Items = page.Items.Select(WithAvatar).ToList(),
            Page = page.Page,
            PageSize = page.PageSize,
            TotalItems = page.TotalItems
        };
    }

    public async Task<IReadOnlyList<TaskBoardColumnDto>> GetBoardAsync(TaskQuery query, CancellationToken cancellationToken)
    {
        var filtered = await BuildQueryAsync(query, cancellationToken);
        var items = await Project(filtered
                .OrderBy(t => t.Priority == Priority.Critical ? 0 : t.Priority == Priority.High ? 1 : t.Priority == Priority.Medium ? 2 : 3)
                .ThenBy(t => t.DueDate)
                .Take(BoardLimit))
            .ToListAsync(cancellationToken);

        return Enum.GetValues<TaskItemStatus>()
            .Select(status => new TaskBoardColumnDto(status, items.Where(t => t.Status == status).Select(WithAvatar).ToList()))
            .ToList();
    }

    public async Task<TaskDetailDto> GetAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var task = await db.Tasks.AsNoTracking()
            .Include(t => t.Project)
            .Include(t => t.AssignedTo).ThenInclude(e => e!.Position)
            .Include(t => t.AssignedBy)
            .FirstOrDefaultAsync(t => t.Id == id, cancellationToken)
            ?? throw new NotFoundException("Task", id);
        await EnsureVisibleAsync(scope, id, cancellationToken);

        var comments = await db.TaskComments.AsNoTracking()
            .Where(c => c.TaskItemId == id)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new TaskCommentDto(c.Id, c.AuthorId, c.Author.DisplayName,
                c.Author.Employee != null ? c.Author.Employee.ProfileImagePath : null, c.Content, c.CreatedAt))
            .ToListAsync(cancellationToken);

        var canEdit = ProjectAccess.CanManageTasks(scope, task.Project);
        return new TaskDetailDto(
            task.Id, task.Title, task.Description, task.ProjectId, task.Project.Name, task.Project.ProjectCode,
            task.AssignedTo is null ? null : new EmployeeSummaryDto(task.AssignedTo.Id, task.AssignedTo.FullName,
                task.AssignedTo.EmployeeNumber, task.AssignedTo.Email, task.AssignedTo.Position.Title, MediaUrls.Avatar(task.AssignedTo.ProfileImagePath)),
            task.AssignedBy?.FullName,
            task.Status, task.Priority, task.DueDate, task.EstimatedHours, task.ActualHours, task.ProgressPercentage,
            IsOverdue(task.DueDate, task.Status), task.CompletedAt,
            comments.Select(c => c with { AuthorAvatarUrl = MediaUrls.Avatar(c.AuthorAvatarUrl) }).ToList(),
            canEdit,
            canEdit || task.AssignedToId == scope.EmployeeId,
            task.CreatedAt, task.UpdatedAt);
    }

    public async Task<TaskDetailDto> CreateAsync(CreateTaskRequest request, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == request.ProjectId, cancellationToken)
                      ?? throw new RequestValidationException("projectId", Text.Get("error.projectNotFound"));

        if (!ProjectAccess.CanManageTasks(scope, project))
        {
            throw new ForbiddenException(Text.Get("task.createForbidden"));
        }

        if (project.IsArchived)
        {
            throw new Domain.Exceptions.DomainException(Text.Get("task.archivedProject"));
        }

        await EnsureAssignableAsync(scope, project, request.AssignedToId, cancellationToken);

        var task = new TaskItem
        {
            ProjectId = project.Id,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim(),
            AssignedToId = request.AssignedToId,
            AssignedById = request.AssignedToId.HasValue ? scope.EmployeeId : null,
            Priority = request.Priority,
            DueDate = request.DueDate,
            EstimatedHours = request.EstimatedHours
        };
        task.ChangeStatus(request.Status, Now);

        db.Tasks.Add(task);
        await db.SaveChangesAsync(cancellationToken);

        if (task.AssignedToId is { } assignee && assignee != scope.EmployeeId)
        {
            await NotifyAssignedAsync(task, project, assignee, cancellationToken);
        }

        audit.Record("Task.Created", EntityName, task.Id.ToString(), newValues: Snapshot(task));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(task.Id, cancellationToken);
    }

    public async Task<TaskDetailDto> UpdateAsync(int id, UpdateTaskRequest request, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var task = await db.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == id, cancellationToken)
                   ?? throw new NotFoundException("Task", id);

        if (!ProjectAccess.CanManageTasks(scope, task.Project))
        {
            await EnsureVisibleAsync(scope, id, cancellationToken);
            throw new ForbiddenException(Text.Get("task.progressOnly"));
        }

        await EnsureAssignableAsync(scope, task.Project, request.AssignedToId, cancellationToken);

        var before = Snapshot(task);
        var previousAssignee = task.AssignedToId;
        var previousStatus = task.Status;

        task.Title = request.Title.Trim();
        task.Description = request.Description?.Trim();
        task.Priority = request.Priority;
        task.DueDate = request.DueDate;
        task.EstimatedHours = request.EstimatedHours;
        task.ActualHours = request.ActualHours;
        task.ProgressPercentage = request.ProgressPercentage;
        task.ChangeStatus(request.Status, Now);

        if (previousAssignee != request.AssignedToId)
        {
            task.AssignedToId = request.AssignedToId;
            task.AssignedById = scope.EmployeeId;
            task.DueSoonNotifiedAt = null;
            if (request.AssignedToId is { } assignee && assignee != scope.EmployeeId)
            {
                await NotifyAssignedAsync(task, task.Project, assignee, cancellationToken);
            }

            audit.Record("Task.Assigned", EntityName, id.ToString(), new { AssignedToId = previousAssignee }, new { task.AssignedToId });
        }

        if (previousAssignee == request.AssignedToId && previousStatus != task.Status)
        {
            await NotifyStatusChangeAsync(task, scope, cancellationToken);
        }

        audit.Record("Task.Updated", EntityName, id.ToString(), before, Snapshot(task));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<TaskDetailDto> UpdateStatusAsync(int id, UpdateTaskStatusRequest request, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var task = await db.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == id, cancellationToken)
                   ?? throw new NotFoundException("Task", id);

        var isAssignee = scope.EmployeeId.HasValue && task.AssignedToId == scope.EmployeeId;
        if (!isAssignee && !ProjectAccess.CanManageTasks(scope, task.Project))
        {
            throw new ForbiddenException(Text.Get("task.ownOnly"));
        }

        if (isAssignee && !ProjectAccess.CanManageTasks(scope, task.Project) && request.Status == TaskItemStatus.Cancelled)
        {
            throw new ForbiddenException(Text.Get("task.cancelManagerOnly"));
        }

        var before = new { task.Status, task.ProgressPercentage, task.ActualHours };
        var previousStatus = task.Status;

        if (request.ProgressPercentage.HasValue)
        {
            task.ProgressPercentage = request.ProgressPercentage.Value;
        }

        if (request.ActualHours.HasValue)
        {
            task.ActualHours = request.ActualHours;
        }

        task.ChangeStatus(request.Status, Now);

        if (previousStatus != task.Status)
        {
            await NotifyStatusChangeAsync(task, scope, cancellationToken);
        }

        audit.Record("Task.StatusChanged", EntityName, id.ToString(), before, new { task.Status, task.ProgressPercentage, task.ActualHours });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var task = await db.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == id, cancellationToken)
                   ?? throw new NotFoundException("Task", id);
        if (!ProjectAccess.CanManageTasks(scope, task.Project))
        {
            throw new ForbiddenException(Text.Get("task.deleteForbidden"));
        }

        db.Tasks.Remove(task); // soft delete
        audit.Record("Task.Deleted", EntityName, id.ToString(), Snapshot(task));
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<TaskCommentDto> AddCommentAsync(int id, AddTaskCommentRequest request, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var task = await db.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == id, cancellationToken)
                   ?? throw new NotFoundException("Task", id);
        await EnsureVisibleAsync(scope, id, cancellationToken);

        var comment = new TaskComment { TaskItemId = id, AuthorId = scope.UserId, Content = request.Content.Trim(), CreatedAt = Now };
        db.TaskComments.Add(comment);

        var recipients = new[] { task.AssignedToId, task.AssignedById, task.Project.ProjectManagerId }
            .Where(e => e.HasValue && e != scope.EmployeeId)
            .Select(e => e!.Value);
        await notifications.NotifyEmployeesAsync(recipients, LocalizedText.Of("notify.taskComment.title", task.Title),
            LocalizedText.Of("notify.taskComment.message", scope.DisplayName, comment.Content), NotificationType.TaskComment, EntityName, id.ToString(), cancellationToken);

        audit.Record("Task.CommentAdded", EntityName, id.ToString(), newValues: new { Length = comment.Content.Length });
        await db.SaveChangesAsync(cancellationToken);

        var avatar = await db.Employees.Where(e => e.UserId == scope.UserId).Select(e => e.ProfileImagePath).FirstOrDefaultAsync(cancellationToken);
        return new TaskCommentDto(comment.Id, scope.UserId, scope.DisplayName, MediaUrls.Avatar(avatar), comment.Content, comment.CreatedAt);
    }

    public async Task<IReadOnlyList<ActivityItemDto>> GetActivityAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        await EnsureVisibleAsync(scope, id, cancellationToken);
        return await ActivityQueries.ForEntityAsync(db, EntityName, id.ToString(), 50, cancellationToken);
    }

    public async Task<int> SendDueSoonRemindersAsync(CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(Now);
        var tomorrow = today.AddDays(1);
        var due = await db.Tasks
            .Include(t => t.Project)
            .Where(t => t.AssignedToId != null && t.DueSoonNotifiedAt == null &&
                        t.DueDate >= today && t.DueDate <= tomorrow &&
                        t.Status != TaskItemStatus.Completed && t.Status != TaskItemStatus.Cancelled)
            .ToListAsync(cancellationToken);

        foreach (var task in due)
        {
            var messageKey = task.DueDate == today ? "notify.taskDueToday.message" : "notify.taskDueTomorrow.message";
            await notifications.NotifyEmployeesAsync([task.AssignedToId!.Value], LocalizedText.Of("notify.taskDueSoon.title"),
                LocalizedText.Of(messageKey, task.Title, task.Project.ProjectCode), NotificationType.TaskDueSoon,
                EntityName, task.Id.ToString(), cancellationToken);
            task.DueSoonNotifiedAt = Now;
        }

        await db.SaveChangesAsync(cancellationToken);
        return due.Count;
    }

    private async Task<IQueryable<TaskItem>> BuildQueryAsync(TaskQuery query, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var today = DateOnly.FromDateTime(Now);
        var search = query.Search?.Trim();
        var mineId = scope.EmployeeId ?? -1;

        return db.Tasks.AsNoTracking()
            .Where(ProjectAccess.VisibleTasks(scope))
            .WhereIf(query.Mine, t => t.AssignedToId == mineId)
            .WhereIf(query.ProjectId.HasValue, t => t.ProjectId == query.ProjectId)
            .WhereIf(query.AssignedToId.HasValue, t => t.AssignedToId == query.AssignedToId)
            .WhereIf(query.Status.HasValue, t => t.Status == query.Status)
            .WhereIf(query.Priority.HasValue, t => t.Priority == query.Priority)
            .WhereIf(query.DueFrom.HasValue, t => t.DueDate >= query.DueFrom)
            .WhereIf(query.DueTo.HasValue, t => t.DueDate <= query.DueTo)
            .WhereIf(query.OverdueOnly, t => t.DueDate < today && t.Status != TaskItemStatus.Completed && t.Status != TaskItemStatus.Cancelled)
            .WhereIf(!string.IsNullOrEmpty(search), t => t.Title.Contains(search!) || t.Project.ProjectCode.Contains(search!));
    }

    private IQueryable<TaskListItemDto> Project(IQueryable<TaskItem> query)
    {
        var today = DateOnly.FromDateTime(Now);
        return query.Select(t => new TaskListItemDto(
                t.Id, t.Title, t.ProjectId, t.Project.Name, t.Project.ProjectCode, t.AssignedToId,
                t.AssignedTo != null ? t.AssignedTo.FirstName + " " + t.AssignedTo.LastName : null,
                t.AssignedTo != null ? t.AssignedTo.ProfileImagePath : null,
                t.Status, t.Priority, t.DueDate, t.ProgressPercentage, t.EstimatedHours, t.ActualHours,
                t.DueDate < today && t.Status != TaskItemStatus.Completed && t.Status != TaskItemStatus.Cancelled,
                t.Comments.Count, t.CreatedAt));
    }

    private async Task EnsureVisibleAsync(UserScope scope, int taskId, CancellationToken cancellationToken)
    {
        if (!await db.Tasks.Where(t => t.Id == taskId).AnyAsync(ProjectAccess.VisibleTasks(scope), cancellationToken))
        {
            throw new ForbiddenException(Text.Get("task.noAccess"));
        }
    }

    /// <summary>
    /// Admins and project managers may assign anyone active; department managers may assign
    /// members of their department or of the project.
    /// </summary>
    private async Task EnsureAssignableAsync(UserScope scope, Project project, int? assigneeId, CancellationToken cancellationToken)
    {
        if (!assigneeId.HasValue)
        {
            return;
        }

        var assignee = await db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.Id == assigneeId, cancellationToken)
                       ?? throw new RequestValidationException("assignedToId", Text.Get("error.assigneeNotFound"));

        if (assignee.Status is EmployeeStatus.Inactive or EmployeeStatus.Terminated)
        {
            throw new RequestValidationException("assignedToId", Text.Get("task.inactiveAssignee"));
        }

        if (ProjectAccess.CanManageProject(scope, project))
        {
            return;
        }

        var isProjectMember = await db.ProjectMembers.AnyAsync(m => m.ProjectId == project.Id && m.EmployeeId == assigneeId, cancellationToken);
        if (assignee.DepartmentId != scope.DepartmentId && !isProjectMember)
        {
            throw new ForbiddenException(Text.Get("task.assignScope"));
        }
    }

    private Task NotifyAssignedAsync(TaskItem task, Project project, int assigneeId, CancellationToken cancellationToken)
    {
        var message = task.DueDate is { } due
            ? LocalizedText.Of("notify.taskAssignedDue.message", task.Title, project.Name, due)
            : LocalizedText.Of("notify.taskAssigned.message", task.Title, project.Name);
        return notifications.NotifyEmployeesAsync([assigneeId], LocalizedText.Of("notify.taskAssigned.title"), message, NotificationType.TaskAssigned, EntityName,
            task.Id == 0 ? null : task.Id.ToString(), cancellationToken);
    }

    private Task NotifyStatusChangeAsync(TaskItem task, UserScope scope, CancellationToken cancellationToken)
    {
        var recipients = new[] { task.AssignedById, task.Project.ProjectManagerId, task.AssignedToId }
            .Where(e => e.HasValue && e != scope.EmployeeId)
            .Select(e => e!.Value);
        return notifications.NotifyEmployeesAsync(recipients, LocalizedText.Of("notify.taskStatus.title"),
            LocalizedText.Of("notify.taskStatus.message", scope.DisplayName, task.Title, task.Status), NotificationType.TaskStatusChanged,
            EntityName, task.Id.ToString(), cancellationToken);
    }

    private static TaskListItemDto WithAvatar(TaskListItemDto t) => t with { AssignedToAvatarUrl = MediaUrls.Avatar(t.AssignedToAvatarUrl) };

    private bool IsOverdue(DateOnly? due, TaskItemStatus status) =>
        due < DateOnly.FromDateTime(Now) && status is not (TaskItemStatus.Completed or TaskItemStatus.Cancelled);

    private static object Snapshot(TaskItem t) => new
    {
        t.Title, t.ProjectId, t.AssignedToId, t.Status, t.Priority, t.DueDate, t.EstimatedHours, t.ActualHours, t.ProgressPercentage
    };

    private DateTime Now => clock.GetUtcNow().UtcDateTime;
}
