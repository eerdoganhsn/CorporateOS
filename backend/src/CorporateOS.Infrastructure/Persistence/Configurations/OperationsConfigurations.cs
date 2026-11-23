using CorporateOS.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CorporateOS.Infrastructure.Persistence.Configurations;

public sealed class LeaveRequestConfiguration : IEntityTypeConfiguration<LeaveRequest>
{
    public void Configure(EntityTypeBuilder<LeaveRequest> builder)
    {
        builder.ToTable("LeaveRequests", t =>
        {
            t.HasCheckConstraint("CK_LeaveRequests_Dates", "[EndDate] >= [StartDate]");
            t.HasCheckConstraint("CK_LeaveRequests_TotalDays", "[TotalDays] > 0");
        });

        builder.Property(l => l.Reason).HasMaxLength(1000);
        builder.Property(l => l.ApprovalNote).HasMaxLength(1000);
        builder.Property(l => l.RejectionReason).HasMaxLength(1000);

        builder.HasIndex(l => l.EmployeeId);
        builder.HasIndex(l => l.Status);
        builder.HasIndex(l => new { l.StartDate, l.EndDate });

        builder.HasOne(l => l.Employee)
            .WithMany(e => e.LeaveRequests)
            .HasForeignKey(l => l.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(l => l.ApprovedBy)
            .WithMany()
            .HasForeignKey(l => l.ApprovedById)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class LeaveBalanceConfiguration : IEntityTypeConfiguration<LeaveBalance>
{
    public void Configure(EntityTypeBuilder<LeaveBalance> builder)
    {
        builder.ToTable("LeaveBalances", t =>
        {
            t.HasCheckConstraint("CK_LeaveBalances_Used", "[UsedDays] >= 0");
        });

        builder.Ignore(b => b.Available);
        builder.Property(b => b.RemainingDays)
            .HasComputedColumnSql("[TotalDays] - [UsedDays]", stored: true);

        builder.HasIndex(b => new { b.EmployeeId, b.Year }).IsUnique();

        builder.HasOne(b => b.Employee)
            .WithMany(e => e.LeaveBalances)
            .HasForeignKey(b => b.EmployeeId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class ExpenseConfiguration : IEntityTypeConfiguration<Expense>
{
    public void Configure(EntityTypeBuilder<Expense> builder)
    {
        builder.ToTable("Expenses", t =>
        {
            t.HasCheckConstraint("CK_Expenses_Amount", "[Amount] > 0");
        });
        builder.Ignore(e => e.IsEditable);

        builder.Property(e => e.Currency).HasMaxLength(3).IsFixedLength().IsRequired();
        builder.Property(e => e.Description).HasMaxLength(1000).IsRequired();
        builder.Property(e => e.ReceiptPath).HasMaxLength(300);
        builder.Property(e => e.ReceiptFileName).HasMaxLength(255);
        builder.Property(e => e.ReceiptContentType).HasMaxLength(100);
        builder.Property(e => e.ApprovalNote).HasMaxLength(1000);
        builder.Property(e => e.RejectionReason).HasMaxLength(1000);

        builder.HasIndex(e => e.EmployeeId);
        builder.HasIndex(e => e.Status);
        builder.HasIndex(e => e.ExpenseDate);

        builder.HasOne(e => e.Employee)
            .WithMany(emp => emp.Expenses)
            .HasForeignKey(e => e.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.ApprovedBy)
            .WithMany()
            .HasForeignKey(e => e.ApprovedById)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
