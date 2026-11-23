using CorporateOS.Application.Features.Announcements;
using CorporateOS.Application.Features.Tasks;
using CorporateOS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CorporateOS.Infrastructure.BackgroundJobs;

public sealed class ScheduledJobsOptions
{
    public const string SectionName = "ScheduledJobs";

    public bool Enabled { get; set; } = true;
    public int IntervalMinutes { get; set; } = 15;

    /// <summary>Expired or revoked refresh tokens older than this are deleted.</summary>
    public int RefreshTokenRetentionDays { get; set; } = 30;
}

/// <summary>
/// Periodic maintenance: task due-soon reminders, scheduled announcement notifications
/// and refresh-token cleanup. Each run uses its own DI scope.
/// </summary>
public sealed class ScheduledJobsService(
    IServiceScopeFactory scopeFactory,
    IOptions<ScheduledJobsOptions> options,
    TimeProvider clock,
    ILogger<ScheduledJobsService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled)
        {
            return;
        }

        // Let the application finish starting (and migrating) before the first run.
        await Task.Delay(TimeSpan.FromSeconds(20), clock, stoppingToken);

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(Math.Max(1, options.Value.IntervalMinutes)), clock);
        do
        {
            await RunOnceAsync(stoppingToken);
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var services = scope.ServiceProvider;

            var reminders = await services.GetRequiredService<ITaskService>().SendDueSoonRemindersAsync(cancellationToken);
            var announcements = await services.GetRequiredService<IAnnouncementService>().PublishPendingNotificationsAsync(cancellationToken);

            var cutoff = clock.GetUtcNow().UtcDateTime.AddDays(-options.Value.RefreshTokenRetentionDays);
            var purged = await services.GetRequiredService<ApplicationDbContext>().RefreshTokens
                .Where(t => t.ExpiresAt < cutoff || (t.RevokedAt != null && t.RevokedAt < cutoff))
                .ExecuteDeleteAsync(cancellationToken);

            if (reminders + announcements + purged > 0)
            {
                logger.LogInformation(
                    "Scheduled jobs: {Reminders} task reminders, {Announcements} announcements published, {Purged} refresh tokens purged.",
                    reminders, announcements, purged);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Shutting down.
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Scheduled jobs run failed.");
        }
    }
}
