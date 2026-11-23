using CorporateOS.Application.Features.Employees;
using CorporateOS.Application.Features.Expenses;
using CorporateOS.Application.Features.Leave;
using CorporateOS.Application.Features.Projects;
using CorporateOS.Application.Features.Tasks;
using CorporateOS.Domain.Enums;
using FluentAssertions;
using FluentValidation;
using Microsoft.Extensions.Time.Testing;

namespace CorporateOS.UnitTests.Validation;

/// <summary>All date rules are evaluated against a fixed "today" of 2026-11-23.</summary>
public abstract class ValidatorTestBase
{
    protected static readonly DateOnly Today = new(2026, 11, 23);
    protected static readonly FakeTimeProvider Clock = new(new DateTimeOffset(2026, 11, 23, 9, 0, 0, TimeSpan.Zero));

    protected static IEnumerable<string> FailedProperties<T>(IValidator<T> validator, T instance) =>
        validator.Validate(instance).Errors.Select(e => e.PropertyName);
}

public class EmployeeValidatorTests : ValidatorTestBase
{
    private readonly CreateEmployeeRequestValidator _validator = new(Clock);

    private static CreateEmployeeRequest Valid() => new()
    {
        EmployeeNumber = "EMP-1001",
        FirstName = "Ada",
        LastName = "Lovelace",
        Email = "ada@corporateos.local",
        Phone = "+1 (555) 010-2030",
        DepartmentId = 1,
        PositionId = 2,
        HireDate = Today,
        BirthDate = new DateOnly(1990, 1, 1)
    };

    [Fact]
    public void Valid_request_passes() => _validator.Validate(Valid()).IsValid.Should().BeTrue();

    [Theory]
    [InlineData("")]
    [InlineData("not-an-email")]
    [InlineData("ada@")]
    public void Invalid_email_fails(string email) =>
        FailedProperties(_validator, Valid() with { Email = email }).Should().Contain("Email");

    [Theory]
    [InlineData("")]
    [InlineData("EMP 1001")]
    [InlineData("EMP_1001")]
    [InlineData("EMP-123456789012345678")] // > 20 chars
    public void Invalid_employee_number_fails(string number) =>
        FailedProperties(_validator, Valid() with { EmployeeNumber = number }).Should().Contain("EmployeeNumber");

    [Fact]
    public void Employee_number_with_letters_digits_and_hyphens_passes() =>
        FailedProperties(_validator, Valid() with { EmployeeNumber = "ops-2026-7" }).Should().NotContain("EmployeeNumber");

    [Fact]
    public void Phone_with_letters_fails() =>
        FailedProperties(_validator, Valid() with { Phone = "call me" }).Should().Contain("Phone");

    [Fact]
    public void Missing_department_and_position_fail() =>
        FailedProperties(_validator, Valid() with { DepartmentId = 0, PositionId = 0 }).Should().Contain(["DepartmentId", "PositionId"]);

    [Fact]
    public void Hire_date_more_than_a_year_ahead_fails() =>
        FailedProperties(_validator, Valid() with { HireDate = Today.AddYears(1).AddDays(1) }).Should().Contain("HireDate");

    [Fact]
    public void Under_age_employee_fails() =>
        FailedProperties(_validator, Valid() with { BirthDate = Today.AddYears(-10) }).Should().Contain("BirthDate");

    [Fact]
    public void Account_creation_requires_valid_role_and_password()
    {
        var request = Valid() with { CreateUserAccount = true, Role = "Overlord", TemporaryPassword = "short" };
        FailedProperties(_validator, request).Should().Contain(["Role", "TemporaryPassword"]);

        var valid = Valid() with { CreateUserAccount = true, Role = "Employee", TemporaryPassword = "Str0ng!Passw0rd" };
        _validator.Validate(valid).IsValid.Should().BeTrue();
    }
}

public class ProjectValidatorTests : ValidatorTestBase
{
    private readonly SaveProjectRequestValidator _validator = new();

    private static SaveProjectRequest Valid() => new(
        "Customer Portal", "CPM-2027", null, Today, Today.AddMonths(6), ProjectStatus.Planning, Priority.High, 1000m, 0, null, 1);

    [Fact]
    public void Valid_request_passes() => _validator.Validate(Valid()).IsValid.Should().BeTrue();

    [Fact]
    public void Open_ended_project_passes() => _validator.Validate(Valid() with { EndDate = null }).IsValid.Should().BeTrue();

    [Fact]
    public void Same_start_and_end_date_passes() => _validator.Validate(Valid() with { EndDate = Today }).IsValid.Should().BeTrue();

    [Fact]
    public void End_before_start_fails()
    {
        var result = _validator.Validate(Valid() with { EndDate = Today.AddDays(-1) });
        result.Errors.Should().ContainSingle(e => e.PropertyName == "EndDate")
            .Which.ErrorMessage.Should().Contain("earlier than start");
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(101)]
    public void Progress_outside_0_to_100_fails(int progress) =>
        FailedProperties(_validator, Valid() with { ProgressPercentage = progress }).Should().Contain("ProgressPercentage");

