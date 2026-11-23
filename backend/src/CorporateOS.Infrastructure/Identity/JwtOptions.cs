using System.ComponentModel.DataAnnotations;

namespace CorporateOS.Infrastructure.Identity;

/// <summary>Bound from the "Jwt" section (Jwt__Key, Jwt__Issuer, Jwt__Audience environment variables).</summary>
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>HMAC-SHA256 signing key. Must be at least 32 characters and never committed.</summary>
    [Required, MinLength(32)]
    public string Key { get; set; } = string.Empty;

    [Required]
    public string Issuer { get; set; } = string.Empty;

    [Required]
    public string Audience { get; set; } = string.Empty;
}
