using System.Globalization;
using CorporateOS.API.Configuration;
using CorporateOS.Application;
using CorporateOS.Infrastructure;
using FluentValidation;
using Serilog;

// The API speaks English regardless of the host machine's locale (validation messages, formatting).
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.GetCultureInfo("en-US");
ValidatorOptions.Global.LanguageManager.Culture = CultureInfo.GetCultureInfo("en-US");

Log.Logger = new LoggerConfiguration().WriteTo.Console().CreateLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);
    builder.Configuration.AddDotEnvFile(builder.Environment);

    builder.Services.AddSerilog((services, logger) => logger
        .ReadFrom.Configuration(builder.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext());

    builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 60 * 1024 * 1024);

    builder.Services
        .AddApplication()
        .AddInfrastructure(builder.Configuration, builder.Environment)
        .AddApi(builder.Configuration);

    var app = builder.Build();

    app.UseExceptionHandler();
    app.UseSecurityHeaders();
    app.UseSerilogRequestLogging();

    if (app.Configuration.GetValue("Swagger:Enabled", app.Environment.IsDevelopment()))
    {
        app.UseSwagger();
        app.UseSwaggerUI(options =>
        {
            options.SwaggerEndpoint("/swagger/v1/swagger.json", "CorporateOS API v1");
            options.DocumentTitle = "CorporateOS API";
            options.EnablePersistAuthorization();
        });
    }

    if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
    {
        app.UseHsts();
        app.UseHttpsRedirection();
    }

    app.UseAvatarFiles();
    app.UseCors(CorsSettings.PolicyName);
    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseAuthorization();

    app.MapControllers();
    app.MapGet("/health", () => Results.Ok(new { status = "Healthy" })).AllowAnonymous().ExcludeFromDescription();

    await app.InitializeDatabaseAsync();

    Log.Information("CorporateOS API started ({Environment})", app.Environment.EnvironmentName);
    await app.RunAsync();
}
catch (Exception ex) when (ex is not HostAbortedException)
{
    Log.Fatal(ex, "CorporateOS API terminated unexpectedly");
    throw;
}
finally
{
    await Log.CloseAndFlushAsync();
}

/// <summary>Exposed for WebApplicationFactory in integration tests.</summary>
public partial class Program;
