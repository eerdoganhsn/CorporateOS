using CorporateOS.Application.Common.Activity;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Common.Options;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Projects;

public interface IProjectService
{
    Task<PagedResult<ProjectListItemDto>> ListAsync(ProjectQuery query, CancellationToken cancellationToken);
    Task<ProjectDetailDto> GetAsync(int id, CancellationToken cancellationToken);
    Task<ProjectDetailDto> CreateAsync(SaveProjectRequest request, CancellationToken cancellationToken);
    Task<ProjectDetailDto> UpdateAsync(int id, SaveProjectRequest request, CancellationToken cancellationToken);
    Task<ProjectDetailDto> SetArchivedAsync(int id, bool archived, CancellationToken cancellationToken);
    Task<ProjectDetailDto> AddMemberAsync(int id, AddProjectMemberRequest request, CancellationToken cancellationToken);
    Task RemoveMemberAsync(int id, int employeeId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ActivityItemDto>> GetActivityAsync(int id, CancellationToken cancellationToken);
}

public sealed class ProjectService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IAuditService audit,
    INotificationPublisher notifications,
    TimeProvider clock) : IProjectService
{
    // Sorting is applied to the entity before projection so EF Core can translate it.
    private static readonly IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<Project, object?>>> Sort =
        SortMap.For<Project>(
            ("name", p => p.Name),
            ("code", p => p.ProjectCode),
            ("status", p => p.Status),
            // Enums are stored as strings, so rank explicitly instead of sorting alphabetically.
            ("priority", p => p.Priority == Priority.Critical ? 4 : p.Priority == Priority.High ? 3 : p.Priority == Priority.Medium ? 2 : 1),
            ("startDate", p => p.StartDate),
            ("endDate", p => p.EndDate),
            ("progress", p => p.ProgressPercentage));

    public async Task<PagedResult<ProjectListItemDto>> ListAsync(ProjectQuery query, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var showBudget = scope.IsManagerOrAbove;
        var search = query.Search?.Trim();

        return await db.Projects.AsNoTracking()
            .Where(ProjectAccess.VisibleProjects(scope))
            .WhereIf(!query.IncludeArchived, p => !p.IsArchived)
            .WhereIf(query.Status.HasValue, p => p.Status == query.Status)
            .WhereIf(query.Priority.HasValue, p => p.Priority == query.Priority)
            .WhereIf(query.DepartmentId.HasValue, p => p.DepartmentId == query.DepartmentId)
            .WhereIf(query.ProjectManagerId.HasValue, p => p.ProjectManagerId == query.ProjectManagerId)
            .WhereIf(!string.IsNullOrEmpty(search), p => p.Name.Contains(search!) || p.ProjectCode.Contains(search!))
            .ApplySort(query, Sort, "name")
            .Select(p => new ProjectListItemDto(
                p.Id, p.Name, p.ProjectCode, p.Status, p.Priority, p.StartDate, p.EndDate, p.ProgressPercentage,
                p.ProjectManagerId,
                p.ProjectManager != null ? p.ProjectManager.FirstName + " " + p.ProjectManager.LastName : null,
                p.DepartmentId,
                p.Department != null ? p.Department.Name : null,
                p.Members.Count,
                p.Tasks.Count(t => t.Status != TaskItemStatus.Completed && t.Status != TaskItemStatus.Cancelled),
                showBudget ? p.Budget : null,
                p.IsArchived))
            .ToPagedResultAsync(query, cancellationToken);
    }

    public async Task<ProjectDetailDto> GetAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var project = await db.Projects.AsNoTracking()
            .Include(p => p.ProjectManager).ThenInclude(m => m!.Position)
            .Include(p => p.Department)
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken)
            ?? throw new NotFoundException("Project", id);

        if (!await db.Projects.Where(p => p.Id == id).AnyAsync(ProjectAccess.VisibleProjects(scope), cancellationToken))
        {
            throw new ForbiddenException("You do not have access to this project.");
        }

        var members = await db.ProjectMembers.AsNoTracking()
            .Where(m => m.ProjectId == id)
            .OrderBy(m => m.Employee.FirstName)
            .Select(m => new ProjectMemberDto(
                m.EmployeeId, m.Employee.FirstName + " " + m.Employee.LastName, m.Employee.EmployeeNumber,
                m.Employee.Position.Title, m.Employee.Department.Name, m.Role, m.JoinedAt, m.Employee.ProfileImagePath))
            .ToListAsync(cancellationToken);

        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        var counts = await db.Tasks.AsNoTracking()
            .Where(t => t.ProjectId == id)
            .GroupBy(t => t.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var overdue = await db.Tasks.CountAsync(t => t.ProjectId == id && t.DueDate < today &&
            t.Status != TaskItemStatus.Completed && t.Status != TaskItemStatus.Cancelled, cancellationToken);
        int Count(TaskItemStatus status) => counts.FirstOrDefault(c => c.Status == status)?.Count ?? 0;

        var canViewBudget = ProjectAccess.CanViewBudget(scope, project);
        decimal? actualCost = null;
        if (canViewBudget)
        {
            // Approximate cost: approved/paid expenses of project members during the project period.
            var memberIds = members.Select(m => m.EmployeeId).ToList();
            var end = project.EndDate ?? today;
            actualCost = await db.Expenses
                .Where(e => memberIds.Contains(e.EmployeeId) && e.ExpenseDate >= project.StartDate && e.ExpenseDate <= end &&
                            (e.Status == ExpenseStatus.Approved || e.Status == ExpenseStatus.Paid) &&
                            (e.Category == ExpenseCategory.Travel || e.Category == ExpenseCategory.Equipment || e.Category == ExpenseCategory.Accommodation))
                .SumAsync(e => (decimal?)e.Amount, cancellationToken) ?? 0;
        }

        return new ProjectDetailDto(
            project.Id, project.Name, project.ProjectCode, project.Description, project.Status, project.Priority,
            project.StartDate, project.EndDate, project.ProgressPercentage,
            canViewBudget ? project.Budget : null, canViewBudget, actualCost,
            project.ProjectManager is null ? null : new EmployeeSummaryDto(
                project.ProjectManager.Id, project.ProjectManager.FullName, project.ProjectManager.EmployeeNumber,
                project.ProjectManager.Email, project.ProjectManager.Position.Title, MediaUrls.Avatar(project.ProjectManager.ProfileImagePath)),
            project.DepartmentId, project.Department?.Name, project.IsArchived,
            members.Select(m => m with { AvatarUrl = MediaUrls.Avatar(m.AvatarUrl) }).ToList(),
            new ProjectTaskStats(counts.Sum(c => c.Count), Count(TaskItemStatus.Todo), Count(TaskItemStatus.InProgress),
                Count(TaskItemStatus.Review), Count(TaskItemStatus.Completed), Count(TaskItemStatus.Cancelled), overdue),
            ProjectAccess.CanManageProject(scope, project),
            ProjectAccess.CanManageTasks(scope, project),
            project.CreatedAt, project.UpdatedAt);
    }

    public async Task<ProjectDetailDto> CreateAsync(SaveProjectRequest request, CancellationToken cancellationToken)
    {
        await ValidateAsync(request, null, cancellationToken);

        var project = new Project();
        Apply(project, request, includeRestricted: true);
        db.Projects.Add(project);
        await db.SaveChangesAsync(cancellationToken);

        if (project.ProjectManagerId is { } managerId)
        {
            db.ProjectMembers.Add(new ProjectMember { ProjectId = project.Id, EmployeeId = managerId, Role = "Project Manager", JoinedAt = Now });
            await notifications.NotifyEmployeesAsync([managerId], "You are managing a new project",
                $"You were assigned as project manager of {project.Name} ({project.ProjectCode}).",
                NotificationType.ProjectAssignment, nameof(Project), project.Id.ToString(), cancellationToken);
        }

        audit.Record("Project.Created", nameof(Project), project.Id.ToString(), newValues: Snapshot(project));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(project.Id, cancellationToken);
    }

    public async Task<ProjectDetailDto> UpdateAsync(int id, SaveProjectRequest request, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id, cancellationToken)
                      ?? throw new NotFoundException("Project", id);
        if (!ProjectAccess.CanManageProject(scope, project))
        {
            throw new ForbiddenException("Only administrators and the project manager can edit this project.");
        }

        await ValidateAsync(request, id, cancellationToken);
        var before = Snapshot(project);
        var previousManager = project.ProjectManagerId;

        // Budget, ownership and department are administrative decisions.
        Apply(project, request, includeRestricted: scope.IsAdmin);

        if (project.ProjectManagerId != previousManager && project.ProjectManagerId is { } newManager)
        {
            if (!await db.ProjectMembers.AnyAsync(m => m.ProjectId == id && m.EmployeeId == newManager, cancellationToken))
            {
                db.ProjectMembers.Add(new ProjectMember { ProjectId = id, EmployeeId = newManager, Role = "Project Manager", JoinedAt = Now });
            }

            await notifications.NotifyEmployeesAsync([newManager], "Project manager assignment",
                $"You are now the project manager of {project.Name}.", NotificationType.ProjectAssignment,
                nameof(Project), id.ToString(), cancellationToken);
        }

        audit.Record("Project.Updated", nameof(Project), id.ToString(), before, Snapshot(project));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<ProjectDetailDto> SetArchivedAsync(int id, bool archived, CancellationToken cancellationToken)
    {
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id, cancellationToken)
                      ?? throw new NotFoundException("Project", id);
        if (project.IsArchived == archived)
        {
            return await GetAsync(id, cancellationToken);
        }

        project.IsArchived = archived;
        project.ArchivedAt = archived ? Now : null;
        audit.Record(archived ? "Project.Archived" : "Project.Restored", nameof(Project), id.ToString());
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<ProjectDetailDto> AddMemberAsync(int id, AddProjectMemberRequest request, CancellationToken cancellationToken)
    {
        var project = await GetManageableAsync(id, cancellationToken);
        var employee = await db.Employees.FirstOrDefaultAsync(e => e.Id == request.EmployeeId, cancellationToken)
                       ?? throw new RequestValidationException("employeeId", "The selected employee does not exist.");

        if (employee.Status is EmployeeStatus.Terminated or EmployeeStatus.Inactive)
        {
            throw new Domain.Exceptions.DomainException("Inactive employees cannot be added to a project.");
        }

        if (await db.ProjectMembers.AnyAsync(m => m.ProjectId == id && m.EmployeeId == request.EmployeeId, cancellationToken))
        {
            throw new ConflictException($"{employee.FullName} is already a member of this project.");
        }

        var role = string.IsNullOrWhiteSpace(request.Role) ? "Member" : request.Role.Trim();
        db.ProjectMembers.Add(new ProjectMember { ProjectId = id, EmployeeId = employee.Id, Role = role, JoinedAt = Now });
        await notifications.NotifyEmployeesAsync([employee.Id], "Added to project",
            $"You were added to {project.Name} as {role}.", NotificationType.ProjectAssignment,
            nameof(Project), id.ToString(), cancellationToken);
        audit.Record("Project.MemberAdded", nameof(Project), id.ToString(), newValues: new { EmployeeId = employee.Id, employee.FirstName, employee.LastName, Role = role });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task RemoveMemberAsync(int id, int employeeId, CancellationToken cancellationToken)
    {
        var project = await GetManageableAsync(id, cancellationToken);
        var member = await db.ProjectMembers.Include(m => m.Employee)
                         .FirstOrDefaultAsync(m => m.ProjectId == id && m.EmployeeId == employeeId, cancellationToken)
                     ?? throw new NotFoundException("Project member", employeeId);

        if (project.ProjectManagerId == employeeId)
        {
            throw new Domain.Exceptions.DomainException("Assign a different project manager before removing this member.");
        }

        db.ProjectMembers.Remove(member);
        await notifications.NotifyEmployeesAsync([employeeId], "Removed from project",
            $"You are no longer a member of {project.Name}.", NotificationType.ProjectAssignment,
            nameof(Project), id.ToString(), cancellationToken);
        audit.Record("Project.MemberRemoved", nameof(Project), id.ToString(), new { EmployeeId = employeeId, member.Employee.FirstName, member.Employee.LastName });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ActivityItemDto>> GetActivityAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        if (!await db.Projects.Where(p => p.Id == id).AnyAsync(ProjectAccess.VisibleProjects(scope), cancellationToken))
        {
            throw new ForbiddenException("You do not have access to this project.");
        }

        var projectId = id.ToString();
        var taskIds = db.Tasks.IgnoreQueryFilters().Where(t => t.ProjectId == id).Select(t => t.Id.ToString());
        return await ActivityQueries.Project(db.AuditLogs.AsNoTracking()
                .Where(a => (a.EntityName == nameof(Project) && a.EntityId == projectId) ||
                            (a.EntityName == "Task" && taskIds.Contains(a.EntityId!))))
            .Take(50)
            .ToListAsync(cancellationToken);
    }

    private async Task<Project> GetManageableAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id, cancellationToken)
                      ?? throw new NotFoundException("Project", id);
        if (!ProjectAccess.CanManageProject(scope, project))
        {
            throw new ForbiddenException("Only administrators and the project manager can change project membership.");
        }

        return project;
    }

    private async Task ValidateAsync(SaveProjectRequest request, int? excludeId, CancellationToken cancellationToken)
    {
        var code = request.ProjectCode.Trim().ToUpperInvariant();
        if (await db.Projects.AnyAsync(p => p.ProjectCode == code && p.Id != excludeId, cancellationToken))
        {
            throw new ConflictException($"Project code '{code}' is already in use.");
        }

        if (request.ProjectManagerId.HasValue && !await db.Employees.AnyAsync(e => e.Id == request.ProjectManagerId, cancellationToken))
        {
            throw new RequestValidationException("projectManagerId", "The selected project manager does not exist.");
        }

        if (request.DepartmentId.HasValue && !await db.Departments.AnyAsync(d => d.Id == request.DepartmentId, cancellationToken))
        {
            throw new RequestValidationException("departmentId", "The selected department does not exist.");
        }
    }

    private static void Apply(Project project, SaveProjectRequest request, bool includeRestricted)
    {
        project.Name = request.Name.Trim();
        project.ProjectCode = request.ProjectCode.Trim().ToUpperInvariant();
        project.Description = request.Description?.Trim();
        project.StartDate = request.StartDate;
        project.EndDate = request.EndDate;
        project.Status = request.Status;
        project.Priority = request.Priority;
        project.ProgressPercentage = request.Status == ProjectStatus.Completed ? 100 : request.ProgressPercentage;

        if (includeRestricted)
        {
            project.Budget = request.Budget;
            project.ProjectManagerId = request.ProjectManagerId;
            project.DepartmentId = request.DepartmentId;
        }
    }

    private static object Snapshot(Project p) => new
    {
        p.Name, p.ProjectCode, p.Status, p.Priority, p.StartDate, p.EndDate, p.Budget,
        p.ProgressPercentage, p.ProjectManagerId, p.DepartmentId
    };

    private DateTime Now => clock.GetUtcNow().UtcDateTime;
}