    [Fact]
    public void Negative_budget_and_bad_code_fail() =>
        FailedProperties(_validator, Valid() with { Budget = -5m, ProjectCode = "CPM 2027" }).Should().Contain(["Budget", "ProjectCode"]);
}

public class TaskValidatorTests : ValidatorTestBase
{
    [Theory]
    [InlineData(0, true)]
    [InlineData(100, true)]
    [InlineData(-1, false)]
    [InlineData(101, false)]
    public void Task_progress_must_be_between_0_and_100(int progress, bool valid)
    {
        var update = new UpdateTaskRequest("Title", null, null, TaskItemStatus.InProgress, Priority.Medium, null, null, null, progress);
        new UpdateTaskRequestValidator().Validate(update).IsValid.Should().Be(valid);

        var status = new UpdateTaskStatusRequest(TaskItemStatus.InProgress, progress, null);
        new UpdateTaskStatusRequestValidator().Validate(status).IsValid.Should().Be(valid);
    }

    [Fact]
    public void New_task_cannot_be_due_in_the_past()
    {
        var validator = new CreateTaskRequestValidator(Clock);
        var request = new CreateTaskRequest(1, "Title", null, null, TaskItemStatus.Todo, Priority.Low, Today.AddDays(-1), null);

        FailedProperties(validator, request).Should().Contain("DueDate");
        validator.Validate(request with { DueDate = Today }).IsValid.Should().BeTrue();
    }
}

public class LeaveValidatorTests : ValidatorTestBase
{
    private readonly CreateLeaveRequestValidator _validator = new(Clock);

    private static CreateLeaveRequest Valid() => new(LeaveType.AnnualLeave, Today.AddDays(7), Today.AddDays(9), null, null);

    [Fact]
    public void Valid_request_passes() => _validator.Validate(Valid()).IsValid.Should().BeTrue();

    [Fact]
    public void End_before_start_fails() =>
        FailedProperties(_validator, Valid() with { EndDate = Today.AddDays(6) }).Should().Contain("EndDate");

    [Fact]
    public void Start_more_than_30_days_in_the_past_fails() =>
        FailedProperties(_validator, Valid() with { StartDate = Today.AddDays(-31), EndDate = Today.AddDays(-31) }).Should().Contain("StartDate");

    [Fact]
    public void Request_longer_than_a_year_fails() =>
        _validator.Validate(Valid() with { EndDate = Today.AddDays(7 + 366) }).IsValid.Should().BeFalse();

    [Fact]
    public void Other_leave_type_requires_reason()
    {
        FailedProperties(_validator, Valid() with { LeaveType = LeaveType.Other }).Should().Contain("Reason");
        _validator.Validate(Valid() with { LeaveType = LeaveType.Other, Reason = "Moving house" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Undefined_leave_type_fails() =>
        FailedProperties(_validator, Valid() with { LeaveType = (LeaveType)999 }).Should().Contain("LeaveType");
}

public class ExpenseValidatorTests : ValidatorTestBase
{
    private readonly SaveExpenseRequestValidator _validator = new(Clock);

    private static SaveExpenseRequest Valid() => new(ExpenseCategory.Travel, 120.50m, "USD", Today, "Train tickets");

    [Fact]
    public void Valid_request_passes() => _validator.Validate(Valid()).IsValid.Should().BeTrue();

    [Theory]
    [InlineData("0")]
    [InlineData("-10")]
    [InlineData("1000000.01")]
    [InlineData("12.345")]
    public void Invalid_amount_fails(string amount) =>
        FailedProperties(_validator, Valid() with { Amount = decimal.Parse(amount, System.Globalization.CultureInfo.InvariantCulture) })
            .Should().Contain("Amount");

    [Theory]
    [InlineData("0.01")]
    [InlineData("1000000")]
    [InlineData("99.90")]
    public void Valid_amount_passes(string amount) =>
        FailedProperties(_validator, Valid() with { Amount = decimal.Parse(amount, System.Globalization.CultureInfo.InvariantCulture) })
            .Should().NotContain("Amount");

    [Fact]
    public void Future_or_too_old_expense_date_fails()
    {
        FailedProperties(_validator, Valid() with { ExpenseDate = Today.AddDays(1) }).Should().Contain("ExpenseDate");
        FailedProperties(_validator, Valid() with { ExpenseDate = Today.AddYears(-1).AddDays(-1) }).Should().Contain("ExpenseDate");
    }

    [Theory]
    [InlineData("")]
    [InlineData("US")]
    [InlineData("US1")]
    public void Currency_must_be_three_letters(string currency) =>
        FailedProperties(_validator, Valid() with { Currency = currency }).Should().Contain("Currency");
}
