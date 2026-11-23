using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Localization;
using FluentValidation;

namespace CorporateOS.Application.Features.Users;

public sealed class UserQuery : PagedQuery
{
    public string? Role { get; set; }
    public bool? IsActive { get; set; }
    public bool? IsLocked { get; set; }
}

public sealed record UserListItemDto(
    Guid Id,
    string Email,
    string DisplayName,
    IReadOnlyList<string> Roles,
    string PrimaryRole,
    bool IsActive,
    bool IsLocked,
    DateTime? LockoutEnd,
    DateTime? LastLoginAt,
    DateTime CreatedAt,
    int? EmployeeId,
    string? EmployeeNumber,
    string? DepartmentName);

public sealed record AssignRolesRequest(IReadOnlyList<string> Roles);

public sealed record AdminResetPasswordRequest(string NewPassword);

public sealed record LockUserRequest(int? Minutes);

public sealed record PermissionDto(string Area, string Permission, IReadOnlyList<string> Roles);

public sealed record RoleDto(string Name, string Description, int UserCount, int ActiveUserCount);

public sealed record RolesOverviewDto(IReadOnlyList<RoleDto> Roles, IReadOnlyList<PermissionDto> Permissions);

public sealed class AssignRolesRequestValidator : AbstractValidator<AssignRolesRequest>
{
    public AssignRolesRequestValidator()
    {
        RuleFor(x => x.Roles).NotEmpty().WithMessage(_ => Text.Get("user.atLeastOneRole"));
        RuleForEach(x => x.Roles).Must(r => Roles.All.Contains(r)).WithMessage((_, role) => Text.Get("user.invalidRole", role));
    }
}

public sealed class AdminResetPasswordRequestValidator : AbstractValidator<AdminResetPasswordRequest>
{
    public AdminResetPasswordRequestValidator() => RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(8).MaximumLength(128);
}

public sealed class LockUserRequestValidator : AbstractValidator<LockUserRequest>
{
    public LockUserRequestValidator() =>
        RuleFor(x => x.Minutes).InclusiveBetween(1, 60 * 24 * 365).When(x => x.Minutes.HasValue);
}
