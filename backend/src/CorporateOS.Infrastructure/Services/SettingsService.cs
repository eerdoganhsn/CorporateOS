using System.Globalization;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Domain.Constants;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CorporateOS.Infrastructure.Services;

/// <summary>
/// Reads system settings with a short in-memory cache. Missing rows fall back to catalog
/// defaults, so the platform keeps working before settings are seeded.
/// </summary>
public sealed class SettingsService(IApplicationDbContext db, IMemoryCache cache) : ISettingsService
{
    private const string CacheKey = "system-settings";

    public async Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        if (cache.TryGetValue(CacheKey, out IReadOnlyDictionary<string, string>? cached) && cached is not null)
        {
            return cached;
        }

        var stored = await db.SystemSettings.AsNoTracking()
            .ToDictionaryAsync(s => s.Key, s => s.Value, StringComparer.OrdinalIgnoreCase, cancellationToken);

        var merged = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var definition in SettingCatalog.All)
        {
            merged[definition.Key] = stored.TryGetValue(definition.Key, out var value) ? value : definition.DefaultValue;
        }

        cache.Set(CacheKey, (IReadOnlyDictionary<string, string>)merged, TimeSpan.FromMinutes(5));
        return merged;
    }

    public async Task<string> GetAsync(string key, CancellationToken cancellationToken = default)
    {
        var all = await GetAllAsync(cancellationToken);
        return all.TryGetValue(key, out var value)
            ? value
            : throw new KeyNotFoundException($"Unknown setting '{key}'.");
    }

    public async Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default)
    {
        var raw = await GetAsync(key, cancellationToken);
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? value
            : int.Parse(SettingCatalog.Find(key)!.DefaultValue, CultureInfo.InvariantCulture);
    }

    public async Task<bool> GetBoolAsync(string key, CancellationToken cancellationToken = default)
    {
        var raw = await GetAsync(key, cancellationToken);
        return bool.TryParse(raw, out var value) && value;
    }

    public void Invalidate() => cache.Remove(CacheKey);
}
