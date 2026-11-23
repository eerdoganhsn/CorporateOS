namespace CorporateOS.API.Configuration;

public sealed class AuthCookieOptions
{
    public const string SectionName = "AuthCookie";

    public string Name { get; set; } = "corporateos_rt";
    public string Path { get; set; } = "/api/auth";

    /// <summary>Must be true in production (HTTPS). Disabled only for plain-HTTP local development and tests.</summary>
    public bool Secure { get; set; } = true;
}

public sealed class CorsSettings
{
    public const string SectionName = "Cors";
    public const string PolicyName = "Frontend";

    public string[] AllowedOrigins { get; set; } = [];
}

public sealed class RateLimitSettings
{
    public const string SectionName = "RateLimiting";

    /// <summary>Requests per minute per IP address on sign-in and password endpoints.</summary>
    public int AuthPermitLimit { get; set; } = 10;
}

public static class RateLimitPolicies
{
    public const string Auth = "auth";
}
