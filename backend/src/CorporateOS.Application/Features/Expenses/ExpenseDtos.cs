using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Features.Leave;
using CorporateOS.Domain.Enums;
using FluentValidation;

namespace CorporateOS.Application.Features.Expenses;

public sealed class ExpenseQuery : PagedQuery
{
    public RequestListScope Scope { get; set; } = RequestListScope.Mine;
    public int? EmployeeId { get; set; }
    public int? DepartmentId { get; set; }
    public ExpenseStatus? Status { get; set; }
    public ExpenseCategory? Category { get; set; }
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
}

public sealed record ExpenseDto(
    int Id,
    int EmployeeId,
    string EmployeeName,
    string EmployeeNumber,
    string DepartmentName,
    ExpenseCategory Category,
    decimal Amount,
    string Currency,
    DateOnly ExpenseDate,
    string Description,
    bool HasReceipt,
    string? ReceiptFileName,
    ExpenseStatus Status,
    DateTime? SubmittedAt,
    string? ApprovedByName,
    DateTime? ApprovedAt,
    string? ApprovalNote,
    string? RejectionReason,
    DateTime? PaidAt,
    DateTime CreatedAt,
    bool CanEdit,
    bool CanApprove,
    bool CanMarkPaid);

public sealed record ExpenseTotalsDto(int Count, decimal DraftAmount, decimal SubmittedAmount, decimal ApprovedAmount, decimal PaidAmount);

public sealed record SaveExpenseRequest(ExpenseCategory Category, decimal Amount, string Currency, DateOnly ExpenseDate, string Description);

public sealed record ApproveExpenseRequest(string? Note);

public sealed record RejectExpenseRequest(string Reason);

public sealed class SaveExpenseRequestValidator : AbstractValidator<SaveExpenseRequest>
{
    public SaveExpenseRequestValidator(TimeProvider clock)
    {
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);

        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.Amount).GreaterThan(0).WithMessage("Amount must be greater than zero.")
            .LessThanOrEqualTo(1_000_000).WithMessage("Amount cannot exceed 1,000,000.")
            .PrecisionScale(18, 2, ignoreTrailingZeros: true).WithMessage("Amount can have at most two decimal places.");
        RuleFor(x => x.Currency).NotEmpty().WithMessage("Currency is required.")
            .Matches("^[A-Za-z]{3}$").WithMessage("Currency must be a three-letter ISO code (e.g. USD).");
        RuleFor(x => x.ExpenseDate).NotEmpty()
            .LessThanOrEqualTo(today).WithMessage("Expense date cannot be in the future.")
            .GreaterThanOrEqualTo(today.AddYears(-1)).WithMessage("Expenses older than one year cannot be claimed.");
        RuleFor(x => x.Description).NotEmpty().MaximumLength(1000);
    }
}

public sealed class ApproveExpenseRequestValidator : AbstractValidator<ApproveExpenseRequest>
{
    public ApproveExpenseRequestValidator() => RuleFor(x => x.Note).MaximumLength(1000);
}

public sealed class RejectExpenseRequestValidator : AbstractValidator<RejectExpenseRequest>
{
    public RejectExpenseRequestValidator() =>
        RuleFor(x => x.Reason).NotEmpty().WithMessage("A rejection reason is required.").MaximumLength(1000);
}
