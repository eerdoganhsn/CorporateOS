using CorporateOS.Domain.Common;
using CorporateOS.Domain.Enums;

namespace CorporateOS.Domain.Entities;

public class Department : AuditableEntity, ISoftDeletable
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? ManagerId { get; set; }
    public Employee? Manager { get; set; }
    public RecordStatus Status { get; set; } = RecordStatus.Active;

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }

    public ICollection<Employee> Employees { get; set; } = new List<Employee>();
    public ICollection<Position> Positions { get; set; } = new List<Position>();
    public ICollection<Project> Projects { get; set; } = new List<Project>();
}

public class Position : AuditableEntity
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }
    public PositionLevel Level { get; set; } = PositionLevel.Mid;
    public RecordStatus Status { get; set; } = RecordStatus.Active;

    public ICollection<Employee> Employees { get; set; } = new List<Employee>();
}

public class Employee : AuditableEntity, ISoftDeletable
{
    public string EmployeeNumber { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }

    public int DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
    public int PositionId { get; set; }
    public Position Position { get; set; } = null!;
    public int? ManagerId { get; set; }
    public Employee? Manager { get; set; }

    public DateOnly HireDate { get; set; }
    public EmploymentType EmploymentType { get; set; } = EmploymentType.FullTime;
    public EmployeeStatus Status { get; set; } = EmployeeStatus.Active;
    public string? ProfileImagePath { get; set; }
    public string? Address { get; set; }
    public string? EmergencyContactName { get; set; }
    public string? EmergencyContactPhone { get; set; }
    public DateOnly? BirthDate { get; set; }
    public decimal? Salary { get; set; }

    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }

    public ICollection<Employee> DirectReports { get; set; } = new List<Employee>();
    public ICollection<ProjectMember> ProjectMemberships { get; set; } = new List<ProjectMember>();
    public ICollection<TaskItem> AssignedTasks { get; set; } = new List<TaskItem>();
    public ICollection<LeaveRequest> LeaveRequests { get; set; } = new List<LeaveRequest>();
    public ICollection<LeaveBalance> LeaveBalances { get; set; } = new List<LeaveBalance>();
    public ICollection<Expense> Expenses { get; set; } = new List<Expense>();

    public string FullName => $"{FirstName} {LastName}";
}
