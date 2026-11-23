using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Domain.Constants;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Common.Audience;

/// <summary>Resolves the active user accounts that make up a notification audience.</summary>
public static class AudienceResolver
{
    public static Task<List<Guid>> AllActiveUsersAsync(IApplicationDbContext db, CancellationToken cancellationToken) =>
        db.Users.AsNoTracking().Where(u => u.IsActive).Select(u => u.Id).ToListAsync(cancellationToken);

    public static Task<List<Guid>> DepartmentUsersAsync(IApplicationDbContext db, int departmentId, CancellationToken cancellationToken) =>
        db.Employees.AsNoTracking()
            .Where(e => e.DepartmentId == departmentId && e.UserId != null && e.User!.IsActive)
            .Select(e => e.UserId!.Value)
            .ToListAsync(cancellationToken);

    public static Task<List<Guid>> UsersInRolesAsync(IApplicationDbContext db, IReadOnlyCollection<string> roles, CancellationToken cancellationToken) =>
        (from userRole in db.UserRoles
         join role in db.Roles on userRole.RoleId equals role.Id
         join user in db.Users on userRole.UserId equals user.Id
         where roles.Contains(role.Name!) && user.IsActive
         select user.Id)
        .Distinct()
        .ToListAsync(cancellationToken);

    public static Task<List<Guid>> ManagersAndAdminsAsync(IApplicationDbContext db, CancellationToken cancellationToken) =>
        UsersInRolesAsync(db, [Roles.SuperAdmin, Roles.Admin, Roles.Manager], cancellationToken);
}
