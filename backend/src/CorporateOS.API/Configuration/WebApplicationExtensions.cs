using CorporateOS.Infrastructure.Persistence.Seed;
using CorporateOS.Infrastructure.Services;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.FileProviders;

namespace CorporateOS.API.Configuration;

public static class WebApplicationExtensions
{
    /// <summary>
    /// Serves only the avatars folder publicly. Documents and receipts live in sibling
    /// folders and are streamed exclusively through authorized API endpoints.
    /// </summary>
    public static void UseAvatarFiles(this WebApplication app)
    {
        var storage = app.Services.GetRequiredService<LocalFileStorage>();
        var avatars = Path.Combine(storage.RootPath, "avatars");
        Directory.CreateDirectory(avatars);

        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(avatars),
            RequestPath = "/media/avatars",
            OnPrepareResponse = ctx =>
            {
                ctx.Context.Response.Headers.CacheControl = "private, max-age=86400";
                ctx.Context.Response.Headers.XContentTypeOptions = "nosniff";
            }
        });
    }

    /// <summary>Runs database initialization, retrying while SQL Server is still starting.</summary>
    public static async Task InitializeDatabaseAsync(this WebApplication app)
    {
        const int maxAttempts = 10;
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await using var scope = app.Services.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync();
                return;
            }
            catch (SqlException ex) when (attempt < maxAttempts && IsConnectionFailure(ex))
            {
                app.Logger.LogWarning("Database not reachable (attempt {Attempt}/{Max}): {Message}", attempt, maxAttempts, ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(3));
            }
        }
    }

    /// <summary>Errors raised while SQL Server is still starting or unreachable; anything else fails fast.</summary>
    private static bool IsConnectionFailure(SqlException ex) =>
        ex.Number is -2 or 2 or 53 or 233 or 4060 or 10053 or 10054 or 10060 or 10061 or 18456 or 40613;

    public static void UseSecurityHeaders(this WebApplication app)
    {
        app.Use(async (context, next) =>
        {
            var headers = context.Response.Headers;
            headers.XContentTypeOptions = "nosniff";
            headers.XFrameOptions = "DENY";
            headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
            await next();
        });
    }
}
