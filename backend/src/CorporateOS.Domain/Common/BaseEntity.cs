namespace CorporateOS.Domain.Common;

/// <summary>Root of every persisted domain entity that uses an integer surrogate key.</summary>
public abstract class BaseEntity
{
    public int Id { get; set; }
}

/// <summary>
/// Entity whose creation and modification metadata is maintained automatically
/// by the persistence layer (see AuditableEntityInterceptor).
/// </summary>
public abstract class AuditableEntity : BaseEntity
{
    public DateTime CreatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
}

/// <summary>
/// Marks entities that are hidden instead of physically deleted.
/// A global query filter excludes deleted rows.
/// </summary>
public interface ISoftDeletable
{
    bool IsDeleted { get; set; }
    DateTime? DeletedAt { get; set; }
    Guid? DeletedBy { get; set; }
}
