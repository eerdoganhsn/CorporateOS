using CorporateOS.Domain.Constants;

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

    public static readonly IReadOnlyList<PermissionDto> All =
    [
        new("Profile", "View and edit own profile and password", Everyone),
        new("Employees", "View department employees", Managers),
        new("Employees", "Create, edit and deactivate employees", Admins),
        new("Employees", "View salary information (others)", Admins),
        new("Departments & Positions", "Manage departments and positions", Admins),
        new("Projects", "View own projects", Everyone),
        new("Projects", "View department projects and budgets", Managers),
        new("Projects", "Create, archive and fully edit projects", Admins),
        new("Tasks", "View and update own tasks", Everyone),
        new("Tasks", "Create and assign department tasks", Managers),
        new("Leave", "Submit and cancel own leave requests", Everyone),
        new("Leave", "Approve or reject department leave", Managers),
        new("Leave", "Adjust leave balances", Admins),
        new("Expenses", "Submit own expenses", Everyone),
        new("Expenses", "Approve or reject department expenses", Managers),
        new("Expenses", "Mark expenses as paid", Admins),
        new("Content", "Read announcements and permitted documents", Everyone),
        new("Content", "Publish announcements and upload documents", Admins),
        new("Reports", "Department reports", Managers),
        new("Reports", "Company-wide reports", Admins),
        new("Administration", "Manage users (non-administrators)", Admins),
        new("Administration", "Manage administrators and assign admin roles", SuperAdmins),
        new("Administration", "View business audit logs", Admins),
        new("Administration", "View security audit logs", SuperAdmins),
        new("Settings", "Edit general company settings", Admins),
        new("Settings", "Edit leave, file and security settings", SuperAdmins),
    ];
}
