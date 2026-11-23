using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Testcontainers.MsSql;

namespace CorporateOS.IntegrationTests.Infrastructure;

/// <summary>
/// Boots the real API (environment "Testing") against a throw-away SQL Server container.
/// Migrations and the demo seed run once at startup, so tests can sign in with the demo accounts.
/// One instance is shared by every test class through <see cref="ApiCollection"/>.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly MsSqlContainer _sql = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();

    private readonly string _storageRoot = Path.Combine(Path.GetTempPath(), "corporateos-tests", Guid.NewGuid().ToString("N"));

    /// <summary>Application clock. Tests may move it forward (e.g. past the refresh-token grace window).</summary>
    public ShiftableTimeProvider Clock { get; } = new();

    public async Task InitializeAsync()
    {
        await _sql.StartAsync();
        // Starting the host here runs migrations and the seed before the first test.
        _ = Server;
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _sql.DisposeAsync();
        try
        {
            Directory.Delete(_storageRoot, recursive: true);
        }
        catch (IOException)
        {
            // Best effort: temp files are harmless.
        }
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var connectionString = new SqlConnectionStringBuilder(_sql.GetConnectionString())
        {
            InitialCatalog = "CorporateOS_IntegrationTests",
            TrustServerCertificate = true
        }.ConnectionString;

        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:DefaultConnection", connectionString);
        builder.UseSetting("Jwt:Key", "integration-tests-only-signing-key-0123456789-abcdefghijklmnop");
        builder.UseSetting("AuthCookie:Secure", "false");
        builder.UseSetting("RateLimiting:AuthPermitLimit", "1000");
        builder.UseSetting("Database:ApplyMigrationsOnStartup", "true");
        builder.UseSetting("Database:SeedDemoData", "true");
        builder.UseSetting("ScheduledJobs:Enabled", "false");
        builder.UseSetting("Smtp:Host", "");
        builder.UseSetting("Storage:RootPath", _storageRoot);
        builder.UseSetting("Serilog:MinimumLevel:Default", "Warning");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
        });
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}

/// <summary>Real time plus an adjustable offset, so tokens stay valid while tests can jump ahead.</summary>
public sealed class ShiftableTimeProvider : TimeProvider
{
    private TimeSpan _offset;

    public override DateTimeOffset GetUtcNow() => TimeProvider.System.GetUtcNow() + _offset;

    public void Advance(TimeSpan by) => _offset += by;
}
