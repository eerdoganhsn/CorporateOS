using CorporateOS.Domain.Enums;

namespace CorporateOS.Domain.Constants;

public static class SettingKeys
{
    public const string CompanyName = "General.CompanyName";
    public const string CompanyLogoPath = "General.CompanyLogoPath";
    public const string CompanyEmail = "General.CompanyEmail";
    public const string CompanyPhone = "General.Phone";
    public const string CompanyAddress = "General.Address";
    public const string Timezone = "General.Timezone";
    public const string DefaultCurrency = "General.DefaultCurrency";

    public const string DefaultAnnualLeaveDays = "Leave.DefaultAnnualLeaveDays";
    public const string CarryoverEnabled = "Leave.CarryoverEnabled";
    public const string MaxCarryoverDays = "Leave.MaxCarryoverDays";

    public const string MaxUploadSizeMb = "Files.MaxUploadSizeMb";
    public const string AllowedExtensions = "Files.AllowedExtensions";

    public const string AccessTokenMinutes = "Security.AccessTokenMinutes";
    public const string RefreshTokenDays = "Security.RefreshTokenDays";
    public const string PasswordMinLength = "Security.PasswordMinLength";
    public const string PasswordRequireDigit = "Security.PasswordRequireDigit";
    public const string PasswordRequireUppercase = "Security.PasswordRequireUppercase";
    public const string PasswordRequireNonAlphanumeric = "Security.PasswordRequireNonAlphanumeric";
    public const string MaxFailedLoginAttempts = "Security.MaxFailedLoginAttempts";
    public const string LockoutMinutes = "Security.LockoutMinutes";
}

public sealed record SettingDefinition(
    string Key,
    string DefaultValue,
    string Category,
    SettingDataType DataType,
    string Label,
    string Description,
    bool IsAdvanced,
    int? MinValue = null,
    int? MaxValue = null);

/// <summary>
/// Catalog of every system setting. Settings not in this catalog are rejected,
/// which keeps the key-value store strongly defined.
/// </summary>
public static class SettingCatalog
{
    public static readonly IReadOnlyList<SettingDefinition> All =
    [
        new(SettingKeys.CompanyName, "CorporateOS Inc.", "General", SettingDataType.String, "Company name", "Displayed in the navigation and on reports.", false),
        new(SettingKeys.CompanyLogoPath, "", "General", SettingDataType.String, "Company logo", "Uploaded through the logo endpoint.", false),
        new(SettingKeys.CompanyEmail, "info@corporateos.local", "General", SettingDataType.String, "Company email", "Public contact address.", false),
        new(SettingKeys.CompanyPhone, "+1 555 0100", "General", SettingDataType.String, "Phone", "Main switchboard number.", false),
        new(SettingKeys.CompanyAddress, "100 Enterprise Way, Suite 400, Springfield", "General", SettingDataType.String, "Address", "Headquarters address.", false),
        new(SettingKeys.Timezone, "UTC", "General", SettingDataType.String, "Timezone", "IANA timezone used for display.", false),
        new(SettingKeys.DefaultCurrency, "USD", "General", SettingDataType.String, "Default currency", "ISO 4217 code used for new expenses.", false),

        new(SettingKeys.DefaultAnnualLeaveDays, "20", "Leave", SettingDataType.Integer, "Default annual leave days", "Annual leave allowance granted when a yearly balance is created.", true, 0, 60),
        new(SettingKeys.CarryoverEnabled, "false", "Leave", SettingDataType.Boolean, "Carryover enabled", "Allow unused annual leave to roll into the next year.", true),
        new(SettingKeys.MaxCarryoverDays, "5", "Leave", SettingDataType.Integer, "Maximum carryover days", "Upper bound of days carried into the next year.", true, 0, 30),

        new(SettingKeys.MaxUploadSizeMb, "10", "Files", SettingDataType.Integer, "Maximum upload size (MB)", "Largest accepted document or receipt.", true, 1, 50),
        new(SettingKeys.AllowedExtensions, ".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.txt,.csv", "Files", SettingDataType.String, "Allowed extensions", "Comma-separated list. Executable types are always blocked.", true),

        new(SettingKeys.AccessTokenMinutes, "15", "Security", SettingDataType.Integer, "Access token lifetime (minutes)", "How long an access token stays valid.", true, 5, 120),
        new(SettingKeys.RefreshTokenDays, "7", "Security", SettingDataType.Integer, "Session duration (days)", "Refresh token lifetime; users must sign in again after this.", true, 1, 30),
        new(SettingKeys.PasswordMinLength, "8", "Security", SettingDataType.Integer, "Minimum password length", "Applied to new and changed passwords.", true, 8, 64),
        new(SettingKeys.PasswordRequireDigit, "true", "Security", SettingDataType.Boolean, "Require digit", "Passwords must contain a number.", true),
        new(SettingKeys.PasswordRequireUppercase, "true", "Security", SettingDataType.Boolean, "Require uppercase", "Passwords must contain an uppercase letter.", true),
        new(SettingKeys.PasswordRequireNonAlphanumeric, "true", "Security", SettingDataType.Boolean, "Require symbol", "Passwords must contain a non-alphanumeric character.", true),
        new(SettingKeys.MaxFailedLoginAttempts, "5", "Security", SettingDataType.Integer, "Failed attempts before lockout", "Consecutive failed sign-ins that lock the account.", true, 3, 20),
        new(SettingKeys.LockoutMinutes, "15", "Security", SettingDataType.Integer, "Lockout duration (minutes)", "How long an account stays locked.", true, 1, 1440),
    ];

    public static SettingDefinition? Find(string key) =>
        All.FirstOrDefault(d => string.Equals(d.Key, key, StringComparison.OrdinalIgnoreCase));
}
