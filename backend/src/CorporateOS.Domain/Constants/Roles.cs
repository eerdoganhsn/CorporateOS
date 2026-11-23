namespace CorporateOS.Domain.Constants;

public static class Roles
{
    public const string SuperAdmin = "SuperAdmin";
    public const string Admin = "Admin";
    public const string Manager = "Manager";
    public const string Employee = "Employee";

    /// <summary>Highest privilege first. Used to derive a user's primary role.</summary>
    public static readonly IReadOnlyList<string> All = [SuperAdmin, Admin, Manager, Employee];

    /// <summary>Roles that only a SuperAdmin may grant or revoke.</summary>
    public static readonly IReadOnlyList<string> Privileged = [SuperAdmin, Admin];

    public static readonly IReadOnlyDictionary<string, string> Descriptions = new Dictionary<string, string>
    {
        [SuperAdmin] = "Full platform access including administrators, roles, security settings and all audit logs.",
        [Admin] = "Manages company records: employees, departments, projects, content, leave and expenses.",
        [Manager] = "Leads a department: assigns work and approves leave and expense requests for their team.",
        [Employee] = "Standard access: own profile, assigned tasks, leave and expense requests, company content."
    };

    // Comma-separated role lists for [Authorize(Roles = ...)] attributes.
    public const string AdminOrAbove = SuperAdmin + "," + Admin;
    public const string ManagerOrAbove = SuperAdmin + "," + Admin + "," + Manager;
}
