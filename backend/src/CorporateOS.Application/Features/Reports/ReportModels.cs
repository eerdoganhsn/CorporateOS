namespace CorporateOS.Application.Features.Reports;

public enum ReportType
{
    Employees = 1,
    Departments = 2,
    Projects = 3,
    Tasks = 4,
    Leave = 5,
    Expenses = 6
}

public enum ReportColumnType
{
    Text = 1,
    Number = 2,
    Currency = 3,
    Date = 4,
    Percent = 5,
    Status = 6
}

public enum ReportFormat
{
    Json = 1,
    Csv = 2,
    Xlsx = 3
}

/// <summary>Common report filters. Managers are always restricted to their own department.</summary>
public sealed class ReportFilter
{
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    public int? DepartmentId { get; set; }
    public int? EmployeeId { get; set; }
    public int? ProjectId { get; set; }
    public string? Status { get; set; }

    /// <summary>Expenses only: Month, Department, Employee or Category.</summary>
    public string? GroupBy { get; set; }

    public ReportFormat Format { get; set; } = ReportFormat.Json;
}

public sealed record ReportColumn(string Key, string Label, ReportColumnType Type);

public sealed record ReportSummaryItem(string Label, string Value);

public sealed record ChartPoint(string Label, decimal Value);

public sealed record ReportResult(
    string Title,
    string Description,
    IReadOnlyList<ReportColumn> Columns,
    IReadOnlyList<IReadOnlyList<object?>> Rows,
    IReadOnlyList<ReportSummaryItem> Summary,
    string? ChartTitle,
    IReadOnlyList<ChartPoint> Chart,
    DateTime GeneratedAt,
    string? Scope);
