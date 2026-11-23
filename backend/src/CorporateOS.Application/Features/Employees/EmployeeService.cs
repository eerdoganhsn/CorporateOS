using CorporateOS.Application.Common.Activity;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Files;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Common.Options;
using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Employees;

public interface IEmployeeService
{
    Task<PagedResult<EmployeeListItemDto>> ListAsync(EmployeeQuery query, CancellationToken cancellationToken);
    Task<EmployeeDetailDto> GetAsync(int id, CancellationToken cancellationToken);
    Task<EmployeeDetailDto> CreateAsync(CreateEmployeeRequest request, CancellationToken cancellationToken);
    Task<EmployeeDetailDto> UpdateAsync(int id, UpdateEmployeeRequest request, CancellationToken cancellationToken);
    Task<EmployeeDetailDto> ChangeStatusAsync(int id, EmployeeStatus status, CancellationToken cancellationToken);
    Task DeleteAsync(int id, CancellationToken cancellationToken);
    Task<string> UploadImageAsync(int id, FileUpload file, CancellationToken cancellationToken);
    Task<IReadOnlyList<ActivityItemDto>> GetActivityAsync(int id, CancellationToken cancellationToken);
    Task<IReadOnlyList<EmployeeProjectDto>> GetProjectsAsync(int id, CancellationToken cancellationToken);
}

