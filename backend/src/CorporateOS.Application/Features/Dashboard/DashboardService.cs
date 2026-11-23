using System.Globalization;
using CorporateOS.Application.Common.Activity;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Features.Announcements;
using CorporateOS.Application.Features.Expenses;
using CorporateOS.Application.Features.Leave;
using CorporateOS.Application.Features.Notifications;
using CorporateOS.Application.Features.Projects;
using CorporateOS.Application.Features.Reports;
using CorporateOS.Application.Features.Tasks;
using CorporateOS.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Dashboard;

public interface IDashboardService
{
    Task<AdminDashboardDto> GetAdminAsync(CancellationToken cancellationToken);
    Task<ManagerDashboardDto> GetManagerAsync(CancellationToken cancellationToken);
    Task<EmployeeDashboardDto> GetEmployeeAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Role-specific dashboards. Widgets reuse the module services where possible so that every
/// number follows the same authorization rules as the page it links to.
/// </summary>
public sealed class DashboardService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    ITaskService tasks,
    ILeaveService leave,
    IExpenseService expenses,
    IAnnouncementService announcements,
    INotificationService notifications,
    TimeProvider clock) : IDashboardService
{
    private static readonly TaskItemStatus[] OpenStatuses = [TaskItemStatus.Todo, TaskItemStatus.InProgress, TaskItemStatus.Review];

    public async Task<AdminDashboardDto> GetAdminAsync(CancellationToken cancellationToken)
    {
        var today = Today;
        var stats = new AdminStatsDto(
            await db.Employees.CountAsync(e => e.Status != EmployeeStatus.Terminated, cancellationToken),
            await db.Employees.CountAsync(e => e.Status == EmployeeStatus.Active, cancellationToken),
            await db.Departments.CountAsync(d => d.Status == RecordStatus.Active, cancellationToken),
            await db.Projects.CountAsync(p => !p.IsArchived && p.Status == ProjectStatus.Active, cancellationToken),
            await db.LeaveRequests.CountAsync(l => l.Status == LeaveRequestStatus.Pending, cancellationToken),
            await db.Expenses.CountAsync(e => e.Status == ExpenseStatus.Submitted, cancellationToken),
            await db.Tasks.CountAsync(t => OpenStatuses.Contains(t.Status), cancellationToken),
            await db.Tasks.CountAsync(t => OpenStatuses.Contains(t.Status) && t.DueDate < today, cancellationToken));

        var byDepartment = await db.Departments.AsNoTracking()
            .Where(d => d.Status == RecordStatus.Active)
            .Select(d => new ChartPoint(d.Name, d.Employees.Count(e => e.Status != EmployeeStatus.Terminated)))
            .ToListAsync(cancellationToken);

        var projectsByStatus = (await db.Projects.AsNoTracking().Where(p => !p.IsArchived)
                .GroupBy(p => p.Status).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(cancellationToken))
            .Select(g => new ChartPoint(g.Key.ToString(), g.Count)).ToList();

        var tasksByStatus = await TasksByStatusAsync(db.Tasks.AsNoTracking(), cancellationToken);

        var start = new DateOnly(today.Year, today.Month, 1).AddMonths(-11);
        var expenseMonths = await db.Expenses.AsNoTracking()
            .Where(e => (e.Status == ExpenseStatus.Approved || e.Status == ExpenseStatus.Paid) && e.ExpenseDate >= start)
            .GroupBy(e => new { e.ExpenseDate.Year, e.ExpenseDate.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Total = g.Sum(e => e.Amount) })
            .ToListAsync(cancellationToken);
        var leaveMonths = await db.LeaveRequests.AsNoTracking()
            .Where(l => l.Status == LeaveRequestStatus.Approved && l.StartDate >= start)
            .GroupBy(l => new { l.StartDate.Year, l.StartDate.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Days = g.Sum(l => l.TotalDays) })
            .ToListAsync(cancellationToken);

        var months = Enumerable.Range(0, 12).Select(start.AddMonths).ToList();
        var monthlyExpenses = months.Select(m => new ChartPoint(MonthLabel(m),
            expenseMonths.FirstOrDefault(x => x.Year == m.Year && x.Month == m.Month)?.Total ?? 0)).ToList();
        var leaveTrend = months.Select(m => new ChartPoint(MonthLabel(m),
            leaveMonths.FirstOrDefault(x => x.Year == m.Year && x.Month == m.Month)?.Days ?? 0)).ToList();

        var activity = await ActivityQueries.Project(db.AuditLogs.AsNoTracking()
                .Where(a => !a.Action.StartsWith("Auth.") && a.EntityName != "SystemSetting" && a.EntityName != "User"))
            .Take(10)
            .ToListAsync(cancellationToken);

        return new AdminDashboardDto(stats, byDepartment, projectsByStatus, tasksByStatus, monthlyExpenses, leaveTrend, activity,
            (await announcements.ListAsync(new AnnouncementQuery { PageSize = 5 }, cancellationToken)).Items,
            await PendingApprovalsAsync(cancellationToken),
            await DeadlinesAsync(cancellationToken));
    }

    public async Task<ManagerDashboardDto> GetManagerAsync(CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var departmentId = scope.DepartmentId ?? throw new ForbiddenException("Your account is not linked to a department.");
        var today = Today;
        var thirtyDaysAgo = Now.AddDays(-30);

        var department = await db.Departments.AsNoTracking().Where(d => d.Id == departmentId)
            .Select(d => new { d.Id, d.Name }).FirstAsync(cancellationToken);

        var deptTasks = db.Tasks.AsNoTracking().Where(t => t.AssignedTo!.DepartmentId == departmentId || t.Project.DepartmentId == departmentId);

        var team = await db.Employees.AsNoTracking()
            .Where(e => e.DepartmentId == departmentId && e.Status != EmployeeStatus.Terminated)
            .OrderBy(e => e.FirstName)
            .Select(e => new TeamMemberPerformanceDto(
                e.Id, e.FirstName + " " + e.LastName, e.Position.Title,
                e.AssignedTasks.Count(t => OpenStatuses.Contains(t.Status)),
                e.AssignedTasks.Count(t => t.Status == TaskItemStatus.Completed && t.CompletedAt >= thirtyDaysAgo),
                e.AssignedTasks.Count(t => OpenStatuses.Contains(t.Status) && t.DueDate < today)))
            .ToListAsync(cancellationToken);

        var weekStart = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        return new ManagerDashboardDto(
            department.Id,
            department.Name,
            team.Count,
            await db.Projects.CountAsync(p => p.DepartmentId == departmentId && !p.IsArchived && p.Status == ProjectStatus.Active, cancellationToken),
            await deptTasks.CountAsync(t => OpenStatuses.Contains(t.Status), cancellationToken),
            await deptTasks.CountAsync(t => OpenStatuses.Contains(t.Status) && t.DueDate < today, cancellationToken),
            await db.LeaveRequests.CountAsync(l => l.Status == LeaveRequestStatus.Pending && l.Employee.DepartmentId == departmentId && l.EmployeeId != scope.EmployeeId, cancellationToken),
            await db.Expenses.CountAsync(e => e.Status == ExpenseStatus.Submitted && e.Employee.DepartmentId == departmentId && e.EmployeeId != scope.EmployeeId, cancellationToken),
            await TasksByStatusAsync(deptTasks, cancellationToken),
            team,
            await PendingApprovalsAsync(cancellationToken),
            await DeadlinesAsync(cancellationToken),
            await leave.GetCalendarAsync(weekStart, weekStart.AddDays(6), departmentId, cancellationToken));
    }

    public async Task<EmployeeDashboardDto> GetEmployeeAsync(CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var employeeId = scope.EmployeeId ?? -1;
        var today = Today;
        var thirtyDaysAgo = Now.AddDays(-30);
        var mine = db.Tasks.AsNoTracking().Where(t => t.AssignedToId == employeeId);

        var myTasks = await tasks.ListAsync(new TaskQuery { Mine = true, PageSize = 6, SortBy = "dueDate" }, cancellationToken);

        return new EmployeeDashboardDto(
            await mine.CountAsync(t => OpenStatuses.Contains(t.Status), cancellationToken),
            await mine.CountAsync(t => OpenStatuses.Contains(t.Status) && t.DueDate < today, cancellationToken),
            await mine.CountAsync(t => t.Status == TaskItemStatus.Completed && t.CompletedAt >= thirtyDaysAgo, cancellationToken),
            scope.EmployeeId.HasValue ? (await leave.GetMySummaryAsync(null, cancellationToken)).Balance : null,
            myTasks.Items.Where(t => OpenStatuses.Contains(t.Status)).ToList(),
            (await leave.ListAsync(new LeaveQuery { Scope = RequestListScope.Mine, PageSize = 5, SortBy = "createdAt", SortDirection = "desc" }, cancellationToken)).Items,
            (await expenses.ListAsync(new ExpenseQuery { Scope = RequestListScope.Mine, PageSize = 5, SortBy = "createdAt", SortDirection = "desc" }, cancellationToken)).Items,
            (await announcements.ListAsync(new AnnouncementQuery { PageSize = 5 }, cancellationToken)).Items,
            (await notifications.ListAsync(new NotificationQuery { PageSize = 5 }, cancellationToken)).Items,
            await DeadlinesAsync(cancellationToken, mineOnly: true));
    }

    private async Task<IReadOnlyList<PendingApprovalDto>> PendingApprovalsAsync(CancellationToken cancellationToken)
    {
        var leaveItems = await leave.ListAsync(new LeaveQuery { Scope = RequestListScope.Approvals, PageSize = 6 }, cancellationToken);
        var expenseItems = await expenses.ListAsync(new ExpenseQuery { Scope = RequestListScope.Approvals, PageSize = 6 }, cancellationToken);

        return leaveItems.Items
            .Select(l => new PendingApprovalDto("Leave", l.Id, l.EmployeeName,
                $"{l.LeaveType} · {l.TotalDays} day(s) from {l.StartDate:MMM d}", l.CreatedAt))
            .Concat(expenseItems.Items.Select(e => new PendingApprovalDto("Expense", e.Id, e.EmployeeName,
                $"{e.Category} · {e.Amount.ToString("N2", CultureInfo.InvariantCulture)} {e.Currency}", e.SubmittedAt ?? e.CreatedAt)))
            .OrderBy(p => p.SubmittedAt)
            .Take(8)
            .ToList();
    }

    private async Task<IReadOnlyList<DeadlineDto>> DeadlinesAsync(CancellationToken cancellationToken, bool mineOnly = false)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var today = Today;
        var horizon = today.AddDays(14);

        var taskQuery = db.Tasks.AsNoTracking()
            .Where(ProjectAccess.VisibleTasks(scope))
            .Where(t => OpenStatuses.Contains(t.Status) && t.DueDate != null && t.DueDate <= horizon && t.DueDate >= today.AddDays(-7));
        if (mineOnly)
        {
            var employeeId = scope.EmployeeId ?? -1;
            taskQuery = taskQuery.Where(t => t.AssignedToId == employeeId);
        }

        var taskDeadlines = await taskQuery.OrderBy(t => t.DueDate).Take(8)
            .Select(t => new DeadlineDto("Task", t.Id, t.Title, t.Project.ProjectCode, t.DueDate!.Value, t.DueDate < today))
            .ToListAsync(cancellationToken);

        var projectDeadlines = mineOnly
            ? []
            : await db.Projects.AsNoTracking()
                .Where(ProjectAccess.VisibleProjects(scope))
                .Where(p => !p.IsArchived && p.Status != ProjectStatus.Completed && p.Status != ProjectStatus.Cancelled &&
                            p.EndDate != null && p.EndDate <= horizon && p.EndDate >= today)
                .OrderBy(p => p.EndDate).Take(4)
                .Select(p => new DeadlineDto("Project", p.Id, p.Name, p.ProjectCode, p.EndDate!.Value, false))
                .ToListAsync(cancellationToken);

        return taskDeadlines.Concat(projectDeadlines).OrderBy(d => d.DueDate).Take(10).ToList();
    }

    private static async Task<IReadOnlyList<ChartPoint>> TasksByStatusAsync(IQueryable<Domain.Entities.TaskItem> query, CancellationToken cancellationToken)
    {
        var counts = await query.GroupBy(t => t.Status).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(cancellationToken);
        return Enum.GetValues<TaskItemStatus>()
            .Select(s => new ChartPoint(s.ToString(), counts.FirstOrDefault(c => c.Key == s)?.Count ?? 0))
            .ToList();
    }

    private static string MonthLabel(DateOnly month) => month.ToString("MMM yy", CultureInfo.InvariantCulture);

    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    private DateOnly Today => DateOnly.FromDateTime(Now);
}
