using CorporateOS.Domain.Common;
using CorporateOS.Domain.Enums;

namespace CorporateOS.Domain.Entities;

public class Project : AuditableEntity
{
    public string Name { get; set; } = string.Empty;
    public string ProjectCode { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public ProjectStatus Status { get; set; } = ProjectStatus.Planning;
    public Priority Priority { get; set; } = Priority.Medium;
    public decimal? Budget { get; set; }
    public int ProgressPercentage { get; set; }
    public int? ProjectManagerId { get; set; }
    public Employee? ProjectManager { get; set; }
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }
    public bool IsArchived { get; set; }
    public DateTime? ArchivedAt { get; set; }

    public ICollection<ProjectMember> Members { get; set; } = new List<ProjectMember>();
    public ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
}

public class ProjectMember : BaseEntity
{
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public int EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;
    public string Role { get; set; } = "Member";
    public DateTime JoinedAt { get; set; }
}

/// <summary>Named TaskItem to avoid clashing with System.Threading.Tasks.Task.</summary>
public class TaskItem : AuditableEntity, ISoftDeletable
{
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? AssignedToId { get; set; }
    public Employee? AssignedTo { get; set; }
    public int? AssignedById { get; set; }
    public Employee? AssignedBy { get; set; }
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Todo;
    public Priority Priority { get; set; } = Priority.Medium;
    public DateOnly? DueDate { get; set; }
    public decimal? EstimatedHours { get; set; }
    public decimal? ActualHours { get; set; }
    public int ProgressPercentage { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? DueSoonNotifiedAt { get; set; }

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }

    public ICollection<TaskComment> Comments { get; set; } = new List<TaskComment>();

    public bool IsOpen => Status is not (TaskItemStatus.Completed or TaskItemStatus.Cancelled);

    public void ChangeStatus(TaskItemStatus status, DateTime now)
    {
        Status = status;
        if (status == TaskItemStatus.Completed)
        {
            ProgressPercentage = 100;
            CompletedAt ??= now;
        }
        else
        {
            CompletedAt = null;
        }
    }
}

public class TaskComment : BaseEntity
{
    public int TaskItemId { get; set; }
    public TaskItem TaskItem { get; set; } = null!;
    public Guid AuthorId { get; set; }
    public ApplicationUser Author { get; set; } = null!;
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