public sealed class EmployeeService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    UserManager<ApplicationUser> userManager,
    IAuditService audit,
    IFileUploadValidator fileValidator,
    IFileStorage storage,
    TimeProvider clock) : IEmployeeService
{
    // Sorting is applied to the entity before projection so EF Core can translate it.
    private static readonly IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<Employee, object?>>> Sort =
        SortMap.For<Employee>(
            ("employeeNumber", e => e.EmployeeNumber),
            ("name", e => e.FirstName + " " + e.LastName),
            ("email", e => e.Email),
            ("department", e => e.Department.Name),
            ("position", e => e.Position.Title),
            ("hireDate", e => e.HireDate),
            ("status", e => e.Status),
            ("employmentType", e => e.EmploymentType));

    public async Task<PagedResult<EmployeeListItemDto>> ListAsync(EmployeeQuery query, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        if (!scope.IsManagerOrAbove)
        {
            throw new ForbiddenException(Text.Get("employee.browseForbidden"));
        }

        var search = query.Search?.Trim();
        var employees = db.Employees.AsNoTracking()
            .WhereIf(!scope.IsAdmin, e => e.DepartmentId == scope.DepartmentId)
            .WhereIf(query.DepartmentId.HasValue, e => e.DepartmentId == query.DepartmentId)
            .WhereIf(query.PositionId.HasValue, e => e.PositionId == query.PositionId)
            .WhereIf(query.ManagerId.HasValue, e => e.ManagerId == query.ManagerId)
            .WhereIf(query.Status.HasValue, e => e.Status == query.Status)
            .WhereIf(query.EmploymentType.HasValue, e => e.EmploymentType == query.EmploymentType)
            .WhereIf(!string.IsNullOrEmpty(search), e =>
                e.FirstName.Contains(search!) || e.LastName.Contains(search!) ||
                (e.FirstName + " " + e.LastName).Contains(search!) ||
                e.Email.Contains(search!) || e.EmployeeNumber.Contains(search!));

        var page = await employees
            .ApplySort(query, Sort, "name")
            .Select(e => new EmployeeListItemDto(
                e.Id, e.EmployeeNumber, e.FirstName, e.LastName, e.FirstName + " " + e.LastName, e.Email, e.Phone,
                e.DepartmentId, e.Department.Name, e.PositionId, e.Position.Title,
                e.Manager != null ? e.Manager.FirstName + " " + e.Manager.LastName : null,
                e.HireDate, e.EmploymentType, e.Status, e.ProfileImagePath, e.UserId != null))
            .ToPagedResultAsync(query, cancellationToken);

        return new PagedResult<EmployeeListItemDto>
        {
            Items = page.Items.Select(e => e with { AvatarUrl = MediaUrls.Avatar(e.AvatarUrl) }).ToList(),
            Page = page.Page,
            PageSize = page.PageSize,
            TotalItems = page.TotalItems
        };
    }

    public async Task<EmployeeDetailDto> GetAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var employee = await db.Employees.AsNoTracking()
            .Include(e => e.Department)
            .Include(e => e.Position)
            .Include(e => e.Manager).ThenInclude(m => m!.Position)
            .Include(e => e.User)
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken)
            ?? throw new NotFoundException("Employee", id);

        EnsureCanView(scope, employee);

        var isSelf = scope.EmployeeId == employee.Id;
        var canViewSalary = scope.IsAdmin || isSelf;
        var directReports = await db.Employees.CountAsync(e => e.ManagerId == id, cancellationToken);

        EmployeeAccountDto? account = null;
        if (employee.User is not null && scope.IsAdmin)
        {
            var roles = await userManager.GetRolesAsync(employee.User);
            var now = clock.GetUtcNow();
            account = new EmployeeAccountDto(
                employee.User.Id,
                Roles.All.Where(roles.Contains).ToList(),
                employee.User.IsActive,
                employee.User.LockoutEnd > now,
                employee.User.LastLoginAt);
        }

        return new EmployeeDetailDto(
            employee.Id, employee.EmployeeNumber, employee.FirstName, employee.LastName, employee.FullName,
            employee.Email, employee.Phone, employee.DepartmentId, employee.Department.Name,
            employee.PositionId, employee.Position.Title,
            employee.Manager is null ? null : ToSummary(employee.Manager),
            employee.HireDate, employee.EmploymentType, employee.Status, MediaUrls.Avatar(employee.ProfileImagePath),
            employee.Address, employee.EmergencyContactName, employee.EmergencyContactPhone,
            employee.BirthDate,
            canViewSalary ? employee.Salary : null,
            canViewSalary,
            directReports,
            account,
            employee.CreatedAt,
            employee.UpdatedAt);
    }

    public async Task<EmployeeDetailDto> CreateAsync(CreateEmployeeRequest request, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        await ValidateReferencesAsync(request, null, cancellationToken);

        if (request.CreateUserAccount)
        {
            if (Roles.Privileged.Contains(request.Role!) && !scope.IsSuperAdmin)
            {
                throw new ForbiddenException(Text.Get("employee.adminRoleForbidden"));
            }

            if (await userManager.FindByEmailAsync(request.Email) is not null)
            {
                throw new ConflictException(Text.Get("employee.accountEmailExists", request.Email));
            }
        }

        var employee = new Employee();
        Apply(employee, request);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        if (request.CreateUserAccount)
        {
            var user = new ApplicationUser
            {
                UserName = request.Email.Trim(),
                Email = request.Email.Trim(),
                EmailConfirmed = true,
                DisplayName = $"{employee.FirstName} {employee.LastName}",
                IsActive = employee.Status is EmployeeStatus.Active or EmployeeStatus.OnLeave,
                CreatedAt = clock.GetUtcNow().UtcDateTime
            };

            var created = await userManager.CreateAsync(user, request.TemporaryPassword!);
            if (!created.Succeeded)
            {
                throw new RequestValidationException(new Dictionary<string, string[]>
                {
                    ["temporaryPassword"] = created.Errors.Select(e => e.Description).ToArray()
                });
            }

            await userManager.AddToRoleAsync(user, request.Role!);
            employee.UserId = user.Id;
            audit.Record("User.Created", "User", user.Id.ToString(), newValues: new { user.Email, Role = request.Role });
        }

        db.Employees.Add(employee);
        await db.SaveChangesAsync(cancellationToken);

        audit.Record("Employee.Created", nameof(Employee), employee.Id.ToString(), newValues: Snapshot(employee));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return await GetAsync(employee.Id, cancellationToken);
    }

    public async Task<EmployeeDetailDto> UpdateAsync(int id, UpdateEmployeeRequest request, CancellationToken cancellationToken)
    {
        var employee = await db.Employees.Include(e => e.User).FirstOrDefaultAsync(e => e.Id == id, cancellationToken)
                       ?? throw new NotFoundException("Employee", id);
        await ValidateReferencesAsync(request, id, cancellationToken);

        if (request.ManagerId == id)
        {
            throw new RequestValidationException("managerId", Text.Get("employee.ownManager"));
        }

        var before = Snapshot(employee);
        var previousStatus = employee.Status;
        Apply(employee, request);

        if (employee.User is not null)
        {
            employee.User.DisplayName = employee.FullName;
            if (!string.Equals(employee.User.Email, employee.Email, StringComparison.OrdinalIgnoreCase))
            {
                if (await userManager.FindByEmailAsync(employee.Email) is { } other && other.Id != employee.User.Id)
                {
                    throw new ConflictException(Text.Get("employee.accountEmailExists", employee.Email));
                }

                employee.User.Email = employee.Email;
                employee.User.UserName = employee.Email;
                employee.User.NormalizedEmail = userManager.NormalizeEmail(employee.Email);
                employee.User.NormalizedUserName = userManager.NormalizeName(employee.Email);
            }
        }

        if (previousStatus != employee.Status)
        {
            await SyncAccountStatusAsync(employee, cancellationToken);
        }

        audit.Record("Employee.Updated", nameof(Employee), id.ToString(), before, Snapshot(employee));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<EmployeeDetailDto> ChangeStatusAsync(int id, EmployeeStatus status, CancellationToken cancellationToken)
    {
        var employee = await db.Employees.Include(e => e.User).FirstOrDefaultAsync(e => e.Id == id, cancellationToken)
                       ?? throw new NotFoundException("Employee", id);
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        if (scope.EmployeeId == id && status is EmployeeStatus.Inactive or EmployeeStatus.Terminated)
        {
            throw new Domain.Exceptions.DomainException(Text.Get("employee.cannotDeactivateSelf"));
        }

        var previous = employee.Status;
        employee.Status = status;
        await SyncAccountStatusAsync(employee, cancellationToken);

        var action = status switch
        {
            EmployeeStatus.Active => "Employee.Activated",
            EmployeeStatus.Terminated => "Employee.Terminated",
            EmployeeStatus.Inactive => "Employee.Deactivated",
            _ => "Employee.StatusChanged"
        };
        audit.Record(action, nameof(Employee), id.ToString(), new { Status = previous }, new { Status = status });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken)
    {
        var employee = await db.Employees.Include(e => e.User).FirstOrDefaultAsync(e => e.Id == id, cancellationToken)
                       ?? throw new NotFoundException("Employee", id);
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        if (scope.EmployeeId == id)
        {
            throw new Domain.Exceptions.DomainException(Text.Get("employee.cannotDeleteSelf"));
        }

        if (await db.Departments.AnyAsync(d => d.ManagerId == id, cancellationToken))
        {
            throw new ConflictException(Text.Get("employee.managesDepartment"));
        }

        employee.Status = EmployeeStatus.Terminated;
        await SyncAccountStatusAsync(employee, cancellationToken);
        db.Employees.Remove(employee); // soft delete
        audit.Record("Employee.Deleted", nameof(Employee), id.ToString(), Snapshot(employee));
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<string> UploadImageAsync(int id, FileUpload file, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        if (!scope.IsAdmin && scope.EmployeeId != id)
        {
            throw new ForbiddenException(Text.Get("employee.ownImageOnly"));
        }

        var employee = await db.Employees.FirstOrDefaultAsync(e => e.Id == id, cancellationToken)
                       ?? throw new NotFoundException("Employee", id);
        var validated = await fileValidator.ValidateAsync(file, UploadKind.Image, cancellationToken);

        await using var stream = file.OpenReadStream();
        var path = await storage.SaveAsync(stream, "avatars", validated.Extension, cancellationToken);

        var previous = employee.ProfileImagePath;
        employee.ProfileImagePath = path;
        audit.Record("Employee.ImageUpdated", nameof(Employee), id.ToString());
        await db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrEmpty(previous))
        {
            await storage.DeleteAsync(previous, cancellationToken);
        }

        return MediaUrls.Avatar(path)!;
    }

    public async Task<IReadOnlyList<ActivityItemDto>> GetActivityAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var employee = await db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, cancellationToken)
                       ?? throw new NotFoundException("Employee", id);
        EnsureCanView(scope, employee);

        var entityId = id.ToString();
        var userId = employee.UserId;
        return await ActivityQueries.Project(db.AuditLogs.AsNoTracking()
                .Where(a => (a.EntityName == nameof(Employee) && a.EntityId == entityId) ||
                            (userId != null && a.UserId == userId && !a.Action.StartsWith("Auth."))))
            .Take(50)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<EmployeeProjectDto>> GetProjectsAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var employee = await db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, cancellationToken)
                       ?? throw new NotFoundException("Employee", id);
        EnsureCanView(scope, employee);

        var memberships = await db.ProjectMembers.AsNoTracking()
            .Where(m => m.EmployeeId == id)
            .Select(m => new EmployeeProjectDto(m.ProjectId, m.Project.Name, m.Project.ProjectCode, m.Project.Status,
                m.Role, m.Project.ProjectManagerId == id, m.JoinedAt))
            .ToListAsync(cancellationToken);

        // Projects managed without an explicit membership row.
        var managed = await db.Projects.AsNoTracking()
            .Where(p => p.ProjectManagerId == id && !p.Members.Any(m => m.EmployeeId == id))
            .Select(p => new EmployeeProjectDto(p.Id, p.Name, p.ProjectCode, p.Status, "Project Manager", true, p.CreatedAt))
            .ToListAsync(cancellationToken);

        return memberships.Concat(managed).OrderByDescending(p => p.JoinedAt).ToList();
    }

    private static void EnsureCanView(UserScope scope, Employee employee)
    {
        if (scope.IsAdmin || scope.EmployeeId == employee.Id || scope.ManagesDepartment(employee.DepartmentId))
        {
            return;
        }

        throw new ForbiddenException(Text.Get("employee.noAccess"));
    }

    private async Task SyncAccountStatusAsync(Employee employee, CancellationToken cancellationToken)
    {
        if (employee.User is null)
        {
            return;
        }

        var shouldBeActive = employee.Status is EmployeeStatus.Active or EmployeeStatus.OnLeave;
        if (employee.User.IsActive == shouldBeActive)
        {
            return;
        }

        employee.User.IsActive = shouldBeActive;
        if (!shouldBeActive)
        {
            var now = clock.GetUtcNow().UtcDateTime;
            var tokens = await db.RefreshTokens
                .Where(t => t.UserId == employee.User.Id && t.RevokedAt == null)
                .ToListAsync(cancellationToken);
            tokens.ForEach(t => t.Revoke(now, currentUser.IpAddress, "Employee deactivated"));
        }
    }

    private async Task ValidateReferencesAsync(SaveEmployeeRequest request, int? excludeId, CancellationToken cancellationToken)
    {
        var number = request.EmployeeNumber.Trim().ToUpperInvariant();
        var email = request.Email.Trim();

        if (await db.Employees.AnyAsync(e => e.EmployeeNumber == number && e.Id != excludeId, cancellationToken))
        {
            throw new ConflictException(Text.Get("employee.numberInUse", number));
        }

        if (await db.Employees.AnyAsync(e => e.Email == email && e.Id != excludeId, cancellationToken))
        {
            throw new ConflictException(Text.Get("employee.emailInUse", email));
        }

        var errors = new Dictionary<string, string[]>();
        if (!await db.Departments.AnyAsync(d => d.Id == request.DepartmentId, cancellationToken))
        {
            errors["departmentId"] = [Text.Get("error.departmentNotFound")];
        }

        if (!await db.Positions.AnyAsync(p => p.Id == request.PositionId, cancellationToken))
        {
            errors["positionId"] = [Text.Get("error.positionNotFound")];
        }

        if (request.ManagerId.HasValue && !await db.Employees.AnyAsync(e => e.Id == request.ManagerId, cancellationToken))
        {
            errors["managerId"] = [Text.Get("error.managerNotFound")];
        }

        if (errors.Count > 0)
        {
            throw new RequestValidationException(errors);
        }
    }

    private static void Apply(Employee employee, SaveEmployeeRequest request)
    {
        employee.EmployeeNumber = request.EmployeeNumber.Trim().ToUpperInvariant();
        employee.FirstName = request.FirstName.Trim();
        employee.LastName = request.LastName.Trim();
        employee.Email = request.Email.Trim();
        employee.Phone = request.Phone?.Trim();
        employee.DepartmentId = request.DepartmentId;
        employee.PositionId = request.PositionId;
        employee.ManagerId = request.ManagerId;
        employee.HireDate = request.HireDate;
        employee.EmploymentType = request.EmploymentType;
        employee.Status = request.Status;
        employee.Address = request.Address?.Trim();
        employee.EmergencyContactName = request.EmergencyContactName?.Trim();
        employee.EmergencyContactPhone = request.EmergencyContactPhone?.Trim();
        employee.BirthDate = request.BirthDate;
        employee.Salary = request.Salary;
    }

    private static EmployeeSummaryDto ToSummary(Employee e) =>
        new(e.Id, e.FullName, e.EmployeeNumber, e.Email, e.Position?.Title, MediaUrls.Avatar(e.ProfileImagePath));

    // Salary is deliberately excluded from audit snapshots.
    private static object Snapshot(Employee e) => new
    {
        e.EmployeeNumber, e.FirstName, e.LastName, e.Email, e.Phone, e.DepartmentId, e.PositionId,
        e.ManagerId, e.HireDate, e.EmploymentType, e.Status
    };
}
