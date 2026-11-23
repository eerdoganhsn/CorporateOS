using System.Globalization;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using C = CorporateOS.Application.Features.Reports.ReportColumnType;

namespace CorporateOS.Application.Features.Reports;

public interface IReportService
{
    Task<ReportResult> GenerateAsync(ReportType type, ReportFilter filter, CancellationToken cancellationToken);
    ReportTable ToTable(ReportResult result);
}

public sealed class ReportService(IApplicationDbContext db, ICurrentUserService currentUser, TimeProvider clock) : IReportService
{
    private const int RowLimit = 5000;
    private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;

    public async Task<ReportResult> GenerateAsync(ReportType type, ReportFilter filter, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        if (!scope.IsManagerOrAbove)
        {
            throw new ForbiddenException("Reports are available to managers and administrators.");
        }

        if (filter.From > filter.To)
        {
            throw new RequestValidationException("to", "The end date cannot be earlier than the start date.");
        }

        string? scopeLabel = null;
        if (!scope.IsAdmin)
        {
            // Managers can only report on their own department, regardless of the requested filter.
            filter.DepartmentId = scope.DepartmentId ?? -1;
            scopeLabel = await db.Departments.Where(d => d.Id == filter.DepartmentId).Select(d => d.Name).FirstOrDefaultAsync(cancellationToken);
        }

        var result = type switch
        {
            ReportType.Employees => await EmployeesAsync(filter, cancellationToken),
            ReportType.Departments => await DepartmentsAsync(filter, cancellationToken),
            ReportType.Projects => await ProjectsAsync(filter, scope.IsManagerOrAbove, cancellationToken),
            ReportType.Tasks => await TasksAsync(filter, cancellationToken),
            ReportType.Leave => await LeaveAsync(filter, cancellationToken),
            ReportType.Expenses => await ExpensesAsync(filter, cancellationToken),
            _ => throw new NotFoundException($"Report '{type}' does not exist.")
        };

        return result with { Scope = scopeLabel ?? "All departments" };
    }

    public ReportTable ToTable(ReportResult result) =>
        new(result.Title, result.Columns.Select(c => c.Label).ToList(), result.Rows);

    private async Task<ReportResult> EmployeesAsync(ReportFilter f, CancellationToken ct)
    {
        var status = ParseEnum<EmployeeStatus>(f.Status);
        var employees = db.Employees.AsNoTracking()
            .WhereIf(f.DepartmentId.HasValue, e => e.DepartmentId == f.DepartmentId)
            .WhereIf(f.EmployeeId.HasValue, e => e.Id == f.EmployeeId)
            .WhereIf(status.HasValue, e => e.Status == status)
            .WhereIf(f.From.HasValue, e => e.HireDate >= f.From)
            .WhereIf(f.To.HasValue, e => e.HireDate <= f.To);

        var rows = await employees.OrderBy(e => e.Department.Name).ThenBy(e => e.LastName)
            .Take(RowLimit)
            .Select(e => new
            {
                e.EmployeeNumber, Name = e.FirstName + " " + e.LastName, e.Email, Department = e.Department.Name,
                Position = e.Position.Title, e.EmploymentType, e.Status, e.HireDate,
                Manager = e.Manager != null ? e.Manager.FirstName + " " + e.Manager.LastName : null
            })
            .ToListAsync(ct);

        var byDepartment = rows.GroupBy(r => r.Department).Select(g => new ChartPoint(g.Key, g.Count())).OrderByDescending(p => p.Value).ToList();
        var byType = rows.GroupBy(r => r.EmploymentType).ToDictionary(g => g.Key, g => g.Count());

        return Build("Employee Report", "Headcount and employment details (hire date filters apply to the date range).",
            [Col("employeeNumber", "Employee #"), Col("name", "Name"), Col("email", "Email"), Col("department", "Department"),
             Col("position", "Position"), Col("employmentType", "Type", C.Status), Col("status", "Status", C.Status),
             Col("hireDate", "Hire date", C.Date), Col("manager", "Manager")],
            rows.Select(r => Row(r.EmployeeNumber, r.Name, r.Email, r.Department, r.Position, r.EmploymentType.ToString(), r.Status.ToString(), r.HireDate, r.Manager)),
            [
                new("Employees", rows.Count.ToString(Invariant)),
                new("Active", rows.Count(r => r.Status == EmployeeStatus.Active).ToString(Invariant)),
                new("Full-time", byType.GetValueOrDefault(EmploymentType.FullTime).ToString(Invariant)),
                new("Contractors & interns", (byType.GetValueOrDefault(EmploymentType.Contractor) + byType.GetValueOrDefault(EmploymentType.Intern)).ToString(Invariant))
            ],
            "Employees by department", byDepartment);
    }

