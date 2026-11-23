using CorporateOS.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CorporateOS.Infrastructure.Persistence.Configurations;

public sealed class ProjectConfiguration : IEntityTypeConfiguration<Project>
{
    public void Configure(EntityTypeBuilder<Project> builder)
    {
        builder.ToTable("Projects", t =>
        {
            t.HasCheckConstraint("CK_Projects_Progress", "[ProgressPercentage] BETWEEN 0 AND 100");
            t.HasCheckConstraint("CK_Projects_Dates", "[EndDate] IS NULL OR [EndDate] >= [StartDate]");
        });

        builder.Property(p => p.Name).HasMaxLength(200).IsRequired();
        builder.Property(p => p.ProjectCode).HasMaxLength(20).IsRequired();
        builder.Property(p => p.Description).HasMaxLength(4000);

        builder.HasIndex(p => p.ProjectCode).IsUnique();
        builder.HasIndex(p => new { p.Status, p.IsArchived });
        builder.HasIndex(p => p.DepartmentId);

        builder.HasOne(p => p.ProjectManager)
            .WithMany()
            .HasForeignKey(p => p.ProjectManagerId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(p => p.Department)
            .WithMany(d => d.Projects)
            .HasForeignKey(p => p.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class ProjectMemberConfiguration : IEntityTypeConfiguration<ProjectMember>
{
    public void Configure(EntityTypeBuilder<ProjectMember> builder)
    {
        builder.ToTable("ProjectMembers");
        builder.Property(m => m.Role).HasMaxLength(100).IsRequired();
        builder.HasIndex(m => new { m.ProjectId, m.EmployeeId }).IsUnique();

        builder.HasOne(m => m.Project)
            .WithMany(p => p.Members)
            .HasForeignKey(m => m.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(m => m.Employee)
            .WithMany(e => e.ProjectMemberships)
            .HasForeignKey(m => m.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    public void Configure(EntityTypeBuilder<TaskItem> builder)
    {
        builder.ToTable("Tasks", t =>
        {
            t.HasCheckConstraint("CK_Tasks_Progress", "[ProgressPercentage] BETWEEN 0 AND 100");
        });
        builder.Ignore(t => t.IsOpen);

        builder.Property(t => t.Title).HasMaxLength(200).IsRequired();
        builder.Property(t => t.Description).HasMaxLength(4000);
        builder.Property(t => t.EstimatedHours).HasPrecision(7, 2);
        builder.Property(t => t.ActualHours).HasPrecision(7, 2);

        builder.HasIndex(t => t.Status);
        builder.HasIndex(t => t.AssignedToId);
        builder.HasIndex(t => new { t.ProjectId, t.Status });
        builder.HasIndex(t => t.DueDate);

        builder.HasOne(t => t.Project)
            .WithMany(p => p.Tasks)
            .HasForeignKey(t => t.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(t => t.AssignedTo)
            .WithMany(e => e.AssignedTasks)
            .HasForeignKey(t => t.AssignedToId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(t => t.AssignedBy)
            .WithMany()
            .HasForeignKey(t => t.AssignedById)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class TaskCommentConfiguration : IEntityTypeConfiguration<TaskComment>
{
    public void Configure(EntityTypeBuilder<TaskComment> builder)
    {
        builder.ToTable("TaskComments");
        builder.Property(c => c.Content).HasMaxLength(2000).IsRequired();
        builder.HasIndex(c => new { c.TaskItemId, c.CreatedAt });

        builder.HasOne(c => c.TaskItem)
            .WithMany(t => t.Comments)
            .HasForeignKey(c => c.TaskItemId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(c => c.Author)
            .WithMany()
            .HasForeignKey(c => c.AuthorId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
