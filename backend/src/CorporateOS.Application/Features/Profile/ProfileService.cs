using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Features.Auth;
using CorporateOS.Application.Features.Employees;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Profile;

public sealed record ProfileDto(AuthUserDto Account, DateTime? LastLoginAt, EmployeeDetailDto? Employee);

/// <summary>The only employee fields people may change about themselves.</summary>
public sealed record UpdateProfileRequest(string? Phone, string? Address, string? EmergencyContactName, string? EmergencyContactPhone);

public sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.Phone).MaximumLength(30).Matches(@"^[0-9+()\-\s.]*$").WithMessage("Phone contains invalid characters.");
        RuleFor(x => x.Address).MaximumLength(500);
        RuleFor(x => x.EmergencyContactName).MaximumLength(150);
        RuleFor(x => x.EmergencyContactPhone).MaximumLength(30).Matches(@"^[0-9+()\-\s.]*$").WithMessage("Phone contains invalid characters.");
    }
}

public interface IProfileService
{
    Task<ProfileDto> GetAsync(CancellationToken cancellationToken);
    Task<ProfileDto> UpdateAsync(UpdateProfileRequest request, CancellationToken cancellationToken);
    Task<string> UploadAvatarAsync(FileUpload file, CancellationToken cancellationToken);
}

public sealed class ProfileService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IAuthService auth,
    IEmployeeService employees,
    IAuditService audit) : IProfileService
{
    public async Task<ProfileDto> GetAsync(CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var account = await auth.GetCurrentUserAsync(cancellationToken);
        var lastLogin = await db.Users.Where(u => u.Id == scope.UserId).Select(u => u.LastLoginAt).FirstOrDefaultAsync(cancellationToken);
        var employee = scope.EmployeeId is { } id ? await employees.GetAsync(id, cancellationToken) : null;
        return new ProfileDto(account, lastLogin, employee);
    }

    public async Task<ProfileDto> UpdateAsync(UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var employeeId = scope.RequireEmployeeId();
        var employee = await db.Employees.FirstOrDefaultAsync(e => e.Id == employeeId, cancellationToken)
                       ?? throw new NotFoundException("Employee", employeeId);

        var before = new { employee.Phone, employee.Address, employee.EmergencyContactName, employee.EmergencyContactPhone };
        employee.Phone = request.Phone?.Trim();
        employee.Address = request.Address?.Trim();
        employee.EmergencyContactName = request.EmergencyContactName?.Trim();
        employee.EmergencyContactPhone = request.EmergencyContactPhone?.Trim();

        audit.Record("Profile.Updated", "Employee", employeeId.ToString(), before,
            new { employee.Phone, employee.Address, employee.EmergencyContactName, employee.EmergencyContactPhone });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(cancellationToken);
    }

    public async Task<string> UploadAvatarAsync(FileUpload file, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        return await employees.UploadImageAsync(scope.RequireEmployeeId(), file, cancellationToken);
    }
}
