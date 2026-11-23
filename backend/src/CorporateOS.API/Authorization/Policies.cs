using CorporateOS.Domain.Constants;
using Microsoft.AspNetCore.Authorization;

namespace CorporateOS.API.Authorization;

/// <summary>
/// Coarse, role-based gates applied at the controller/action level. Fine-grained rules
/// (own department, own records, project membership) are enforced in application services.
/// </summary>
public static class Policies
{
    public const string SuperAdminOnly = nameof(SuperAdminOnly);
    public const string AdminOrAbove = nameof(AdminOrAbove);
    public const string ManagerOrAbove = nameof(ManagerOrAbove);

    public static void Register(AuthorizationOptions options)
    {
        options.AddPolicy(SuperAdminOnly, p => p.RequireAuthenticatedUser().RequireRole(Roles.SuperAdmin));
        options.AddPolicy(AdminOrAbove, p => p.RequireAuthenticatedUser().RequireRole(Roles.SuperAdmin, Roles.Admin));
        options.AddPolicy(ManagerOrAbove, p => p.RequireAuthenticatedUser().RequireRole(Roles.SuperAdmin, Roles.Admin, Roles.Manager));

        // Every endpoint requires authentication unless it opts out with [AllowAnonymous].
        options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    }
}
