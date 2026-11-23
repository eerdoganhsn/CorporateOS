using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Domain.Localization;
using RoleNames = CorporateOS.Domain.Constants.Roles;

namespace CorporateOS.Application.Common.Interfaces;

public interface ICurrentUserService
{
    Guid? UserId { get; }
    string? Email { get; }
    bool IsAuthenticated { get; }
    string? IpAddress { get; }
    string? UserAgent { get; }

    /// <summary>
    /// Resolves the caller's roles plus linked employee/department. Cached per request.
    /// Throws <see cref="UnauthorizedException"/> if the request is anonymous.
    /// </summary>
    Task<UserScope> GetScopeAsync(CancellationToken cancellationToken = default);
}

/// <summary>Who the caller is and what organisational data they may see.</summary>
public sealed record UserScope(
    Guid UserId,
    string Email,
    string DisplayName,
    IReadOnlyCollection<string> Roles,
    int? EmployeeId,
    int? DepartmentId)
{
    public bool IsSuperAdmin => Roles.Contains(RoleNames.SuperAdmin);
    public bool IsAdmin => IsSuperAdmin || Roles.Contains(RoleNames.Admin);
    public bool IsManager => Roles.Contains(RoleNames.Manager);
    public bool IsManagerOrAbove => IsAdmin || IsManager;

    /// <summary>The highest-privileged role the user holds.</summary>
    public string PrimaryRole => RoleNames.All.FirstOrDefault(Roles.Contains) ?? RoleNames.Employee;

    public int RequireEmployeeId() =>
        EmployeeId ?? throw new ForbiddenException(Text.Get("error.noEmployeeProfile"));

    /// <summary>True for a manager acting on their own department.</summary>
    public bool ManagesDepartment(int? departmentId) =>
        IsManager && DepartmentId.HasValue && departmentId == DepartmentId;
}
