using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Lookups;

public sealed record EmployeeLookupDto(int Id, string Name, string EmployeeNumber, int DepartmentId, string DepartmentName);

public sealed record ProjectLookupDto(int Id, string Name, string ProjectCode);

public sealed record PositionLookupDto(int Id, string Name, int? DepartmentId);

public sealed record DepartmentLookupDto(int Id, string Name, string Code);

/// <summary>Lightweight, unpaged option lists for form dropdowns, filtered by what the caller may use.</summary>
public interface ILookupService
{
    Task<IReadOnlyList<DepartmentLookupDto>> DepartmentsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<PositionLookupDto>> PositionsAsync(int? departmentId, CancellationToken cancellationToken);
    Task<IReadOnlyList<EmployeeLookupDto>> EmployeesAsync(int? departmentId, int? projectId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ProjectLookupDto>> ProjectsAsync(CancellationToken cancellationToken);
}

public sealed class LookupService(IApplicationDbContext db, ICurrentUserService currentUser) : ILookupService
{
    public async Task<IReadOnlyList<DepartmentLookupDto>> DepartmentsAsync(CancellationToken cancellationToken) =>
        await db.Departments.AsNoTracking()
            .Where(d => d.Status == RecordStatus.Active)
            .OrderBy(d => d.Name)
            .Select(d => new DepartmentLookupDto(d.Id, d.Name, d.Code))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<PositionLookupDto>> PositionsAsync(int? departmentId, CancellationToken cancellationToken) =>
        await db.Positions.AsNoTracking()
            .Where(p => p.Status == RecordStatus.Active)
            .WhereIf(departmentId.HasValue, p => p.DepartmentId == departmentId || p.DepartmentId == null)
            .OrderBy(p => p.Title)
            .Select(p => new PositionLookupDto(p.Id, p.Title, p.DepartmentId))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<EmployeeLookupDto>> EmployeesAsync(int? departmentId, int? projectId, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        if (!scope.IsManagerOrAbove)
        {
            throw new ForbiddenException();
        }

        return await db.Employees.AsNoTracking()
            .Where(e => e.Status == EmployeeStatus.Active || e.Status == EmployeeStatus.OnLeave)
            .WhereIf(departmentId.HasValue, e => e.DepartmentId == departmentId)
            .WhereIf(projectId.HasValue, e =>
                e.ProjectMemberships.Any(m => m.ProjectId == projectId) ||
                db.Projects.Any(p => p.Id == projectId && p.ProjectManagerId == e.Id))
            .OrderBy(e => e.FirstName).ThenBy(e => e.LastName)
            .Select(e => new EmployeeLookupDto(e.Id, e.FirstName + " " + e.LastName, e.EmployeeNumber, e.DepartmentId, e.Department.Name))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ProjectLookupDto>> ProjectsAsync(CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var projects = db.Projects.AsNoTracking().Where(p => !p.IsArchived);

        if (!scope.IsAdmin)
        {
            var employeeId = scope.EmployeeId;
            projects = projects.Where(p =>
                p.ProjectManagerId == employeeId ||
                p.Members.Any(m => m.EmployeeId == employeeId) ||
                (scope.IsManager && p.DepartmentId == scope.DepartmentId));
        }

        return await projects.OrderBy(p => p.Name)
            .Select(p => new ProjectLookupDto(p.Id, p.Name, p.ProjectCode))
            .ToListAsync(cancellationToken);
    }
}
