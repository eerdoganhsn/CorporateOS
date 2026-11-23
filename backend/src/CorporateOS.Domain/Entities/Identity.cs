using Microsoft.AspNetCore.Identity;

namespace CorporateOS.Domain.Entities;

public class ApplicationUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; }

    /// <summary>UI and notification language (tr, en or de); see <see cref="Localization.Languages"/>.</summary>
    public string PreferredLanguage { get; set; } = Localization.Languages.Default;

    public Employee? Employee { get; set; }
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}

public class ApplicationRole : IdentityRole<Guid>
{
    public string Description { get; set; } = string.Empty;

    public ApplicationRole() { }

    public ApplicationRole(string name, string description) : base(name)
    {
        Description = description;
    }
}

/// <summary>
/// Refresh tokens are stored as SHA-256 hashes. The raw value only ever exists in the
/// HttpOnly cookie, so a database leak does not expose usable tokens.
/// </summary>
public class RefreshToken
{
    public int Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public string TokenHash { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? CreatedByIp { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? RevokedByIp { get; set; }
    public string? ReplacedByTokenHash { get; set; }
    public string? RevokedReason { get; set; }

    public bool IsActive(DateTime now) => RevokedAt is null && ExpiresAt > now;

    public void Revoke(DateTime now, string? ip, string reason, string? replacedByHash = null)
    {
        RevokedAt = now;
        RevokedByIp = ip;
        RevokedReason = reason;
        ReplacedByTokenHash = replacedByHash;
    }
}
