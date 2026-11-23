using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CorporateOS.Infrastructure.Persistence.Seed;

public sealed class DatabaseOptions
{
    public const string SectionName = "Database";

    /// <summary>Apply pending EF Core migrations at startup (convenient for development and containers).</summary>
    public bool ApplyMigrationsOnStartup { get; set; }

    /// <summary>Insert demo users and sample records when the database has no departments yet.</summary>
    public bool SeedDemoData { get; set; }
}

/// <summary>
/// Prepares the database at startup: optional migrations, reference data that must
/// always exist (roles, settings), and optional demo data.
/// </summary>
public sealed class DatabaseInitializer(
    ApplicationDbContext db,
    RoleManager<ApplicationRole> roleManager,
    DemoDataSeeder demoSeeder,
    IOptions<DatabaseOptions> options,
    ILogger<DatabaseInitializer> logger)
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (options.Value.ApplyMigrationsOnStartup)
        {
            logger.LogInformation("Applying database migrations...");
            await db.Database.MigrateAsync(cancellationToken);
        }

        await SeedRolesAsync();
        await SeedSettingsAsync(cancellationToken);

        if (options.Value.SeedDemoData)
        {
            await demoSeeder.SeedAsync(cancellationToken);
        }
    }

    private async Task SeedRolesAsync()
    {
        foreach (var role in Roles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new ApplicationRole(role, Roles.Descriptions[role]));
                logger.LogInformation("Created role {Role}.", role);
            }
        }
    }

    private async Task SeedSettingsAsync(CancellationToken cancellationToken)
    {
        var existing = await db.SystemSettings.Select(s => s.Key).ToListAsync(cancellationToken);
        var missing = SettingCatalog.All.Where(d => !existing.Contains(d.Key, StringComparer.OrdinalIgnoreCase)).ToList();

        foreach (var definition in missing)
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key = definition.Key,
                Value = definition.DefaultValue,
                Category = definition.Category,
                DataType = definition.DataType,
                IsAdvanced = definition.IsAdvanced
            });
        }

        if (missing.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Seeded {Count} system settings.", missing.Count);
        }
    }
}
