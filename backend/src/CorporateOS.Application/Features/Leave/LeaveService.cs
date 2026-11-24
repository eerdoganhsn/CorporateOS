using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Common.Options;
using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Exceptions;
using CorporateOS.Domain.Localization;
using CorporateOS.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Leave;

public interface ILeaveService
{
    Task<PagedResult<LeaveRequestDto>> ListAsync(LeaveQuery query, CancellationToken cancellationToken);
    Task<LeaveRequestDto> GetAsync(int id, CancellationToken cancellationToken);
    Task<LeaveRequestDto> CreateAsync(CreateLeaveRequest request, CancellationToken cancellationToken);
    Task<LeaveRequestDto> ApproveAsync(int id, ApproveLeaveRequest request, CancellationToken cancellationToken);
    Task<LeaveRequestDto> RejectAsync(int id, RejectLeaveRequest request, CancellationToken cancellationToken);
    Task<LeaveRequestDto> CancelAsync(int id, CancellationToken cancellationToken);
    Task<MyLeaveSummaryDto> GetMySummaryAsync(int? year, CancellationToken cancellationToken);
    Task<PagedResult<LeaveBalanceDto>> ListBalancesAsync(LeaveBalanceQuery query, CancellationToken cancellationToken);
    Task<LeaveBalanceDto> UpdateBalanceAsync(int employeeId, int year, UpdateLeaveBalanceRequest request, CancellationToken cancellationToken);
    Task<IReadOnlyList<LeaveCalendarEntryDto>> GetCalendarAsync(DateOnly from, DateOnly to, int? departmentId, CancellationToken cancellationToken);
}

