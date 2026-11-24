using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Localization;

namespace CorporateOS.Application.Features.Users;

/// <summary>
/// Human-readable description of the permissions each role holds. Permissions are enforced
/// in code (authorization policies and service-level checks); this matrix documents them for
/// the Roles page and must be kept in sync with those checks.
/// </summary>
public static class PermissionMatrix
{
    private static readonly string[] Everyone = [Roles.SuperAdmin, Roles.Admin, Roles.Manager, Roles.Employee];
    private static readonly string[] Managers = [Roles.SuperAdmin, Roles.Admin, Roles.Manager];
    private static readonly string[] Admins = [Roles.SuperAdmin, Roles.Admin];
    private static readonly string[] SuperAdmins = [Roles.SuperAdmin];

    private static readonly (string Area, string Permission, string[] Roles)[] Entries =
    [
        ("Profile", "profile.own", Everyone),
        ("Employees", "employees.viewDepartment", Managers),
        ("Employees", "employees.manage", Admins),
        ("Employees", "employees.salary", Admins),
        ("DepartmentsPositions", "organization.manage", Admins),
        ("Projects", "projects.own", Everyone),
        ("Projects", "projects.department", Managers),
        ("Projects", "projects.manage", Admins),
        ("Tasks", "tasks.own", Everyone),
        ("Tasks", "tasks.department", Managers),
        ("Leave", "leave.own", Everyone),
        ("Leave", "leave.decide", Managers),
        ("Leave", "leave.balances", Admins),
        ("Expenses", "expenses.own", Everyone),
        ("Expenses", "expenses.decide", Managers),
        ("Expenses", "expenses.pay", Admins),
        ("Content", "content.read", Everyone),
        ("Content", "content.publish", Admins),
        ("Reports", "reports.department", Managers),
        ("Reports", "reports.company", Admins),
        ("Administration", "admin.users", Admins),
        ("Administration", "admin.admins", SuperAdmins),
        ("Administration", "admin.businessAudit", Admins),
        ("Administration", "admin.securityAudit", SuperAdmins),
        ("Settings", "settings.general", Admins),
        ("Settings", "settings.advanced", SuperAdmins),
    ];

    /// <summary>The matrix in the language of the current request.</summary>
    public static IReadOnlyList<PermissionDto> All() =>
        Entries.Select(e => new PermissionDto(
                Text.Get($"permission.area.{e.Area}"),
                Text.Get($"permission.{e.Permission}"),
                e.Roles))
            .ToList();
}
