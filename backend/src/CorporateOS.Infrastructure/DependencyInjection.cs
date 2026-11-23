using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Domain.Entities;
using CorporateOS.Infrastructure.BackgroundJobs;
using CorporateOS.Infrastructure.Identity;
using CorporateOS.Infrastructure.Persistence;
using CorporateOS.Infrastructure.Persistence.Interceptors;
using CorporateOS.Infrastructure.Persistence.Seed;
using CorporateOS.Infrastructure.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace CorporateOS.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "ConnectionStrings:DefaultConnection is not configured. Set the ConnectionStrings__DefaultConnection " +
                "environment variable or add it to the .env file (see .env.example).");
        }

        services.AddSingleton(TimeProvider.System);
        services.AddMemoryCache();

        services.AddScoped<AuditableEntityInterceptor>();
        services.AddDbContext<ApplicationDbContext>((sp, options) =>
            options.UseSqlServer(connectionString, sql => sql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName))
                .AddInterceptors(sp.GetRequiredService<AuditableEntityInterceptor>())
                // Intended: rows owned by a soft-deleted employee/task (leave, expenses, comments...)
                // are hidden together with their owner, which is exactly what the filter does.
                .ConfigureWarnings(w => w.Ignore(CoreEventId.PossibleIncorrectRequiredNavigationWithQueryFilterInteractionWarning)));
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());

        services.AddDataProtection();
        services.AddIdentityCore<ApplicationUser>(options =>
            {
                // Password complexity comes from system settings via SettingsPasswordValidator.
                options.Password.RequiredLength = 8;
                options.Password.RequireDigit = false;
                options.Password.RequireUppercase = false;
                options.Password.RequireLowercase = false;
                options.Password.RequireNonAlphanumeric = false;
                options.Password.RequiredUniqueChars = 1;
                options.User.RequireUniqueEmail = true;
                // Lockout is applied by AuthService using settings-driven thresholds.
                options.Lockout.AllowedForNewUsers = false;
            })
            .AddRoles<ApplicationRole>()
            .AddEntityFrameworkStores<ApplicationDbContext>()
            .AddDefaultTokenProviders()
            .AddPasswordValidator<SettingsPasswordValidator>();
        services.Configure<DataProtectionTokenProviderOptions>(o => o.TokenLifespan = TimeSpan.FromHours(2));

        services.AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(JwtOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.Configure<StorageOptions>(configuration.GetSection(StorageOptions.SectionName));
        services.PostConfigure<StorageOptions>(o =>
        {
            if (!Path.IsPathRooted(o.RootPath))
            {
                o.RootPath = Path.Combine(environment.ContentRootPath, o.RootPath);
            }
        });
        services.Configure<SmtpOptions>(configuration.GetSection(SmtpOptions.SectionName));
        services.Configure<DatabaseOptions>(configuration.GetSection(DatabaseOptions.SectionName));

        services.AddScoped<ITokenService, TokenService>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<ISettingsService, SettingsService>();
        services.AddScoped<IExportService, ExportService>();
        services.AddSingleton<LocalFileStorage>();
        services.AddSingleton<IFileStorage>(sp => sp.GetRequiredService<LocalFileStorage>());
        services.AddTransient<IEmailService, SmtpEmailService>();

        services.AddScoped<DatabaseInitializer>();
        services.AddScoped<DemoDataSeeder>();

        services.Configure<ScheduledJobsOptions>(configuration.GetSection(ScheduledJobsOptions.SectionName));
        services.AddHostedService<ScheduledJobsService>();

        return services;
    }
}
