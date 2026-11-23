using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Enums;
using FluentValidation;

namespace CorporateOS.Application.Features.Employees;

public sealed class EmployeeQuery : PagedQuery
{
    public int? DepartmentId { get; set; }
    public int? PositionId { get; set; }
    public int? ManagerId { get; set; }
    public EmployeeStatus? Status { get; set; }
    public EmploymentType? EmploymentType { get; set; }
}

public sealed record EmployeeListItemDto(
    int Id,
    string EmployeeNumber,
    string FirstName,
    string LastName,
    string FullName,
    string Email,
    string? Phone,
    int DepartmentId,
    string DepartmentName,
    int PositionId,
    string PositionTitle,
    string? ManagerName,
    DateOnly HireDate,
    EmploymentType EmploymentType,
    EmployeeStatus Status,
    string? AvatarUrl,
    bool HasUserAccount);

public sealed record EmployeeAccountDto(Guid UserId, IReadOnlyList<string> Roles, bool IsActive, bool IsLocked, DateTime? LastLoginAt);

public sealed record EmployeeDetailDto(
    int Id,
    string EmployeeNumber,
    string FirstName,
    string LastName,
    string FullName,
    string Email,
    string? Phone,
    int DepartmentId,
    string DepartmentName,
    int PositionId,
    string PositionTitle,
    EmployeeSummaryDto? Manager,
    DateOnly HireDate,
    EmploymentType EmploymentType,
    EmployeeStatus Status,
    string? AvatarUrl,
    string? Address,
    string? EmergencyContactName,
    string? EmergencyContactPhone,
    DateOnly? BirthDate,
    decimal? Salary,
    bool CanViewSalary,
    int DirectReportCount,
    EmployeeAccountDto? Account,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public sealed record EmployeeProjectDto(
    int ProjectId,
    string ProjectName,
    string ProjectCode,
    ProjectStatus Status,
    string Role,
    bool IsProjectManager,
    DateTime JoinedAt);

public record SaveEmployeeRequest
{
    public string EmployeeNumber { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string? Phone { get; init; }
    public int DepartmentId { get; init; }
    public int PositionId { get; init; }
    public int? ManagerId { get; init; }
    public DateOnly HireDate { get; init; }
    public EmploymentType EmploymentType { get; init; } = EmploymentType.FullTime;
    public EmployeeStatus Status { get; init; } = EmployeeStatus.Active;
    public string? Address { get; init; }
    public string? EmergencyContactName { get; init; }
    public string? EmergencyContactPhone { get; init; }
    public DateOnly? BirthDate { get; init; }
    public decimal? Salary { get; init; }
}

public sealed record CreateEmployeeRequest : SaveEmployeeRequest
{
    /// <summary>When true a sign-in account is created and linked to the employee.</summary>
    public bool CreateUserAccount { get; init; }
    public string? Role { get; init; }
    public string? TemporaryPassword { get; init; }
}

public sealed record UpdateEmployeeRequest : SaveEmployeeRequest;

public sealed record ChangeEmployeeStatusRequest(EmployeeStatus Status);

public abstract class SaveEmployeeRequestValidator<T> : AbstractValidator<T> where T : SaveEmployeeRequest
{
    protected SaveEmployeeRequestValidator(TimeProvider clock)
    {
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);

        RuleFor(x => x.EmployeeNumber).NotEmpty().MaximumLength(20)
            .Matches("^[A-Za-z0-9-]+$").WithMessage("Employee number may only contain letters, digits and hyphens.");
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Phone).MaximumLength(30).Matches(@"^[0-9+()\-\s.]*$").WithMessage("Phone contains invalid characters.");
        RuleFor(x => x.DepartmentId).GreaterThan(0).WithMessage("Department is required.");
        RuleFor(x => x.PositionId).GreaterThan(0).WithMessage("Position is required.");
        RuleFor(x => x.HireDate).NotEmpty().LessThanOrEqualTo(today.AddYears(1))
            .WithMessage("Hire date cannot be more than a year in the future.");
        RuleFor(x => x.EmploymentType).IsInEnum();
        RuleFor(x => x.Status).IsInEnum();
        RuleFor(x => x.Address).MaximumLength(500);
        RuleFor(x => x.EmergencyContactName).MaximumLength(150);
        RuleFor(x => x.EmergencyContactPhone).MaximumLength(30);
        RuleFor(x => x.BirthDate).LessThan(today.AddYears(-14)).When(x => x.BirthDate.HasValue)
            .WithMessage("Employees must be at least 14 years old.");
        RuleFor(x => x.Salary).GreaterThanOrEqualTo(0).LessThan(100_000_000).When(x => x.Salary.HasValue);
    }
}

public sealed class CreateEmployeeRequestValidator : SaveEmployeeRequestValidator<CreateEmployeeRequest>
{
    public CreateEmployeeRequestValidator(TimeProvider clock) : base(clock)
    {
        When(x => x.CreateUserAccount, () =>
        {
            RuleFor(x => x.Role).NotEmpty().Must(r => Roles.All.Contains(r!)).WithMessage("Select a valid role.");
            RuleFor(x => x.TemporaryPassword).NotEmpty().MinimumLength(8).MaximumLength(128);
        });
    }
}

public sealed class UpdateEmployeeRequestValidator(TimeProvider clock) : SaveEmployeeRequestValidator<UpdateEmployeeRequest>(clock);

public sealed class ChangeEmployeeStatusRequestValidator : AbstractValidator<ChangeEmployeeStatusRequest>
{
    public ChangeEmployeeStatusRequestValidator() => RuleFor(x => x.Status).IsInEnum();
}
