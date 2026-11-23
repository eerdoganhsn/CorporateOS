using System.Globalization;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Files;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Settings;

public sealed record SettingDto(
    string Key,
    string Value,
    string Category,
    SettingDataType DataType,
    string Label,
    string Description,
    bool IsAdvanced,
    bool CanEdit,
    int? MinValue,
    int? MaxValue,
    DateTime? UpdatedAt);

public sealed record UpdateSettingsRequest(Dictionary<string, string> Values);

public sealed record PublicSettingsDto(
    string CompanyName,
    bool HasLogo,
    string? CompanyEmail,
    string? Phone,
    string? Address,
    string Timezone,
    string DefaultCurrency,
    int MaxUploadSizeMb,
    IReadOnlyList<string> AllowedExtensions);

public sealed class UpdateSettingsRequestValidator : AbstractValidator<UpdateSettingsRequest>
{
    public UpdateSettingsRequestValidator()
    {
        RuleFor(x => x.Values).NotEmpty().WithMessage(_ => Text.Get("settings.noValues"));
        RuleForEach(x => x.Values).Must(kv => kv.Value is not null && kv.Value.Length <= 2000)
            .WithMessage(_ => Text.Get("settings.valueTooLong"));
    }
}

public interface ISettingsAdminService
{
    Task<IReadOnlyList<SettingDto>> GetAllAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<SettingDto>> UpdateAsync(UpdateSettingsRequest request, CancellationToken cancellationToken);
    Task<PublicSettingsDto> GetPublicAsync(CancellationToken cancellationToken);
    Task UploadLogoAsync(FileUpload file, CancellationToken cancellationToken);
    Task<FileDownload?> GetLogoAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Settings administration. General settings are editable by Admins; Leave, Files and
/// Security settings are "advanced" and editable only by SuperAdmins.
/// </summary>
public sealed class SettingsAdminService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    ISettingsService settings,
    IAuditService audit,
    IFileUploadValidator fileValidator,
    IFileStorage storage,
    TimeProvider clock) : ISettingsAdminService
{
    public async Task<IReadOnlyList<SettingDto>> GetAllAsync(CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var stored = await db.SystemSettings.AsNoTracking().ToDictionaryAsync(s => s.Key, StringComparer.OrdinalIgnoreCase, cancellationToken);

        return SettingCatalog.All
            .Where(d => d.Key != SettingKeys.CompanyLogoPath)
            .Select(d =>
            {
                stored.TryGetValue(d.Key, out var row);
                return new SettingDto(d.Key, row?.Value ?? d.DefaultValue, d.Category, d.DataType, d.Label, d.Description,
                    d.IsAdvanced, scope.IsSuperAdmin || !d.IsAdvanced, d.MinValue, d.MaxValue, row?.UpdatedAt);
            })
            .ToList();
    }

    public async Task<IReadOnlyList<SettingDto>> UpdateAsync(UpdateSettingsRequest request, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var errors = new Dictionary<string, string[]>();
        var changes = new List<(SettingDefinition Definition, string Value)>();

        foreach (var (key, rawValue) in request.Values)
        {
            var definition = SettingCatalog.Find(key);
            if (definition is null || definition.Key == SettingKeys.CompanyLogoPath)
            {
                errors[key] = [Text.Get("settings.unknown")];
                continue;
            }

            if (definition.IsAdvanced && !scope.IsSuperAdmin)
            {
                throw new ForbiddenException(Text.Get("settings.superAdminOnly", Text.Get("settings.category." + definition.Category)));
            }

            var (normalized, error) = Normalize(definition, rawValue?.Trim() ?? string.Empty);
            if (error is not null)
            {
                errors[definition.Key] = [error];
                continue;
            }

            changes.Add((definition, normalized));
        }

        if (errors.Count > 0)
        {
            throw new RequestValidationException(errors);
        }

        var keys = changes.Select(c => c.Definition.Key).ToList();
        var rows = await db.SystemSettings.Where(s => keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key, StringComparer.OrdinalIgnoreCase, cancellationToken);
        var now = clock.GetUtcNow().UtcDateTime;

        foreach (var (definition, value) in changes)
        {
            if (!rows.TryGetValue(definition.Key, out var row))
            {
                row = new SystemSetting { Key = definition.Key, Category = definition.Category, DataType = definition.DataType, IsAdvanced = definition.IsAdvanced, Value = definition.DefaultValue };
                db.SystemSettings.Add(row);
            }

            if (row.Value == value)
            {
                continue;
            }

            audit.Record("Setting.Updated", nameof(SystemSetting), definition.Key, new { Value = row.Value }, new { Value = value });
            row.Value = value;
            row.UpdatedAt = now;
            row.UpdatedBy = scope.UserId;
        }

        await db.SaveChangesAsync(cancellationToken);
        settings.Invalidate();
        return await GetAllAsync(cancellationToken);
    }

    public async Task<PublicSettingsDto> GetPublicAsync(CancellationToken cancellationToken)
    {
        var all = await settings.GetAllAsync(cancellationToken);
        string Get(string key) => all.TryGetValue(key, out var v) ? v : string.Empty;

        return new PublicSettingsDto(
            Get(SettingKeys.CompanyName),
            !string.IsNullOrEmpty(Get(SettingKeys.CompanyLogoPath)),
            NullIfEmpty(Get(SettingKeys.CompanyEmail)),
            NullIfEmpty(Get(SettingKeys.CompanyPhone)),
            NullIfEmpty(Get(SettingKeys.CompanyAddress)),
            Get(SettingKeys.Timezone),
            Get(SettingKeys.DefaultCurrency),
            int.TryParse(Get(SettingKeys.MaxUploadSizeMb), out var mb) ? mb : 10,
            Get(SettingKeys.AllowedExtensions).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    public async Task UploadLogoAsync(FileUpload file, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var validated = await fileValidator.ValidateAsync(file, UploadKind.Image, cancellationToken);
        await using var stream = file.OpenReadStream();
        var path = await storage.SaveAsync(stream, "branding", validated.Extension, cancellationToken);

        var row = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == SettingKeys.CompanyLogoPath, cancellationToken);
        if (row is null)
        {
            row = new SystemSetting { Key = SettingKeys.CompanyLogoPath, Category = "General", DataType = SettingDataType.String };
            db.SystemSettings.Add(row);
        }

        var previous = row.Value;
        row.Value = path;
        row.UpdatedAt = clock.GetUtcNow().UtcDateTime;
        row.UpdatedBy = scope.UserId;
        audit.Record("Setting.LogoUpdated", nameof(SystemSetting), SettingKeys.CompanyLogoPath);
        await db.SaveChangesAsync(cancellationToken);
        settings.Invalidate();

        if (!string.IsNullOrEmpty(previous))
        {
            await storage.DeleteAsync(previous, cancellationToken);
        }
    }

    public async Task<FileDownload?> GetLogoAsync(CancellationToken cancellationToken)
    {
        var path = await settings.GetAsync(SettingKeys.CompanyLogoPath, cancellationToken);
        if (string.IsNullOrEmpty(path))
        {
            return null;
        }

        var stream = await storage.OpenReadAsync(path, cancellationToken);
        return stream is null ? null : new FileDownload(stream, FileRules.ContentTypeFor(Path.GetExtension(path)), "logo" + Path.GetExtension(path));
    }

    private static (string Value, string? Error) Normalize(SettingDefinition definition, string value)
    {
        switch (definition.DataType)
        {
            case SettingDataType.Integer:
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number))
                {
                    return (value, Text.Get("settings.wholeNumber"));
                }

                if (number < definition.MinValue || number > definition.MaxValue)
                {
                    return (value, Text.Get("settings.between", definition.MinValue, definition.MaxValue));
                }

                return (number.ToString(CultureInfo.InvariantCulture), null);

            case SettingDataType.Boolean:
                return bool.TryParse(value, out var flag) ? (flag ? "true" : "false", null) : (value, Text.Get("settings.boolean"));
        }

        return definition.Key switch
        {
            SettingKeys.CompanyName when value.Length is 0 or > 150 => (value, Text.Get("settings.companyName")),
            SettingKeys.DefaultCurrency when value.Length != 3 || !value.All(char.IsLetter) => (value, Text.Get("settings.currency")),
            SettingKeys.DefaultCurrency => (value.ToUpperInvariant(), null),
            SettingKeys.CompanyEmail when value.Length > 0 && (!value.Contains('@') || value.Length > 256) => (value, Text.Get("settings.email")),
            SettingKeys.Timezone when !IsValidTimeZone(value) => (value, Text.Get("settings.timezone")),
            SettingKeys.AllowedExtensions => NormalizeExtensions(value),
            _ => (value, null)
        };
    }

    private static (string, string?) NormalizeExtensions(string value)
    {
        var extensions = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(e => (e.StartsWith('.') ? e : "." + e).ToLowerInvariant())
            .Distinct()
            .ToList();

        if (extensions.Count == 0)
        {
            return (value, Text.Get("settings.extensionsRequired"));
        }

        var blocked = extensions.Where(FileRules.BlockedExtensions.Contains).ToList();
        if (blocked.Count > 0)
        {
            return (value, Text.Get("settings.extensionsBlocked", string.Join(", ", blocked)));
        }

        return extensions.Any(e => e.Length < 2 || !e[1..].All(char.IsLetterOrDigit))
            ? (value, Text.Get("settings.extensionsFormat"))
            : (string.Join(',', extensions), null);
    }

    private static bool IsValidTimeZone(string id)
    {
        try
        {
            TimeZoneInfo.FindSystemTimeZoneById(id);
            return true;
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return false;
        }
    }

    private static string? NullIfEmpty(string value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
