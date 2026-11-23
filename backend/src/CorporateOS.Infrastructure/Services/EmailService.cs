using System.Net;
using System.Net.Mail;
using CorporateOS.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CorporateOS.Infrastructure.Services;

public sealed class SmtpOptions
{
    public const string SectionName = "Smtp";

    /// <summary>Leave empty to disable outgoing mail (messages are then dropped with a warning).</summary>
    public string? Host { get; set; }
    public int Port { get; set; } = 1025;
    public bool EnableSsl { get; set; }
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string FromAddress { get; set; } = "no-reply@corporateos.local";
    public string FromName { get; set; } = "CorporateOS";
}

/// <summary>
/// Sends mail over SMTP. In development the docker-compose Mailpit container catches
/// every message (web UI on http://localhost:8025), so no real mail leaves the machine.
/// </summary>
public sealed class SmtpEmailService(IOptions<SmtpOptions> options, ILogger<SmtpEmailService> logger) : IEmailService
{
    private readonly SmtpOptions _options = options.Value;

    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.Host))
        {
            logger.LogWarning("SMTP is not configured; email '{Subject}' was not sent.", subject);
            return;
        }

        using var message = new MailMessage
        {
            From = new MailAddress(_options.FromAddress, _options.FromName),
            Subject = subject,
            Body = htmlBody,
            IsBodyHtml = true
        };
        message.To.Add(to);

        using var client = new SmtpClient(_options.Host, _options.Port) { EnableSsl = _options.EnableSsl };
        if (!string.IsNullOrEmpty(_options.Username))
        {
            client.Credentials = new NetworkCredential(_options.Username, _options.Password);
        }

        try
        {
            await client.SendMailAsync(message, cancellationToken);
            logger.LogInformation("Email '{Subject}' sent.", subject);
        }
        catch (SmtpException ex)
        {
            // Mail delivery problems must not fail the business operation that triggered them.
            logger.LogError(ex, "Failed to send email '{Subject}'.", subject);
        }
    }
}