    private async Task<ReportResult> DepartmentsAsync(ReportFilter f, CancellationToken ct)
    {
        var (from, to) = Range(f);
        var today = Today;
        var open = new[] { TaskItemStatus.Todo, TaskItemStatus.InProgress, TaskItemStatus.Review };
        var approved = new[] { ExpenseStatus.Approved, ExpenseStatus.Paid };

        var rows = await db.Departments.AsNoTracking()
            .WhereIf(f.DepartmentId.HasValue, d => d.Id == f.DepartmentId)
            .OrderBy(d => d.Name)
            .Select(d => new
            {
                d.Name, d.Code,
                Manager = d.Manager != null ? d.Manager.FirstName + " " + d.Manager.LastName : null,
                Employees = d.Employees.Count(e => e.Status == EmployeeStatus.Active || e.Status == EmployeeStatus.OnLeave),
                ActiveProjects = d.Projects.Count(p => !p.IsArchived && p.Status == ProjectStatus.Active),
                OpenTasks = db.Tasks.Count(t => t.AssignedTo!.DepartmentId == d.Id && open.Contains(t.Status)),
                OverdueTasks = db.Tasks.Count(t => t.AssignedTo!.DepartmentId == d.Id && open.Contains(t.Status) && t.DueDate < today),
                LeaveDays = db.LeaveRequests.Where(l => l.Employee.DepartmentId == d.Id && l.Status == LeaveRequestStatus.Approved && l.StartDate >= from && l.StartDate <= to)
                    .Sum(l => (int?)l.TotalDays) ?? 0,
                Expenses = db.Expenses.Where(e => e.Employee.DepartmentId == d.Id && approved.Contains(e.Status) && e.ExpenseDate >= from && e.ExpenseDate <= to)
                    .Sum(e => (decimal?)e.Amount) ?? 0
            })
            .ToListAsync(ct);

        return Build("Department Report", $"Department overview. Leave and expenses cover {from:yyyy-MM-dd} to {to:yyyy-MM-dd}.",
            [Col("name", "Department"), Col("code", "Code"), Col("manager", "Manager"), Col("employees", "Employees", C.Number),
             Col("activeProjects", "Active projects", C.Number), Col("openTasks", "Open tasks", C.Number),
             Col("overdueTasks", "Overdue tasks", C.Number), Col("leaveDays", "Leave days", C.Number), Col("expenses", "Approved expenses", C.Currency)],
            rows.Select(r => Row(r.Name, r.Code, r.Manager, r.Employees, r.ActiveProjects, r.OpenTasks, r.OverdueTasks, r.LeaveDays, r.Expenses)),
            [
                new("Departments", rows.Count.ToString(Invariant)),
                new("Employees", rows.Sum(r => r.Employees).ToString(Invariant)),
                new("Open tasks", rows.Sum(r => r.OpenTasks).ToString(Invariant)),
                new("Approved expenses", rows.Sum(r => r.Expenses).ToString("N2", Invariant))
            ],
            "Employees per department", rows.Select(r => new ChartPoint(r.Name, r.Employees)).ToList());
    }

