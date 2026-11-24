using System.Globalization;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
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
            throw new ForbiddenException(Text.Get("report.forbidden"));
        }

        if (filter.From > filter.To)
        {
            throw new RequestValidationException("to", Text.Get("report.endBeforeStart"));
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
            _ => throw new NotFoundException("Report", type)
        };

        return result with { Scope = scopeLabel ?? Text.Get("report.allDepartments") };
    }

    /// <summary>Flattens a report for CSV/Excel export; enum cells become their translated names.</summary>
    public ReportTable ToTable(ReportResult result) =>
        new(result.Title,
            result.Columns.Select(c => c.Label).ToList(),
            result.Rows.Select(row => (IReadOnlyList<object?>)row.Select(v => v is Enum e ? Text.Enum(e) : v).ToList()).ToList());

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

        return Build(Text.Get("report.employees.title"), Text.Get("report.employees.description"),
            [Col("employeeNumber"), Col("name"), Col("email"), Col("department"),
             Col("position"), Col("employmentType", C.Status), Col("status", C.Status),
             Col("hireDate", C.Date), Col("manager")],
            rows.Select(r => Row(r.EmployeeNumber, r.Name, r.Email, r.Department, r.Position, r.EmploymentType, r.Status, r.HireDate, r.Manager)),
            [
                Sum("employees", Count(rows.Count)),
                Sum("active", Count(rows.Count(r => r.Status == EmployeeStatus.Active))),
                Sum("fullTime", Count(byType.GetValueOrDefault(EmploymentType.FullTime))),
                Sum("contractorsInterns", Count(byType.GetValueOrDefault(EmploymentType.Contractor) + byType.GetValueOrDefault(EmploymentType.Intern)))
            ],
            Text.Get("report.employees.chart"), byDepartment);
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

        return Build(Text.Get("report.departments.title"), Text.Get("report.departments.description", from, to),
            [Col("name", label: "department"), Col("code"), Col("manager"), Col("employees", C.Number),
             Col("activeProjects", C.Number), Col("openTasks", C.Number),
             Col("overdueTasks", C.Number), Col("leaveDays", C.Number), Col("expenses", C.Currency)],
            rows.Select(r => Row(r.Name, r.Code, r.Manager, r.Employees, r.ActiveProjects, r.OpenTasks, r.OverdueTasks, r.LeaveDays, r.Expenses)),
            [
                Sum("departments", Count(rows.Count)),
                Sum("employees", Count(rows.Sum(r => r.Employees))),
                Sum("openTasks", Count(rows.Sum(r => r.OpenTasks))),
                Sum("approvedExpenses", rows.Sum(r => r.Expenses).ToString("N2", Culture))
            ],
            Text.Get("report.departments.chart"), rows.Select(r => new ChartPoint(r.Name, r.Employees)).ToList());
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
            Col("code"), Col("name", label: "project"), Col("status", C.Status), Col("priority", C.Status),
            Col("manager", label: "projectManager"), Col("department"), Col("startDate", C.Date), Col("endDate", C.Date),
            Col("progress", C.Percent), Col("tasks", C.Number), Col("completed", C.Number), Col("overdue", C.Number)
        };
        if (showBudget)
        {
            columns.Add(Col("budget", C.Currency));
        }

        return Build(Text.Get("report.projects.title"), Text.Get("report.projects.description"), columns,
            rows.Select(r =>
            {
                var values = new List<object?> { r.ProjectCode, r.Name, r.Status, r.Priority, r.Manager, r.Department,
                    r.StartDate, r.EndDate, r.ProgressPercentage, r.Tasks, r.Completed, r.Overdue };
                if (showBudget)
                {
                    values.Add(r.Budget);
                }

                return (IReadOnlyList<object?>)values;
            }),
            [
                Sum("projects", Count(rows.Count)),
                Sum("active", Count(rows.Count(r => r.Status == ProjectStatus.Active))),
                Sum("averageProgress", Percent(rows.Count == 0 ? 0 : rows.Average(r => r.ProgressPercentage))),
                Sum("overdueTasks", Count(rows.Sum(r => r.Overdue)))
            ],
            Text.Get("report.projects.chart"), rows.GroupBy(r => r.Status).Select(g => new ChartPoint(Text.Enum(g.Key), g.Count())).ToList());
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

        return Build(Text.Get("report.tasks.title"), Text.Get("report.tasks.description", from, to),
            [Col("name", label: "assignee"), Col("department"), Col("assigned", C.Number), Col("completed", C.Number),
             Col("onTime", C.Number), Col("overdue", C.Number), Col("completionRate", C.Percent),
             Col("hours", C.Number)],
            rows.Select(r => Row(r.Name, r.Department, r.Assigned, r.Completed, r.OnTime, r.Overdue,
                r.Assigned == 0 ? 0 : (int)Math.Round(100.0 * r.Completed / r.Assigned), r.Hours)),
            [
                Sum("tasks", Count(totalAssigned)),
                Sum("completed", Count(totalCompleted)),
                Sum("completionRate", Percent(totalAssigned == 0 ? 0 : 100.0 * totalCompleted / totalAssigned)),
                Sum("overdue", Count(rows.Sum(r => r.Overdue)))
            ],
            Text.Get("report.tasks.chart"), byStatus.Select(s => new ChartPoint(Text.Enum(s.Key), s.Count)).ToList());
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
        return Build(Text.Get("report.leave.title"), Text.Get("report.leave.description", from, to),
            [Col("employee"), Col("department"), Col("leaveType", C.Status), Col("startDate", C.Date),
             Col("endDate", C.Date), Col("totalDays", C.Number), Col("status", C.Status), Col("approvedBy")],
            rows.Select(r => Row(r.Employee, r.Department, r.LeaveType, r.StartDate, r.EndDate, r.TotalDays, r.Status, r.ApprovedBy)),
            [
                Sum("requests", Count(rows.Count)),
                Sum("approvedDays", Count(approvedRows.Sum(r => r.TotalDays))),
                Sum("pending", Count(rows.Count(r => r.Status == LeaveRequestStatus.Pending))),
                Sum("rejected", Count(rows.Count(r => r.Status == LeaveRequestStatus.Rejected)))
            ],
            Text.Get("report.leave.chart"),
            approvedRows.GroupBy(r => r.LeaveType).Select(g => new ChartPoint(Text.Enum(g.Key), g.Sum(r => r.TotalDays))).ToList());
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
                "category" => counted.GroupBy(r => Text.Enum(r.Category)),
                _ => counted.GroupBy(r => r.ExpenseDate.ToString("yyyy-MM", Invariant))
            })
            .Select(g => new ChartPoint(g.Key, g.Sum(r => r.Amount)))
            .OrderBy(p => groupBy == "month" ? p.Label : null)
            .ThenByDescending(p => groupBy == "month" ? 0 : p.Value)
            .ToList();

        var summary = new List<ReportSummaryItem>
        {
            Sum("claims", Count(rows.Count)),
            Sum("awaitingApproval", Count(rows.Count(r => r.Status == ExpenseStatus.Submitted)))
        };
        summary.AddRange(counted.GroupBy(r => r.Currency).Select(g => new ReportSummaryItem(Text.Get("report.sum.approvedIn", g.Key), g.Sum(r => r.Amount).ToString("N2", Culture))));

        var chartTitle = groupBy switch
        {
            "department" => Text.Get("report.expenses.chart.department"),
            "employee" => Text.Get("report.expenses.chart.employee"),
            "category" => Text.Get("report.expenses.chart.category"),
            _ => Text.Get("report.expenses.chart.month")
        };

        return Build(Text.Get("report.expenses.title"), Text.Get("report.expenses.description", from, to),
            [Col("expenseDate", C.Date), Col("employee"), Col("department"), Col("category", C.Status),
             Col("description"), Col("amount", C.Currency), Col("currency"), Col("status", C.Status)],
            rows.Select(r => Row(r.ExpenseDate, r.Employee, r.Department, r.Category, r.Description, r.Amount, r.Currency, r.Status)),
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

    /// <summary>Column whose header is <c>report.col.&lt;label ?? key&gt;</c> in the request language.</summary>
    private static ReportColumn Col(string key, C type = C.Text, string? label = null) =>
        new(key, Text.Get($"report.col.{label ?? key}"), type);

    private static ReportSummaryItem Sum(string key, string value) => new(Text.Get($"report.sum.{key}"), value);

    private static string Count(int value) => value.ToString(Culture);

    private static string Percent(double value) => (value / 100).ToString("P0", Culture);

    private static CultureInfo Culture => Languages.Culture(Languages.Current);

    private static IReadOnlyList<object?> Row(params object?[] values) => values;

    private static TEnum? ParseEnum<TEnum>(string? value) where TEnum : struct, Enum =>
        Enum.TryParse<TEnum>(value, ignoreCase: true, out var parsed) ? parsed : null;

    private DateOnly Today => DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
}
