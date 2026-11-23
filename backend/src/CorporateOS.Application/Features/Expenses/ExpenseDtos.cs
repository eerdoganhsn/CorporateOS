using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Features.Leave;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
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
        RuleFor(x => x.Amount).GreaterThan(0).WithMessage(_ => Text.Get("expense.amountPositive"))
            .LessThanOrEqualTo(1_000_000).WithMessage(_ => Text.Get("expense.amountMax"))
            .PrecisionScale(18, 2, ignoreTrailingZeros: true).WithMessage(_ => Text.Get("expense.amountDecimals"));
        RuleFor(x => x.Currency).NotEmpty().WithMessage(_ => Text.Get("expense.currencyRequired"))
            .Matches("^[A-Za-z]{3}$").WithMessage(_ => Text.Get("expense.currencyFormat"));
        RuleFor(x => x.ExpenseDate).NotEmpty()
            .LessThanOrEqualTo(today).WithMessage(_ => Text.Get("expense.dateInFuture"))
            .GreaterThanOrEqualTo(today.AddYears(-1)).WithMessage(_ => Text.Get("expense.dateTooOld"));
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
        RuleFor(x => x.Reason).NotEmpty().WithMessage(_ => Text.Get("error.rejectionReasonRequired")).MaximumLength(1000);
}
