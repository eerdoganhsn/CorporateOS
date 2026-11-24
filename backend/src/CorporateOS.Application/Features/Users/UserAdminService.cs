using CorporateOS.Application.Common.Activity;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Exceptions;
using CorporateOS.Domain.Localization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Users;

public interface IUserAdminService
{
    Task<PagedResult<UserListItemDto>> ListAsync(UserQuery query, CancellationToken cancellationToken);
    Task<UserListItemDto> GetAsync(Guid id, CancellationToken cancellationToken);
    Task<UserListItemDto> SetActiveAsync(Guid id, bool active, CancellationToken cancellationToken);
    Task<UserListItemDto> LockAsync(Guid id, int? minutes, CancellationToken cancellationToken);
    Task<UserListItemDto> UnlockAsync(Guid id, CancellationToken cancellationToken);
    Task ResetPasswordAsync(Guid id, AdminResetPasswordRequest request, CancellationToken cancellationToken);
    Task<UserListItemDto> AssignRolesAsync(Guid id, AssignRolesRequest request, CancellationToken cancellationToken);
    Task<IReadOnlyList<ActivityItemDto>> GetActivityAsync(Guid id, CancellationToken cancellationToken);
    Task<RolesOverviewDto> GetRolesAsync(CancellationToken cancellationToken);
}

