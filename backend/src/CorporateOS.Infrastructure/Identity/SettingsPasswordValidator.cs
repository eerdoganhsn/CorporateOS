using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Localization;
using Microsoft.AspNetCore.Identity;

namespace CorporateOS.Infrastructure.Identity;

/// <summary>
/// Enforces the password policy stored in system settings, so SuperAdmins can tighten it
/// at runtime without a redeploy. Identity's static options are configured permissively
/// and this validator is the single source of truth.
/// </summary>
public sealed class SettingsPasswordValidator(ISettingsService settings) : IPasswordValidator<ApplicationUser>
{
    public async Task<IdentityResult> ValidateAsync(UserManager<ApplicationUser> manager, ApplicationUser user, string? password)
    {
        password ??= string.Empty;
        var errors = new List<IdentityError>();

        var minLength = await settings.GetIntAsync(SettingKeys.PasswordMinLength);
        if (password.Length < minLength)
        {
            errors.Add(Error("PasswordTooShort", $"Password must be at least {minLength} characters."));
        }

        if (await settings.GetBoolAsync(SettingKeys.PasswordRequireDigit) && !password.Any(char.IsDigit))
        {
            errors.Add(Error("PasswordRequiresDigit", Text.Get("password.requiresDigit")));
        }

        if (await settings.GetBoolAsync(SettingKeys.PasswordRequireUppercase) && !password.Any(char.IsUpper))
        {
            errors.Add(Error("PasswordRequiresUpper", Text.Get("password.requiresUpper")));
        }

        if (await settings.GetBoolAsync(SettingKeys.PasswordRequireNonAlphanumeric) && password.All(char.IsLetterOrDigit))
        {
            errors.Add(Error("PasswordRequiresNonAlphanumeric", Text.Get("password.requiresSymbol")));
        }

        return errors.Count == 0 ? IdentityResult.Success : IdentityResult.Failed([.. errors]);
    }

    private static IdentityError Error(string code, string description) => new() { Code = code, Description = description };
}
