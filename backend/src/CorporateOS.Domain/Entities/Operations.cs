using CorporateOS.Domain.Common;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Exceptions;
using CorporateOS.Domain.Localization;

namespace CorporateOS.Domain.Entities;

public class LeaveRequest : AuditableEntity
{
    public int EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;
    public LeaveType LeaveType { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public int TotalDays { get; set; }
    public string? Reason { get; set; }
    public LeaveRequestStatus Status { get; set; } = LeaveRequestStatus.Pending;
    public int? ApprovedById { get; set; }
    public Employee? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? ApprovalNote { get; set; }
    public string? RejectionReason { get; set; }

    public void Approve(int approverEmployeeId, string? note, DateTime now)
    {
        EnsurePending("leave.approveNotPending");
        if (approverEmployeeId == EmployeeId)
        {
            throw new DomainException(Text.Get("leave.cannotApproveOwn"));
        }

        Status = LeaveRequestStatus.Approved;
        ApprovedById = approverEmployeeId;
        ApprovedAt = now;
        ApprovalNote = note;
    }

    public void Reject(int approverEmployeeId, string reason, DateTime now)
    {
        EnsurePending("leave.rejectNotPending");
        if (approverEmployeeId == EmployeeId)
        {
            throw new DomainException(Text.Get("leave.cannotRejectOwn"));
        }

        Status = LeaveRequestStatus.Rejected;
        ApprovedById = approverEmployeeId;
        ApprovedAt = now;
        RejectionReason = reason;
    }

    public void Cancel()
    {
        EnsurePending("leave.cancelNotPending");
        Status = LeaveRequestStatus.Cancelled;
    }

    private void EnsurePending(string messageKey)
    {
        if (Status != LeaveRequestStatus.Pending)
        {
            throw new DomainException(Text.Get(messageKey, Status));
        }
    }
}

public class LeaveBalance : BaseEntity
{
    public int EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;
    public int Year { get; set; }
    public int TotalDays { get; set; }
    public int UsedDays { get; set; }

    /// <summary>Persisted computed column (TotalDays - UsedDays).</summary>
    public int RemainingDays { get; private set; }

    public int Available => TotalDays - UsedDays;
}

public class Expense : AuditableEntity
{
    public int EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;
    public ExpenseCategory Category { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public DateOnly ExpenseDate { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? ReceiptPath { get; set; }
    public string? ReceiptFileName { get; set; }
    public string? ReceiptContentType { get; set; }
    public ExpenseStatus Status { get; set; } = ExpenseStatus.Draft;
    public DateTime? SubmittedAt { get; set; }
    public int? ApprovedById { get; set; }
    public Employee? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? ApprovalNote { get; set; }
    public string? RejectionReason { get; set; }
    public DateTime? PaidAt { get; set; }

    public bool IsEditable => Status is ExpenseStatus.Draft or ExpenseStatus.Rejected;

    public void Submit(DateTime now)
    {
        if (!IsEditable)
        {
            throw new DomainException(Text.Get("expense.submitNotAllowed", Status));
        }

        Status = ExpenseStatus.Submitted;
        SubmittedAt = now;
        RejectionReason = null;
        ApprovedById = null;
        ApprovedAt = null;
    }

    public void Approve(int approverEmployeeId, string? note, DateTime now)
    {
        EnsureSubmitted(approve: true, approverEmployeeId);
        Status = ExpenseStatus.Approved;
        ApprovedById = approverEmployeeId;
        ApprovedAt = now;
        ApprovalNote = note;
    }

    public void Reject(int approverEmployeeId, string reason, DateTime now)
    {
        EnsureSubmitted(approve: false, approverEmployeeId);
        Status = ExpenseStatus.Rejected;
        ApprovedById = approverEmployeeId;
        ApprovedAt = now;
        RejectionReason = reason;
    }

    public void MarkPaid(DateTime now)
    {
        if (Status != ExpenseStatus.Approved)
        {
            throw new DomainException(Text.Get("expense.onlyApprovedPaid"));
        }

        Status = ExpenseStatus.Paid;
        PaidAt = now;
    }

    private void EnsureSubmitted(bool approve, int approverEmployeeId)
    {
        if (Status != ExpenseStatus.Submitted)
        {
            throw new DomainException(Text.Get(approve ? "expense.approveNotSubmitted" : "expense.rejectNotSubmitted", Status));
        }

        if (approverEmployeeId == EmployeeId)
        {
            throw new DomainException(Text.Get(approve ? "expense.cannotApproveOwn" : "expense.cannotRejectOwn"));
        }
    }
}
