namespace CorporateOS.Domain.Enums;

public enum LeaveType
{
    AnnualLeave = 1,
    SickLeave = 2,
    UnpaidLeave = 3,
    MaternityLeave = 4,
    PaternityLeave = 5,
    Other = 6
}

public enum LeaveRequestStatus
{
    Pending = 1,
    Approved = 2,
    Rejected = 3,
    Cancelled = 4
}

public enum ExpenseCategory
{
    Travel = 1,
    Meal = 2,
    Accommodation = 3,
    Transportation = 4,
    Office = 5,
    Equipment = 6,
    Other = 7
}

public enum ExpenseStatus
{
    Draft = 1,
    Submitted = 2,
    Approved = 3,
    Rejected = 4,
    Paid = 5
}
