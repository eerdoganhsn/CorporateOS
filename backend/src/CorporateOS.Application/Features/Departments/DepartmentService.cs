using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Common.Options;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Departments;

public interface IDepartmentService
{
    Task<PagedResult<DepartmentListItemDto>> ListAsync(DepartmentQuery query, CancellationToken cancellationToken);
    Task<DepartmentDetailDto> GetAsync(int id, CancellationToken cancellationToken);
    Task<DepartmentDetailDto> CreateAsync(SaveDepartmentRequest request, CancellationToken cancellationToken);
    Task<DepartmentDetailDto> UpdateAsync(int id, SaveDepartmentRequest request, CancellationToken cancellationToken);
    Task DeleteAsync(int id, CancellationToken cancellationToken);
}

public sealed class DepartmentService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IAuditService audit,
    TimeProvider clock) : IDepartmentService
{
    // Sorting is applied to the entity before projection so EF Core can translate it.
    private static readonly IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<Department, object?>>> Sort =
        SortMap.For<Department>(
            ("name", d => d.Name),
            ("code", d => d.Code),
            ("employeeCount", d => d.Employees.Count(e => e.Status != EmployeeStatus.Terminated)),
            ("status", d => d.Status));

    public async Task<PagedResult<DepartmentListItemDto>> ListAsync(DepartmentQuery query, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        if (!scope.IsManagerOrAbove)
        {
            throw new ForbiddenException();
        }

        var departments = db.Departments.AsNoTracking()
            .WhereIf(!scope.IsAdmin, d => d.Id == scope.DepartmentId)
            .WhereIf(query.Status.HasValue, d => d.Status == query.Status)
            .WhereIf(!string.IsNullOrWhiteSpace(query.Search), d => d.Name.Contains(query.Search!) || d.Code.Contains(query.Search!));

        return await departments
            .ApplySort(query, Sort, "name")
            .Select(d => new DepartmentListItemDto(
                d.Id,
                d.Name,
                d.Code,
                d.Description,
                d.Status,
                d.ManagerId,
                d.Manager != null ? d.Manager.FirstName + " " + d.Manager.LastName : null,
                d.Employees.Count(e => e.Status != EmployeeStatus.Terminated),
                d.Projects.Count(p => !p.IsArchived && p.Status == ProjectStatus.Active)))
            .ToPagedResultAsync(query, cancellationToken);
    }

    public async Task<DepartmentDetailDto> GetAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        if (!scope.IsAdmin && !scope.ManagesDepartment(id))
        {
            throw new ForbiddenException("You can only view your own department.");
        }

        var department = await db.Departments.AsNoTracking()
            .Where(d => d.Id == id)
            .Select(d => new
            {
                d.Id, d.Name, d.Code, d.Description, d.Status, d.CreatedAt, d.UpdatedAt,
                Manager = d.Manager == null ? null : new EmployeeSummaryDto(
                    d.Manager.Id, d.Manager.FirstName + " " + d.Manager.LastName, d.Manager.EmployeeNumber,
                    d.Manager.Email, d.Manager.Position.Title, d.Manager.ProfileImagePath)
            })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("Department", id);

        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        var now = clock.GetUtcNow().UtcDateTime;
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var yearStart = new DateOnly(today.Year, 1, 1);

        var employees = await db.Employees.AsNoTracking()
            .Where(e => e.DepartmentId == id && e.Status != EmployeeStatus.Terminated)
            .OrderBy(e => e.LastName).ThenBy(e => e.FirstName)
            .Select(e => new EmployeeSummaryDto(e.Id, e.FirstName + " " + e.LastName, e.EmployeeNumber, e.Email, e.Position.Title, e.ProfileImagePath))
            .ToListAsync(cancellationToken);

        var projects = await db.Projects.AsNoTracking()
            .Where(p => p.DepartmentId == id && !p.IsArchived && (p.Status == ProjectStatus.Active || p.Status == ProjectStatus.Planning))
            .OrderBy(p => p.EndDate)
            .Select(p => new DepartmentProjectDto(p.Id, p.Name, p.ProjectCode, p.Status, p.ProgressPercentage, p.EndDate))
            .ToListAsync(cancellationToken);

        var deptTasks = db.Tasks.AsNoTracking().Where(t => t.AssignedTo != null && t.AssignedTo.DepartmentId == id);
        var openStatuses = new[] { TaskItemStatus.Todo, TaskItemStatus.InProgress, TaskItemStatus.Review };
        var thirtyDaysAgo = now.AddDays(-30);
        var tasks = new DepartmentTaskSummary(
            await deptTasks.CountAsync(t => openStatuses.Contains(t.Status), cancellationToken),
            await deptTasks.CountAsync(t => openStatuses.Contains(t.Status) && t.DueDate < today, cancellationToken),
            await deptTasks.CountAsync(t => t.Status == TaskItemStatus.Completed && t.CompletedAt >= thirtyDaysAgo, cancellationToken));

        var deptLeave = db.LeaveRequests.AsNoTracking().Where(l => l.Employee.DepartmentId == id);
        var leave = new DepartmentLeaveSummary(
            await deptLeave.CountAsync(l => l.Status == LeaveRequestStatus.Pending, cancellationToken),
            await deptLeave.Where(l => l.Status == LeaveRequestStatus.Approved && l.StartDate >= yearStart).SumAsync(l => (int?)l.TotalDays, cancellationToken) ?? 0,
            await deptLeave.CountAsync(l => l.Status == LeaveRequestStatus.Approved && l.StartDate <= today && l.EndDate >= today, cancellationToken));

        var deptExpenses = db.Expenses.AsNoTracking().Where(e => e.Employee.DepartmentId == id);
        var approved = new[] { ExpenseStatus.Approved, ExpenseStatus.Paid };
        var expenses = new DepartmentExpenseSummary(
            await deptExpenses.CountAsync(e => e.Status == ExpenseStatus.Submitted, cancellationToken),
            await deptExpenses.Where(e => approved.Contains(e.Status) && e.ExpenseDate >= monthStart).SumAsync(e => (decimal?)e.Amount, cancellationToken) ?? 0,
            await deptExpenses.Where(e => approved.Contains(e.Status) && e.ExpenseDate >= yearStart).SumAsync(e => (decimal?)e.Amount, cancellationToken) ?? 0);

        return new DepartmentDetailDto(
            department.Id,
            department.Name,
            department.Code,
            department.Description,
            department.Status,
            department.Manager is null ? null : department.Manager with { AvatarUrl = MediaUrls.Avatar(department.Manager.AvatarUrl) },
            employees.Count,
            employees.Select(e => e with { AvatarUrl = MediaUrls.Avatar(e.AvatarUrl) }).ToList(),
            projects,
            tasks,
            leave,
            expenses,
            department.CreatedAt,
            department.UpdatedAt);
    }

    public async Task<DepartmentDetailDto> CreateAsync(SaveDepartmentRequest request, CancellationToken cancellationToken)
    {
        await EnsureUniqueAsync(request, null, cancellationToken);
        await EnsureManagerExistsAsync(request.ManagerId, cancellationToken);

        var department = new Department
        {
            Name = request.Name.Trim(),
            Code = request.Code.Trim().ToUpperInvariant(),
            Description = request.Description?.Trim(),
            ManagerId = request.ManagerId,
            Status = request.Status
        };
        db.Departments.Add(department);
        await db.SaveChangesAsync(cancellationToken);

        audit.Record("Department.Created", nameof(Department), department.Id.ToString(), newValues: Snapshot(department));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(department.Id, cancellationToken);
    }

    public async Task<DepartmentDetailDto> UpdateAsync(int id, SaveDepartmentRequest request, CancellationToken cancellationToken)
    {
        var department = await db.Departments.FirstOrDefaultAsync(d => d.Id == id, cancellationToken)
                         ?? throw new NotFoundException("Department", id);
        await EnsureUniqueAsync(request, id, cancellationToken);
        await EnsureManagerExistsAsync(request.ManagerId, cancellationToken);

        if (request.Status == RecordStatus.Inactive && department.Status == RecordStatus.Active &&
            await db.Employees.AnyAsync(e => e.DepartmentId == id && e.Status == EmployeeStatus.Active, cancellationToken))
        {
            throw new Domain.Exceptions.DomainException("A department with active employees cannot be deactivated.");
        }

        var before = Snapshot(department);
        department.Name = request.Name.Trim();
        department.Code = request.Code.Trim().ToUpperInvariant();
        department.Description = request.Description?.Trim();
        department.ManagerId = request.ManagerId;
        department.Status = request.Status;

        audit.Record("Department.Updated", nameof(Department), id.ToString(), before, Snapshot(department));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken)
    {
        var department = await db.Departments.FirstOrDefaultAsync(d => d.Id == id, cancellationToken)
                         ?? throw new NotFoundException("Department", id);

        if (await db.Employees.AnyAsync(e => e.DepartmentId == id, cancellationToken))
        {
            throw new ConflictException("The department still has employees. Reassign them before deleting it.");
        }

        db.Departments.Remove(department); // soft delete via interceptor
        audit.Record("Department.Deleted", nameof(Department), id.ToString(), Snapshot(department));
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task EnsureUniqueAsync(SaveDepartmentRequest request, int? excludeId, CancellationToken cancellationToken)
    {
        var code = request.Code.Trim().ToUpperInvariant();
        var name = request.Name.Trim();
        if (await db.Departments.AnyAsync(d => d.Code == code && d.Id != excludeId, cancellationToken))
        {
            throw new ConflictException($"Department code '{code}' is already in use.");
        }

        if (await db.Departments.AnyAsync(d => d.Name == name && d.Id != excludeId, cancellationToken))
        {
            throw new ConflictException($"A department named '{name}' already exists.");
        }
    }

    private async Task EnsureManagerExistsAsync(int? managerId, CancellationToken cancellationToken)
    {
        if (managerId.HasValue && !await db.Employees.AnyAsync(e => e.Id == managerId, cancellationToken))
        {
            throw new RequestValidationException("managerId", "The selected manager does not exist.");
        }
    }

    private static object Snapshot(Department d) => new { d.Name, d.Code, d.Description, d.ManagerId, d.Status };
}
