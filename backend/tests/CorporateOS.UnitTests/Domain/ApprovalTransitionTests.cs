using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Exceptions;
using FluentAssertions;

namespace CorporateOS.UnitTests.Domain;

public class LeaveRequestTransitionTests
{
    private const int Requester = 10;
    private const int Approver = 20;
    private static readonly DateTime Now = new(2026, 11, 23, 9, 0, 0, DateTimeKind.Utc);

    private static LeaveRequest Pending() => new() { EmployeeId = Requester, Status = LeaveRequestStatus.Pending };

    [Fact]
    public void Approve_pending_sets_approver_and_timestamp()
    {
        var leave = Pending();
        leave.Approve(Approver, "Enjoy", Now);

        leave.Status.Should().Be(LeaveRequestStatus.Approved);
        leave.ApprovedById.Should().Be(Approver);
        leave.ApprovedAt.Should().Be(Now);
        leave.ApprovalNote.Should().Be("Enjoy");
    }

    [Fact]
    public void Reject_pending_stores_reason()
    {
        var leave = Pending();
        leave.Reject(Approver, "Busy period", Now);

        leave.Status.Should().Be(LeaveRequestStatus.Rejected);
        leave.RejectionReason.Should().Be("Busy period");
    }

    [Fact]
    public void Cannot_approve_own_request()
    {
        var act = () => Pending().Approve(Requester, null, Now);
        act.Should().Throw<DomainException>().WithMessage("*own leave request*");
    }

    [Fact]
    public void Cannot_reject_own_request()
    {
        var act = () => Pending().Reject(Requester, "x", Now);
        act.Should().Throw<DomainException>();
    }

    [Theory]
    [InlineData(LeaveRequestStatus.Approved)]
    [InlineData(LeaveRequestStatus.Rejected)]
    [InlineData(LeaveRequestStatus.Cancelled)]
    public void Only_pending_requests_can_change(LeaveRequestStatus status)
    {
        var leave = new LeaveRequest { EmployeeId = Requester, Status = status };

        leave.Invoking(l => l.Approve(Approver, null, Now)).Should().Throw<DomainException>().WithMessage("*pending*");
        leave.Invoking(l => l.Reject(Approver, "x", Now)).Should().Throw<DomainException>();
        leave.Invoking(l => l.Cancel()).Should().Throw<DomainException>();
        leave.Status.Should().Be(status);
    }

    [Fact]
    public void Cancel_pending_request()
    {
        var leave = Pending();
        leave.Cancel();
        leave.Status.Should().Be(LeaveRequestStatus.Cancelled);
    }
}

public class ExpenseTransitionTests
{
    private const int Owner = 10;
    private const int Approver = 20;
    private static readonly DateTime Now = new(2026, 11, 23, 9, 0, 0, DateTimeKind.Utc);

    private static Expense Draft() => new() { EmployeeId = Owner, Amount = 50m, Status = ExpenseStatus.Draft };

    private static Expense Submitted()
    {
        var expense = Draft();
        expense.Submit(Now);
        return expense;
    }

    [Fact]
    public void Submit_draft_sets_submitted_state()
    {
        var expense = Submitted();
        expense.Status.Should().Be(ExpenseStatus.Submitted);
        expense.SubmittedAt.Should().Be(Now);
    }

    [Fact]
    public void Rejected_expense_can_be_resubmitted_and_rejection_is_cleared()
    {
        var expense = Submitted();
        expense.Reject(Approver, "Missing receipt", Now);
        expense.IsEditable.Should().BeTrue();

        expense.Submit(Now.AddHours(1));

        expense.Status.Should().Be(ExpenseStatus.Submitted);
        expense.RejectionReason.Should().BeNull();
        expense.ApprovedById.Should().BeNull();
    }

    [Fact]
    public void Approve_submitted_expense()
    {
        var expense = Submitted();
        expense.Approve(Approver, "OK", Now);

        expense.Status.Should().Be(ExpenseStatus.Approved);
        expense.ApprovedById.Should().Be(Approver);
        expense.IsEditable.Should().BeFalse();
    }

    [Fact]
    public void Cannot_approve_a_draft()
    {
        Draft().Invoking(e => e.Approve(Approver, null, Now)).Should().Throw<DomainException>().WithMessage("*submitted*");
    }

    [Fact]
    public void Cannot_approve_or_reject_own_expense()
    {
        Submitted().Invoking(e => e.Approve(Owner, null, Now)).Should().Throw<DomainException>().WithMessage("*own expenses*");
        Submitted().Invoking(e => e.Reject(Owner, "x", Now)).Should().Throw<DomainException>();
    }

    [Fact]
    public void Approved_expense_cannot_be_submitted_again()
    {
        var expense = Submitted();
        expense.Approve(Approver, null, Now);
        expense.Invoking(e => e.Submit(Now)).Should().Throw<DomainException>();
    }

    [Fact]
    public void Only_approved_expense_can_be_marked_paid()
    {
        Submitted().Invoking(e => e.MarkPaid(Now)).Should().Throw<DomainException>();

        var expense = Submitted();
        expense.Approve(Approver, null, Now);
        expense.MarkPaid(Now);
        expense.Status.Should().Be(ExpenseStatus.Paid);
        expense.PaidAt.Should().Be(Now);
    }
}

public class TaskStatusTransitionTests
{
    private static readonly DateTime Now = new(2026, 11, 23, 9, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Completing_sets_full_progress_and_completion_time()
    {
        var task = new TaskItem { ProgressPercentage = 40 };
        task.ChangeStatus(TaskItemStatus.Completed, Now);

        task.ProgressPercentage.Should().Be(100);
        task.CompletedAt.Should().Be(Now);
    }

    [Fact]
    public void Reopening_clears_completion_time()
    {
        var task = new TaskItem();
        task.ChangeStatus(TaskItemStatus.Completed, Now);
        task.ChangeStatus(TaskItemStatus.InProgress, Now.AddDays(1));

        task.CompletedAt.Should().BeNull();
    }
}