public sealed class LeaveService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    ISettingsService settings,
    IAuditService audit,
    INotificationPublisher notifications,
    TimeProvider clock) : ILeaveService
{
    private const string EntityName = nameof(LeaveRequest);

    private static readonly IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<LeaveRequest, object?>>> Sort =
        SortMap.For<LeaveRequest>(
            ("startDate", l => l.StartDate),
            ("createdAt", l => l.CreatedAt),
            ("employee", l => l.Employee.LastName),
            ("totalDays", l => l.TotalDays),
            ("status", l => l.Status),
            ("leaveType", l => l.LeaveType));

    public async Task<PagedResult<LeaveRequestDto>> ListAsync(LeaveQuery query, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var requests = Visible(scope);

        requests = query.Scope switch
        {
            RequestListScope.Mine => requests.Where(l => l.EmployeeId == (scope.EmployeeId ?? -1)),
            RequestListScope.Approvals => scope.IsManagerOrAbove
                ? requests.Where(l => l.Status == LeaveRequestStatus.Pending && l.EmployeeId != scope.EmployeeId)
                : requests.Where(_ => false),
            _ => requests
        };

        var search = query.Search?.Trim();
        requests = requests
            .WhereIf(query.EmployeeId.HasValue, l => l.EmployeeId == query.EmployeeId)
            .WhereIf(query.DepartmentId.HasValue, l => l.Employee.DepartmentId == query.DepartmentId)
            .WhereIf(query.Status.HasValue, l => l.Status == query.Status)
            .WhereIf(query.LeaveType.HasValue, l => l.LeaveType == query.LeaveType)
            .WhereIf(query.From.HasValue, l => l.EndDate >= query.From)
            .WhereIf(query.To.HasValue, l => l.StartDate <= query.To)
            .WhereIf(!string.IsNullOrEmpty(search), l =>
                (l.Employee.FirstName + " " + l.Employee.LastName).Contains(search!) || l.Employee.EmployeeNumber.Contains(search!));

        var page = await Project(requests.ApplySort(query, Sort, query.Scope == RequestListScope.Approvals ? "createdAt" : "startDate", query.Scope != RequestListScope.Approvals))
            .ToPagedResultAsync(query, cancellationToken);

        return new PagedResult<LeaveRequestDto>
        {
            Items = page.Items.Select(r => Decorate(r, scope)).ToList(),
            Page = page.Page,
            PageSize = page.PageSize,
            TotalItems = page.TotalItems
        };
    }

    public async Task<LeaveRequestDto> GetAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var dto = await Project(Visible(scope).Where(l => l.Id == id)).FirstOrDefaultAsync(cancellationToken);
        if (dto is null)
        {
            throw await db.LeaveRequests.AnyAsync(l => l.Id == id, cancellationToken)
                ? new ForbiddenException(Text.Get("leave.noAccess"))
                : new NotFoundException("LeaveRequest", id);
        }

        return Decorate(dto, scope);
    }

    public async Task<LeaveRequestDto> CreateAsync(CreateLeaveRequest request, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var employeeId = request.EmployeeId ?? scope.RequireEmployeeId();
        if (employeeId != scope.EmployeeId && !scope.IsAdmin)
        {
            throw new ForbiddenException(Text.Get("leave.onBehalfForbidden"));
        }

        var employee = await db.Employees.Include(e => e.Department)
                           .FirstOrDefaultAsync(e => e.Id == employeeId, cancellationToken)
                       ?? throw new RequestValidationException("employeeId", Text.Get("error.employeeNotFound"));

        var totalDays = LeaveDayCalculator.CountWorkingDays(request.StartDate, request.EndDate);
        if (totalDays == 0)
        {
            throw new RequestValidationException("endDate", Text.Get("leave.noWorkingDays"));
        }

        var overlaps = await db.LeaveRequests.AnyAsync(l =>
            l.EmployeeId == employeeId &&
            (l.Status == LeaveRequestStatus.Pending || l.Status == LeaveRequestStatus.Approved) &&
            l.StartDate <= request.EndDate && request.StartDate <= l.EndDate, cancellationToken);
        if (overlaps)
        {
            throw new ConflictException(Text.Get("leave.overlap"));
        }

        if (request.LeaveType == LeaveType.AnnualLeave)
        {
            var balance = await EnsureBalanceAsync(employeeId, request.StartDate.Year, cancellationToken);
            var pending = await PendingAnnualDaysAsync(employeeId, request.StartDate.Year, cancellationToken);
            var available = balance.TotalDays - balance.UsedDays - pending;
            if (totalDays > available)
            {
                throw new DomainException(Text.Get("leave.insufficientBalance", available, totalDays));
            }
        }

        var leave = new LeaveRequest
        {
            EmployeeId = employeeId,
            LeaveType = request.LeaveType,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            TotalDays = totalDays,
            Reason = request.Reason?.Trim()
        };
        db.LeaveRequests.Add(leave);
        await db.SaveChangesAsync(cancellationToken);

        var approvers = new[] { employee.ManagerId, employee.Department.ManagerId }
            .Where(id => id.HasValue && id != employeeId).Select(id => id!.Value);
        await notifications.NotifyEmployeesAsync(approvers, LocalizedText.Of("notify.leaveSubmitted.title"),
            LocalizedText.Of("notify.leaveSubmitted.message", employee.FullName, totalDays, request.LeaveType, request.StartDate, request.EndDate),
            NotificationType.LeaveSubmitted, EntityName, leave.Id.ToString(), cancellationToken);

        audit.Record("Leave.Submitted", EntityName, leave.Id.ToString(), newValues: new
        {
            leave.EmployeeId, leave.LeaveType, leave.StartDate, leave.EndDate, leave.TotalDays
        });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(leave.Id, cancellationToken);
    }

    public async Task<LeaveRequestDto> ApproveAsync(int id, ApproveLeaveRequest request, CancellationToken cancellationToken)
    {
        var (scope, leave) = await LoadForDecisionAsync(id, cancellationToken);
        var approverId = scope.RequireEmployeeId();

        if (leave.LeaveType == LeaveType.AnnualLeave)
        {
            var balance = await EnsureBalanceAsync(leave.EmployeeId, leave.StartDate.Year, cancellationToken);
            if (balance.TotalDays - balance.UsedDays < leave.TotalDays)
            {
                throw new DomainException(Text.Get("leave.balanceNoLongerEnough"));
            }

            balance.UsedDays += leave.TotalDays;
        }

        leave.Approve(approverId, request.Note?.Trim(), Now);

        await notifications.NotifyEmployeesAsync([leave.EmployeeId], LocalizedText.Of("notify.leaveApproved.title"),
            LocalizedText.Of("notify.leaveApproved.message", leave.LeaveType, leave.StartDate, leave.EndDate),
            NotificationType.LeaveApproved, EntityName, id.ToString(), cancellationToken);
        audit.Record("Leave.Approved", EntityName, id.ToString(), new { Status = LeaveRequestStatus.Pending },
            new { leave.Status, leave.ApprovalNote, leave.TotalDays });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<LeaveRequestDto> RejectAsync(int id, RejectLeaveRequest request, CancellationToken cancellationToken)
    {
        var (scope, leave) = await LoadForDecisionAsync(id, cancellationToken);
        leave.Reject(scope.RequireEmployeeId(), request.Reason.Trim(), Now);

        await notifications.NotifyEmployeesAsync([leave.EmployeeId], LocalizedText.Of("notify.leaveRejected.title"),
            LocalizedText.Of("notify.leaveRejected.message", leave.LeaveType, leave.StartDate, leave.EndDate, leave.RejectionReason),
            NotificationType.LeaveRejected, EntityName, id.ToString(), cancellationToken);
        audit.Record("Leave.Rejected", EntityName, id.ToString(), new { Status = LeaveRequestStatus.Pending },
            new { leave.Status, leave.RejectionReason });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<LeaveRequestDto> CancelAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var leave = await db.LeaveRequests.FirstOrDefaultAsync(l => l.Id == id, cancellationToken)
                    ?? throw new NotFoundException("LeaveRequest", id);

        if (leave.EmployeeId != scope.EmployeeId && !scope.IsAdmin)
        {
            throw new ForbiddenException(Text.Get("leave.ownCancelOnly"));
        }

        leave.Cancel();
        audit.Record("Leave.Cancelled", EntityName, id.ToString(), new { Status = LeaveRequestStatus.Pending }, new { leave.Status });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<MyLeaveSummaryDto> GetMySummaryAsync(int? year, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var employeeId = scope.RequireEmployeeId();
        var targetYear = year ?? Now.Year;

        var balance = await EnsureBalanceAsync(employeeId, targetYear, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        var pending = await PendingAnnualDaysAsync(employeeId, targetYear, cancellationToken);
        var employee = await db.Employees.AsNoTracking().Where(e => e.Id == employeeId)
            .Select(e => new { Name = e.FirstName + " " + e.LastName, Department = e.Department.Name })
            .FirstAsync(cancellationToken);

        var yearStart = new DateOnly(targetYear, 1, 1);
        var yearEnd = new DateOnly(targetYear, 12, 31);
        var usage = await db.LeaveRequests.AsNoTracking()
            .Where(l => l.EmployeeId == employeeId && l.StartDate >= yearStart && l.StartDate <= yearEnd &&
                        (l.Status == LeaveRequestStatus.Approved || l.Status == LeaveRequestStatus.Pending))
            .GroupBy(l => new { l.LeaveType, l.Status })
            .Select(g => new { g.Key.LeaveType, g.Key.Status, Days = g.Sum(l => l.TotalDays) })
            .ToListAsync(cancellationToken);

        var byType = Enum.GetValues<LeaveType>()
            .Select(t => new LeaveTypeUsageDto(t,
                usage.Where(u => u.LeaveType == t && u.Status == LeaveRequestStatus.Approved).Sum(u => u.Days),
                usage.Where(u => u.LeaveType == t && u.Status == LeaveRequestStatus.Pending).Sum(u => u.Days)))
            .ToList();

        return new MyLeaveSummaryDto(
            new LeaveBalanceDto(employeeId, employee.Name, employee.Department, targetYear, balance.TotalDays, balance.UsedDays, pending,
                balance.TotalDays - balance.UsedDays),
            byType);
    }

    public async Task<PagedResult<LeaveBalanceDto>> ListBalancesAsync(LeaveBalanceQuery query, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        if (!scope.IsManagerOrAbove)
        {
            throw new ForbiddenException();
        }

        var year = query.Year ?? Now.Year;
        var search = query.Search?.Trim();
        var defaultDays = await settings.GetIntAsync(SettingKeys.DefaultAnnualLeaveDays, cancellationToken);

        // Employees without a balance row for the year are shown with the default allowance.
        return await db.Employees.AsNoTracking()
            .Where(e => e.Status != EmployeeStatus.Terminated)
            .WhereIf(!scope.IsAdmin, e => e.DepartmentId == scope.DepartmentId)
            .WhereIf(query.DepartmentId.HasValue, e => e.DepartmentId == query.DepartmentId)
            .WhereIf(!string.IsNullOrEmpty(search), e => (e.FirstName + " " + e.LastName).Contains(search!))
            .OrderBy(e => e.FirstName).ThenBy(e => e.LastName)
            .Select(e => new
            {
                e.Id,
                Name = e.FirstName + " " + e.LastName,
                Department = e.Department.Name,
                Balance = e.LeaveBalances.FirstOrDefault(b => b.Year == year),
                Pending = e.LeaveRequests.Where(l => l.Status == LeaveRequestStatus.Pending && l.LeaveType == LeaveType.AnnualLeave && l.StartDate.Year == year)
                    .Sum(l => (int?)l.TotalDays) ?? 0
            })
            .Select(x => new LeaveBalanceDto(
                x.Id, x.Name, x.Department, year,
                x.Balance != null ? x.Balance.TotalDays : defaultDays,
                x.Balance != null ? x.Balance.UsedDays : 0,
                x.Pending,
                x.Balance != null ? x.Balance.TotalDays - x.Balance.UsedDays : defaultDays))
            .ToPagedResultAsync(query, cancellationToken);
    }

    public async Task<LeaveBalanceDto> UpdateBalanceAsync(int employeeId, int year, UpdateLeaveBalanceRequest request, CancellationToken cancellationToken)
    {
        var employee = await db.Employees.Include(e => e.Department).FirstOrDefaultAsync(e => e.Id == employeeId, cancellationToken)
                       ?? throw new NotFoundException("Employee", employeeId);
        var balance = await EnsureBalanceAsync(employeeId, year, cancellationToken);

        if (request.TotalDays < balance.UsedDays)
        {
            throw new DomainException(Text.Get("leave.totalBelowUsed", balance.UsedDays));
        }

        var before = balance.TotalDays;
        balance.TotalDays = request.TotalDays;
        audit.Record("LeaveBalance.Adjusted", nameof(LeaveBalance), $"{employeeId}-{year}", new { TotalDays = before }, new { request.TotalDays });
        await db.SaveChangesAsync(cancellationToken);

        var pending = await PendingAnnualDaysAsync(employeeId, year, cancellationToken);
        return new LeaveBalanceDto(employeeId, employee.FullName, employee.Department.Name, year, balance.TotalDays, balance.UsedDays, pending,
            balance.TotalDays - balance.UsedDays);
    }

    public async Task<IReadOnlyList<LeaveCalendarEntryDto>> GetCalendarAsync(DateOnly from, DateOnly to, int? departmentId, CancellationToken cancellationToken)
    {
        if (to < from || to.DayNumber - from.DayNumber > 93)
        {
            throw new RequestValidationException("to", Text.Get("leave.calendarRange"));
        }

        var scope = await currentUser.GetScopeAsync(cancellationToken);
        return await Visible(scope)
            .Where(l => (l.Status == LeaveRequestStatus.Approved || l.Status == LeaveRequestStatus.Pending) &&
                        l.StartDate <= to && l.EndDate >= from)
            .WhereIf(departmentId.HasValue, l => l.Employee.DepartmentId == departmentId)
            .OrderBy(l => l.StartDate)
            .Select(l => new LeaveCalendarEntryDto(l.Id, l.EmployeeId, l.Employee.FirstName + " " + l.Employee.LastName,
                l.Employee.Department.Name, l.LeaveType, l.StartDate, l.EndDate, l.TotalDays, l.Status))
            .ToListAsync(cancellationToken);
    }

    private IQueryable<LeaveRequest> Visible(UserScope scope)
    {
        var requests = db.LeaveRequests.AsNoTracking();
        if (scope.IsAdmin)
        {
            return requests;
        }

        var employeeId = scope.EmployeeId ?? -1;
        var departmentId = scope.DepartmentId ?? -1;
        return scope.IsManager
            ? requests.Where(l => l.EmployeeId == employeeId || l.Employee.DepartmentId == departmentId)
            : requests.Where(l => l.EmployeeId == employeeId);
    }

    private async Task<(UserScope Scope, LeaveRequest Leave)> LoadForDecisionAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var leave = await db.LeaveRequests.Include(l => l.Employee).FirstOrDefaultAsync(l => l.Id == id, cancellationToken)
                    ?? throw new NotFoundException("LeaveRequest", id);

        if (!CanDecide(scope, leave.EmployeeId, leave.Employee.DepartmentId))
        {
            throw new ForbiddenException(Text.Get("leave.ownDepartmentOnly"));
        }

        return (scope, leave);
    }

    private static bool CanDecide(UserScope scope, int employeeId, int departmentId) =>
        employeeId != scope.EmployeeId && (scope.IsAdmin || scope.ManagesDepartment(departmentId));

    private async Task<LeaveBalance> EnsureBalanceAsync(int employeeId, int year, CancellationToken cancellationToken)
    {
        var balance = await db.LeaveBalances.FirstOrDefaultAsync(b => b.EmployeeId == employeeId && b.Year == year, cancellationToken)
                      ?? db.LeaveBalances.Local.FirstOrDefault(b => b.EmployeeId == employeeId && b.Year == year);
        if (balance is not null)
        {
            return balance;
        }

        var total = await settings.GetIntAsync(SettingKeys.DefaultAnnualLeaveDays, cancellationToken);
        if (await settings.GetBoolAsync(SettingKeys.CarryoverEnabled, cancellationToken))
        {
            var previous = await db.LeaveBalances.AsNoTracking()
                .FirstOrDefaultAsync(b => b.EmployeeId == employeeId && b.Year == year - 1, cancellationToken);
            if (previous is not null)
            {
                var maxCarry = await settings.GetIntAsync(SettingKeys.MaxCarryoverDays, cancellationToken);
                total += Math.Clamp(previous.TotalDays - previous.UsedDays, 0, maxCarry);
            }
        }

        balance = new LeaveBalance { EmployeeId = employeeId, Year = year, TotalDays = total, UsedDays = 0 };
        db.LeaveBalances.Add(balance);
        return balance;
    }

    private Task<int> PendingAnnualDaysAsync(int employeeId, int year, CancellationToken cancellationToken) =>
        db.LeaveRequests
            .Where(l => l.EmployeeId == employeeId && l.Status == LeaveRequestStatus.Pending &&
                        l.LeaveType == LeaveType.AnnualLeave && l.StartDate.Year == year)
            .SumAsync(l => l.TotalDays, cancellationToken);

    private static IQueryable<LeaveRequestDto> Project(IQueryable<LeaveRequest> query) =>
        query.Select(l => new LeaveRequestDto(
            l.Id, l.EmployeeId, l.Employee.FirstName + " " + l.Employee.LastName, l.Employee.EmployeeNumber,
            l.Employee.Department.Name, l.Employee.ProfileImagePath, l.LeaveType, l.StartDate, l.EndDate, l.TotalDays,
            l.Reason, l.Status, l.ApprovedBy != null ? l.ApprovedBy.FirstName + " " + l.ApprovedBy.LastName : null,
            l.ApprovedAt, l.ApprovalNote, l.RejectionReason, l.CreatedAt,
            CanApprove: false, CanCancel: false)); // permission flags are computed in Decorate

    private static LeaveRequestDto Decorate(LeaveRequestDto dto, UserScope scope)
    {
        var isPending = dto.Status == LeaveRequestStatus.Pending;
        return dto with
        {
            EmployeeAvatarUrl = MediaUrls.Avatar(dto.EmployeeAvatarUrl),
            // Visible() already limits managers to their own department, so a visible
            // request plus a manager role implies the authority to decide it.
            CanApprove = isPending && dto.EmployeeId != scope.EmployeeId && scope.IsManagerOrAbove,
            CanCancel = isPending && (dto.EmployeeId == scope.EmployeeId || scope.IsAdmin)
        };
    }

    private DateTime Now => clock.GetUtcNow().UtcDateTime;
}