public sealed class UserAdminService(
    IApplicationDbContext db,
    UserManager<ApplicationUser> userManager,
    ICurrentUserService currentUser,
    IAuditService audit,
    TimeProvider clock) : IUserAdminService
{
    private const string EntityName = "User";

    public async Task<PagedResult<UserListItemDto>> ListAsync(UserQuery query, CancellationToken cancellationToken)
    {
        var now = Now;
        var search = query.Search?.Trim();
        var users = db.Users.AsNoTracking()
            .WhereIf(query.IsActive.HasValue, u => u.IsActive == query.IsActive)
            .WhereIf(query.IsLocked == true, u => u.LockoutEnd > now)
            .WhereIf(query.IsLocked == false, u => u.LockoutEnd == null || u.LockoutEnd <= now)
            .WhereIf(!string.IsNullOrEmpty(search), u => u.Email!.Contains(search!) || u.DisplayName.Contains(search!));

        if (!string.IsNullOrWhiteSpace(query.Role))
        {
            var roleId = await db.Roles.Where(r => r.Name == query.Role).Select(r => r.Id).FirstOrDefaultAsync(cancellationToken);
            users = users.Where(u => db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == roleId));
        }

        users = query.SortBy?.ToLowerInvariant() switch
        {
            "email" => query.SortDescending ? users.OrderByDescending(u => u.Email) : users.OrderBy(u => u.Email),
            "lastloginat" => query.SortDescending ? users.OrderByDescending(u => u.LastLoginAt) : users.OrderBy(u => u.LastLoginAt),
            "createdat" => query.SortDescending ? users.OrderByDescending(u => u.CreatedAt) : users.OrderBy(u => u.CreatedAt),
            _ => query.SortDescending ? users.OrderByDescending(u => u.DisplayName) : users.OrderBy(u => u.DisplayName)
        };

        var page = await users.Select(u => new
        {
            u.Id, u.Email, u.DisplayName, u.IsActive, u.LockoutEnd, u.LastLoginAt, u.CreatedAt,
            EmployeeId = u.Employee != null ? (int?)u.Employee.Id : null,
            EmployeeNumber = u.Employee != null ? u.Employee.EmployeeNumber : null,
            DepartmentName = u.Employee != null ? u.Employee.Department.Name : null
        }).ToPagedResultAsync(query, cancellationToken);

        var roleMap = await RolesForAsync(page.Items.Select(u => u.Id).ToList(), cancellationToken);
        return new PagedResult<UserListItemDto>
        {
            Items = page.Items.Select(u =>
            {
                var roles = roleMap.GetValueOrDefault(u.Id) ?? [];
                return new UserListItemDto(u.Id, u.Email!, u.DisplayName, roles, roles.FirstOrDefault() ?? Roles.Employee,
                    u.IsActive, u.LockoutEnd > now, u.LockoutEnd?.UtcDateTime, u.LastLoginAt, u.CreatedAt,
                    u.EmployeeId, u.EmployeeNumber, u.DepartmentName);
            }).ToList(),
            Page = page.Page,
            PageSize = page.PageSize,
            TotalItems = page.TotalItems
        };
    }

    public async Task<UserListItemDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking()
                       .Include(u => u.Employee).ThenInclude(e => e!.Department)
                       .FirstOrDefaultAsync(u => u.Id == id, cancellationToken)
                   ?? throw new NotFoundException("User", id);
        var roles = (await RolesForAsync([id], cancellationToken)).GetValueOrDefault(id) ?? [];
        return new UserListItemDto(user.Id, user.Email!, user.DisplayName, roles, roles.FirstOrDefault() ?? Roles.Employee,
            user.IsActive, user.LockoutEnd > Now, user.LockoutEnd?.UtcDateTime, user.LastLoginAt, user.CreatedAt,
            user.Employee?.Id, user.Employee?.EmployeeNumber, user.Employee?.Department.Name);
    }

    public async Task<UserListItemDto> SetActiveAsync(Guid id, bool active, CancellationToken cancellationToken)
    {
        var (user, _) = await LoadManageableAsync(id, cancellationToken);
        if (!active)
        {
            await EnsureNotLastSuperAdminAsync(user, cancellationToken);
        }

        if (user.IsActive != active)
        {
            user.IsActive = active;
            if (!active)
            {
                await RevokeSessionsAsync(user.Id, "Account deactivated", cancellationToken);
            }

            audit.Record(active ? "User.Activated" : "User.Deactivated", EntityName, id.ToString(),
                new { IsActive = !active }, new { IsActive = active });
            await db.SaveChangesAsync(cancellationToken);
        }

        return await GetAsync(id, cancellationToken);
    }

    public async Task<UserListItemDto> LockAsync(Guid id, int? minutes, CancellationToken cancellationToken)
    {
        var (user, _) = await LoadManageableAsync(id, cancellationToken);
        await EnsureNotLastSuperAdminAsync(user, cancellationToken);

        user.LockoutEnd = minutes.HasValue ? Now.AddMinutes(minutes.Value) : DateTimeOffset.MaxValue;
        await RevokeSessionsAsync(user.Id, "Account locked", cancellationToken);
        audit.Record("User.Locked", EntityName, id.ToString(), newValues: new { LockoutEnd = user.LockoutEnd });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<UserListItemDto> UnlockAsync(Guid id, CancellationToken cancellationToken)
    {
        var (user, _) = await LoadManageableAsync(id, cancellationToken);
        user.LockoutEnd = null;
        user.AccessFailedCount = 0;
        audit.Record("User.Unlocked", EntityName, id.ToString());
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task ResetPasswordAsync(Guid id, AdminResetPasswordRequest request, CancellationToken cancellationToken)
    {
        var (user, _) = await LoadManageableAsync(id, cancellationToken);
        var token = await userManager.GeneratePasswordResetTokenAsync(user);
        var result = await userManager.ResetPasswordAsync(user, token, request.NewPassword);
        if (!result.Succeeded)
        {
            throw new RequestValidationException(new Dictionary<string, string[]>
            {
                ["newPassword"] = result.Errors.Select(e => e.Description).ToArray()
            });
        }

        await RevokeSessionsAsync(user.Id, "Password reset by administrator", cancellationToken);
        audit.Record("User.PasswordReset", EntityName, id.ToString());
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<UserListItemDto> AssignRolesAsync(Guid id, AssignRolesRequest request, CancellationToken cancellationToken)
    {
        var (user, scope) = await LoadManageableAsync(id, cancellationToken, allowSelf: true);
        var current = await userManager.GetRolesAsync(user);
        var desired = request.Roles.Distinct().ToList();

        var toAdd = desired.Except(current).ToList();
        var toRemove = current.Except(desired).ToList();
        if (toAdd.Count == 0 && toRemove.Count == 0)
        {
            return await GetAsync(id, cancellationToken);
        }

        if (!scope.IsSuperAdmin && toAdd.Concat(toRemove).Any(Roles.Privileged.Contains))
        {
            throw new ForbiddenException(Text.Get("user.adminRolesForbidden"));
        }

        if (user.Id == scope.UserId && toRemove.Contains(Roles.SuperAdmin))
        {
            throw new DomainException(Text.Get("user.cannotRemoveOwnSuperAdmin"));
        }

        if (toRemove.Contains(Roles.SuperAdmin))
        {
            await EnsureNotLastSuperAdminAsync(user, cancellationToken);
        }

        if (toRemove.Count > 0)
        {
            await userManager.RemoveFromRolesAsync(user, toRemove);
        }

        if (toAdd.Count > 0)
        {
            await userManager.AddToRolesAsync(user, toAdd);
        }

        // Force a fresh sign-in so new tokens carry the updated role claims.
        await RevokeSessionsAsync(user.Id, "Roles changed", cancellationToken);
        audit.Record("User.RolesChanged", EntityName, id.ToString(), new { Roles = current }, new { Roles = desired });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<IReadOnlyList<ActivityItemDto>> GetActivityAsync(Guid id, CancellationToken cancellationToken)
    {
        if (!await db.Users.AnyAsync(u => u.Id == id, cancellationToken))
        {
            throw new NotFoundException("User", id);
        }

        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var logs = db.AuditLogs.AsNoTracking().Where(a => a.UserId == id || (a.EntityName == EntityName && a.EntityId == id.ToString()));
        if (!scope.IsSuperAdmin)
        {
            logs = logs.Where(a => a.EntityName != EntityName && a.EntityName != "SystemSetting");
        }

        return await ActivityQueries.Project(logs).Take(50).ToListAsync(cancellationToken);
    }

    public async Task<RolesOverviewDto> GetRolesAsync(CancellationToken cancellationToken)
    {
        var counts = await (from role in db.Roles
                            select new
                            {
                                role.Name,
                                role.Description,
                                Users = db.UserRoles.Count(ur => ur.RoleId == role.Id),
                                Active = db.UserRoles.Count(ur => ur.RoleId == role.Id && db.Users.Any(u => u.Id == ur.UserId && u.IsActive))
                            }).ToListAsync(cancellationToken);

        var roles = Roles.All
            .Select(name => counts.FirstOrDefault(c => c.Name == name) is { } c
                ? new RoleDto(name, c.Description, c.Users, c.Active)
                : new RoleDto(name, Roles.Descriptions[name], 0, 0))
            .ToList();
        return new RolesOverviewDto(roles, PermissionMatrix.All());
    }

    /// <summary>
    /// Admins may manage Managers and Employees; only SuperAdmins may manage administrators.
    /// Nobody may lock, deactivate or reset themselves through the admin endpoints.
    /// </summary>
    private async Task<(ApplicationUser User, UserScope Scope)> LoadManageableAsync(Guid id, CancellationToken cancellationToken, bool allowSelf = false)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var user = await userManager.FindByIdAsync(id.ToString()) ?? throw new NotFoundException("User", id);

        if (!allowSelf && user.Id == scope.UserId)
        {
            throw new DomainException(Text.Get("user.useProfile"));
        }

        var roles = await userManager.GetRolesAsync(user);
        if (!scope.IsSuperAdmin && roles.Any(Roles.Privileged.Contains))
        {
            throw new ForbiddenException(Text.Get("user.manageAdminsForbidden"));
        }

        return (user, scope);
    }

    private async Task EnsureNotLastSuperAdminAsync(ApplicationUser user, CancellationToken cancellationToken)
    {
        if (!await userManager.IsInRoleAsync(user, Roles.SuperAdmin))
        {
            return;
        }

        var activeSuperAdmins = (await userManager.GetUsersInRoleAsync(Roles.SuperAdmin)).Count(u => u.IsActive && u.Id != user.Id);
        if (activeSuperAdmins == 0)
        {
            throw new DomainException(Text.Get("user.lastSuperAdmin"));
        }
    }

    private async Task RevokeSessionsAsync(Guid userId, string reason, CancellationToken cancellationToken)
    {
        var tokens = await db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(cancellationToken);
        tokens.ForEach(t => t.Revoke(Now, currentUser.IpAddress, reason));
    }

    private async Task<Dictionary<Guid, List<string>>> RolesForAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken)
    {
        var pairs = await (from ur in db.UserRoles
                           join r in db.Roles on ur.RoleId equals r.Id
                           where userIds.Contains(ur.UserId)
                           select new { ur.UserId, r.Name }).ToListAsync(cancellationToken);

        return pairs.GroupBy(p => p.UserId)
            .ToDictionary(g => g.Key, g => Roles.All.Where(role => g.Any(p => p.Name == role)).ToList());
    }

    private DateTime Now => clock.GetUtcNow().UtcDateTime;
}