    private async Task<ReportResult> ProjectsAsync(ReportFilter f, bool showBudget, CancellationToken ct)
    {
        var status = ParseEnum<ProjectStatus>(f.Status);
        var today = Today;
        var rows = await db.Projects.AsNoTracking()
            .WhereIf(f.DepartmentId.HasValue, p => p.DepartmentId == f.DepartmentId)
            .WhereIf(f.ProjectId.HasValue, p => p.Id == f.ProjectId)
            .WhereIf(status.HasValue, p => p.Status == status)
            .WhereIf(f.From.HasValue, p => p.EndDate == null || p.EndDate >= f.From)
            .WhereIf(f.To.HasValue, p => p.StartDate <= f.To)
            .OrderBy(p => p.ProjectCode)
            .Take(RowLimit)
            .Select(p => new
            {
                p.ProjectCode, p.Name, p.Status, p.Priority,
                Manager = p.ProjectManager != null ? p.ProjectManager.FirstName + " " + p.ProjectManager.LastName : null,
                Department = p.Department != null ? p.Department.Name : null,
                p.StartDate, p.EndDate, p.ProgressPercentage, p.Budget,
                Tasks = p.Tasks.Count,
                Completed = p.Tasks.Count(t => t.Status == TaskItemStatus.Completed),
                Overdue = p.Tasks.Count(t => t.DueDate < today && t.Status != TaskItemStatus.Completed && t.Status != TaskItemStatus.Cancelled)
            })
            .ToListAsync(ct);

        var columns = new List<ReportColumn>
        {
            Col("code", "Code"), Col("name", "Project"), Col("status", "Status", C.Status), Col("priority", "Priority", C.Status),
            Col("manager", "Project manager"), Col("department", "Department"), Col("startDate", "Start", C.Date), Col("endDate", "End", C.Date),
            Col("progress", "Progress", C.Percent), Col("tasks", "Tasks", C.Number), Col("completed", "Completed", C.Number), Col("overdue", "Overdue", C.Number)
        };
        if (showBudget)
        {
            columns.Add(Col("budget", "Budget", C.Currency));
        }

        return Build("Project Report", "Portfolio status, schedule and delivery progress.", columns,
            rows.Select(r =>
            {
                var values = new List<object?> { r.ProjectCode, r.Name, r.Status.ToString(), r.Priority.ToString(), r.Manager, r.Department,
                    r.StartDate, r.EndDate, r.ProgressPercentage, r.Tasks, r.Completed, r.Overdue };
                if (showBudget)
                {
                    values.Add(r.Budget);
                }

                return (IReadOnlyList<object?>)values;
            }),
            [
                new("Projects", rows.Count.ToString(Invariant)),
                new("Active", rows.Count(r => r.Status == ProjectStatus.Active).ToString(Invariant)),
                new("Average progress", rows.Count == 0 ? "0%" : $"{rows.Average(r => r.ProgressPercentage):0}%"),
                new("Overdue tasks", rows.Sum(r => r.Overdue).ToString(Invariant))
            ],
            "Projects by status", rows.GroupBy(r => r.Status).Select(g => new ChartPoint(g.Key.ToString(), g.Count())).ToList());
    }

    private async Task<ReportResult> TasksAsync(ReportFilter f, CancellationToken ct)
    {
        var (from, to) = Range(f);
        var fromDt = from.ToDateTime(TimeOnly.MinValue);
        var toDt = to.ToDateTime(TimeOnly.MaxValue);
        var today = Today;

        var tasks = db.Tasks.AsNoTracking()
            .Where(t => t.AssignedToId != null && t.CreatedAt >= fromDt && t.CreatedAt <= toDt)
            .WhereIf(f.DepartmentId.HasValue, t => t.AssignedTo!.DepartmentId == f.DepartmentId)
            .WhereIf(f.EmployeeId.HasValue, t => t.AssignedToId == f.EmployeeId)
            .WhereIf(f.ProjectId.HasValue, t => t.ProjectId == f.ProjectId);

        var rows = await tasks
            .GroupBy(t => new { t.AssignedToId, t.AssignedTo!.FirstName, t.AssignedTo.LastName, Department = t.AssignedTo.Department.Name })
            .Select(g => new
            {
                Name = g.Key.FirstName + " " + g.Key.LastName,
                g.Key.Department,
                Assigned = g.Count(),
                Completed = g.Count(t => t.Status == TaskItemStatus.Completed),
                OnTime = g.Count(t => t.Status == TaskItemStatus.Completed &&
                                      (t.DueDate == null || (t.CompletedAt != null && DateOnly.FromDateTime(t.CompletedAt.Value) <= t.DueDate))),
                Overdue = g.Count(t => t.DueDate < today && t.Status != TaskItemStatus.Completed && t.Status != TaskItemStatus.Cancelled),
                Hours = g.Sum(t => t.ActualHours ?? 0)
            })
            .OrderByDescending(r => r.Completed)
            .Take(RowLimit)
            .ToListAsync(ct);

        var byStatus = await tasks.GroupBy(t => t.Status).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);
        var totalAssigned = rows.Sum(r => r.Assigned);
        var totalCompleted = rows.Sum(r => r.Completed);

