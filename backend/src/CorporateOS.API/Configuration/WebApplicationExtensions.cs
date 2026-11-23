using System.Globalization;
using CorporateOS.Domain.Localization;
using CorporateOS.Infrastructure.Persistence.Seed;
using CorporateOS.Infrastructure.Services;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.FileProviders;
using Microsoft.Net.Http.Headers;

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

    /// <summary>
    /// Sets the request's UI culture from <c>Accept-Language</c> (tr, en or de; anything else falls back to
    /// Turkish). Only CurrentUICulture changes — it selects the message catalog — while CurrentCulture stays
    /// invariant so parsing and formatting never depend on the caller. Registered first so that the exception
    /// handler, which runs outside the inner pipeline's execution context, also sees the request language.
    /// </summary>
    public static void UseRequestLanguage(this WebApplication app)
    {
        app.Use(async (context, next) =>
        {
            var language = PreferredLanguage(context.Request);
            CultureInfo.CurrentUICulture = Languages.Culture(language);
            // Written when the response starts: the exception handler clears headers set earlier.
            context.Response.OnStarting(() =>
            {
                context.Response.Headers.ContentLanguage = language;
                context.Response.Headers.Append(HeaderNames.Vary, HeaderNames.AcceptLanguage);
                return Task.CompletedTask;
            });
            await next();
        });
    }

    private static string PreferredLanguage(HttpRequest request)
    {
        var accepted = request.GetTypedHeaders().AcceptLanguage;
        var match = accepted
            .OrderByDescending(v => v.Quality ?? 1)
            .Select(v => v.Value.Value)
            .FirstOrDefault(Languages.IsSupportedTag);
        return Languages.Normalize(match);
    }

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
