namespace CorporateOS.Domain.Enums;

public enum AnnouncementPriority
{
    Low = 1,
    Normal = 2,
    High = 3,
    Urgent = 4
}

public enum AnnouncementTarget
{
    AllEmployees = 1,
    SpecificDepartment = 2,
    ManagersOnly = 3
}

public enum DocumentCategory
{
    HR = 1,
    Policy = 2,
    Procedure = 3,
    Finance = 4,
    Project = 5,
    General = 6
}

public enum DocumentAccessLevel
{
    AllEmployees = 1,
    Managers = 2,
    DepartmentOnly = 3,
    AdminOnly = 4
}

public enum NotificationType
{
    System = 0,
    TaskAssigned = 1,
    TaskDueSoon = 2,
    TaskStatusChanged = 3,
    TaskComment = 4,
    LeaveSubmitted = 10,
    LeaveApproved = 11,
    LeaveRejected = 12,
    ExpenseSubmitted = 20,
    ExpenseApproved = 21,
    ExpenseRejected = 22,
    ExpensePaid = 23,
    AnnouncementPublished = 30,
    ProjectAssignment = 40,
    DocumentShared = 50
}

public enum SettingDataType
{
    String = 1,
    Integer = 2,
    Boolean = 3
}