        return Build("Task Completion Report", $"Tasks created between {from:yyyy-MM-dd} and {to:yyyy-MM-dd}, grouped by assignee.",
            [Col("name", "Assignee"), Col("department", "Department"), Col("assigned", "Assigned", C.Number), Col("completed", "Completed", C.Number),
             Col("onTime", "Completed on time", C.Number), Col("overdue", "Overdue", C.Number), Col("completionRate", "Completion rate", C.Percent),
             Col("hours", "Logged hours", C.Number)],
            rows.Select(r => Row(r.Name, r.Department, r.Assigned, r.Completed, r.OnTime, r.Overdue,
                r.Assigned == 0 ? 0 : (int)Math.Round(100.0 * r.Completed / r.Assigned), r.Hours)),
            [
                new("Tasks", totalAssigned.ToString(Invariant)),
                new("Completed", totalCompleted.ToString(Invariant)),
                new("Completion rate", totalAssigned == 0 ? "0%" : $"{100.0 * totalCompleted / totalAssigned:0}%"),
                new("Overdue", rows.Sum(r => r.Overdue).ToString(Invariant))
            ],
            "Tasks by status", byStatus.Select(s => new ChartPoint(s.Key.ToString(), s.Count)).ToList());
    }

    private async Task<ReportResult> LeaveAsync(ReportFilter f, CancellationToken ct)
    {
        var (from, to) = Range(f);
        var status = ParseEnum<LeaveRequestStatus>(f.Status);
        var rows = await db.LeaveRequests.AsNoTracking()
            .Where(l => l.StartDate <= to && l.EndDate >= from)
            .WhereIf(f.DepartmentId.HasValue, l => l.Employee.DepartmentId == f.DepartmentId)
            .WhereIf(f.EmployeeId.HasValue, l => l.EmployeeId == f.EmployeeId)
            .WhereIf(status.HasValue, l => l.Status == status)
            .OrderBy(l => l.StartDate)
            .Take(RowLimit)
            .Select(l => new
            {
                Employee = l.Employee.FirstName + " " + l.Employee.LastName, Department = l.Employee.Department.Name,
                l.LeaveType, l.StartDate, l.EndDate, l.TotalDays, l.Status,
                ApprovedBy = l.ApprovedBy != null ? l.ApprovedBy.FirstName + " " + l.ApprovedBy.LastName : null
            })
            .ToListAsync(ct);

        var approvedRows = rows.Where(r => r.Status == LeaveRequestStatus.Approved).ToList();
        return Build("Leave Report", $"Leave overlapping {from:yyyy-MM-dd} to {to:yyyy-MM-dd}.",
            [Col("employee", "Employee"), Col("department", "Department"), Col("leaveType", "Type", C.Status), Col("startDate", "Start", C.Date),
             Col("endDate", "End", C.Date), Col("totalDays", "Days", C.Number), Col("status", "Status", C.Status), Col("approvedBy", "Decided by")],
            rows.Select(r => Row(r.Employee, r.Department, r.LeaveType.ToString(), r.StartDate, r.EndDate, r.TotalDays, r.Status.ToString(), r.ApprovedBy)),
            [
                new("Requests", rows.Count.ToString(Invariant)),
                new("Approved days", approvedRows.Sum(r => r.TotalDays).ToString(Invariant)),
                new("Pending", rows.Count(r => r.Status == LeaveRequestStatus.Pending).ToString(Invariant)),
                new("Rejected", rows.Count(r => r.Status == LeaveRequestStatus.Rejected).ToString(Invariant))
            ],
            "Approved days by leave type",
            approvedRows.GroupBy(r => r.LeaveType).Select(g => new ChartPoint(g.Key.ToString(), g.Sum(r => r.TotalDays))).ToList());
    }

    private async Task<ReportResult> ExpensesAsync(ReportFilter f, CancellationToken ct)
    {
        var (from, to) = Range(f);
        var status = ParseEnum<ExpenseStatus>(f.Status);
        var rows = await db.Expenses.AsNoTracking()
            .Where(e => e.Status != ExpenseStatus.Draft && e.ExpenseDate >= from && e.ExpenseDate <= to)
            .WhereIf(f.DepartmentId.HasValue, e => e.Employee.DepartmentId == f.DepartmentId)
            .WhereIf(f.EmployeeId.HasValue, e => e.EmployeeId == f.EmployeeId)
            .WhereIf(status.HasValue, e => e.Status == status)
            .OrderBy(e => e.ExpenseDate)
            .Take(RowLimit)
            .Select(e => new
            {
                e.ExpenseDate, Employee = e.Employee.FirstName + " " + e.Employee.LastName, Department = e.Employee.Department.Name,
                e.Category, e.Description, e.Amount, e.Currency, e.Status
            })
            .ToListAsync(ct);

        var counted = rows.Where(r => r.Status is ExpenseStatus.Approved or ExpenseStatus.Paid).ToList();
        var groupBy = f.GroupBy?.Trim().ToLowerInvariant() ?? "month";
        var chart = (groupBy switch
            {
                "department" => counted.GroupBy(r => r.Department),
                "employee" => counted.GroupBy(r => r.Employee),
                "category" => counted.GroupBy(r => r.Category.ToString()),
                _ => counted.GroupBy(r => r.ExpenseDate.ToString("yyyy-MM", Invariant))
            })
            .Select(g => new ChartPoint(g.Key, g.Sum(r => r.Amount)))
            .OrderBy(p => groupBy == "month" ? p.Label : null)
            .ThenByDescending(p => groupBy == "month" ? 0 : p.Value)
            .ToList();

        var summary = new List<ReportSummaryItem>
        {
            new("Claims", rows.Count.ToString(Invariant)),
            new("Awaiting approval", rows.Count(r => r.Status == ExpenseStatus.Submitted).ToString(Invariant))
        };
        summary.AddRange(counted.GroupBy(r => r.Currency).Select(g => new ReportSummaryItem($"Approved ({g.Key})", g.Sum(r => r.Amount).ToString("N2", Invariant))));

        var chartTitle = groupBy switch
        {
            "department" => "Approved amount by department",
            "employee" => "Approved amount by employee",
            "category" => "Approved amount by category",
            _ => "Approved amount by month"
        };

        return Build("Expense Report", $"Submitted claims dated {from:yyyy-MM-dd} to {to:yyyy-MM-dd}. Chart totals combine currencies.",
            [Col("expenseDate", "Date", C.Date), Col("employee", "Employee"), Col("department", "Department"), Col("category", "Category", C.Status),
             Col("description", "Description"), Col("amount", "Amount", C.Currency), Col("currency", "Currency"), Col("status", "Status", C.Status)],
            rows.Select(r => Row(r.ExpenseDate, r.Employee, r.Department, r.Category.ToString(), r.Description, r.Amount, r.Currency, r.Status.ToString())),
            summary, chartTitle, chart);
    }

    private ReportResult Build(
        string title,
        string description,
        IReadOnlyList<ReportColumn> columns,
        IEnumerable<IReadOnlyList<object?>> rows,
        IReadOnlyList<ReportSummaryItem> summary,
        string? chartTitle,
        IReadOnlyList<ChartPoint> chart) =>
        new(title, description, columns, rows.ToList(), summary, chartTitle, chart, clock.GetUtcNow().UtcDateTime, null);

    private (DateOnly From, DateOnly To) Range(ReportFilter f)
    {
        var to = f.To ?? Today;
        var from = f.From ?? new DateOnly(to.Year, 1, 1);
        return (from, to);
    }

    private static ReportColumn Col(string key, string label, C type = C.Text) => new(key, label, type);

    private static IReadOnlyList<object?> Row(params object?[] values) => values;

    private static TEnum? ParseEnum<TEnum>(string? value) where TEnum : struct, Enum =>
        Enum.TryParse<TEnum>(value, ignoreCase: true, out var parsed) ? parsed : null;

    private DateOnly Today => DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
}
