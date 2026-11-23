using CorporateOS.Application.Features.Announcements;
using CorporateOS.Application.Features.Expenses;
using CorporateOS.Application.Features.Leave;
using CorporateOS.Application.Features.Notifications;
using CorporateOS.Application.Features.Reports;
using CorporateOS.Application.Features.Tasks;
using CorporateOS.Application.Common.Models;

namespace CorporateOS.Application.Features.Dashboard;

public sealed record PendingApprovalDto(string Type, int Id, string EmployeeName, string Summary, DateTime SubmittedAt);

public sealed record DeadlineDto(string Type, int Id, string Title, string? Context, DateOnly DueDate, bool IsOverdue);

public sealed record AdminStatsDto(
    int TotalEmployees,
    int ActiveEmployees,
    int Departments,
    int ActiveProjects,
    int PendingLeaveRequests,
    int PendingExpenses,
    int OpenTasks,
    int OverdueTasks);

public sealed record AdminDashboardDto(
    AdminStatsDto Stats,
    IReadOnlyList<ChartPoint> EmployeesByDepartment,
    IReadOnlyList<ChartPoint> ProjectsByStatus,
    IReadOnlyList<ChartPoint> TasksByStatus,
    IReadOnlyList<ChartPoint> MonthlyExpenses,
    IReadOnlyList<ChartPoint> LeaveUsageTrend,
    IReadOnlyList<ActivityItemDto> RecentActivity,
    IReadOnlyList<AnnouncementDto> RecentAnnouncements,
    IReadOnlyList<PendingApprovalDto> PendingApprovals,
    IReadOnlyList<DeadlineDto> UpcomingDeadlines);

public sealed record TeamMemberPerformanceDto(int EmployeeId, string Name, string? PositionTitle, int OpenTasks, int CompletedLast30Days, int OverdueTasks);

public sealed record ManagerDashboardDto(
    int DepartmentId,
    string DepartmentName,
    int EmployeeCount,
    int ActiveProjects,
    int OpenTasks,
    int OverdueTasks,
    int PendingLeaveApprovals,
    int PendingExpenseApprovals,
    IReadOnlyList<ChartPoint> TasksByStatus,
    IReadOnlyList<TeamMemberPerformanceDto> TeamPerformance,
    IReadOnlyList<PendingApprovalDto> PendingApprovals,
    IReadOnlyList<DeadlineDto> UpcomingDeadlines,
    IReadOnlyList<LeaveCalendarEntryDto> OnLeaveThisWeek);

public sealed record EmployeeDashboardDto(
    int OpenTasks,
    int OverdueTasks,
    int CompletedTasksLast30Days,
    LeaveBalanceDto? LeaveBalance,
    IReadOnlyList<TaskListItemDto> MyTasks,
    IReadOnlyList<LeaveRequestDto> RecentLeaveRequests,
    IReadOnlyList<ExpenseDto> RecentExpenses,
    IReadOnlyList<AnnouncementDto> Announcements,
    IReadOnlyList<NotificationDto> Notifications,
    IReadOnlyList<DeadlineDto> UpcomingDeadlines);
