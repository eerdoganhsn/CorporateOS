using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FluentAssertions;

namespace CorporateOS.IntegrationTests.Infrastructure;

public static class DemoUsers
{
    public const string Password = "CorporateOS123!";
    public const string SuperAdmin = "superadmin@corporateos.local";
    public const string Admin = "admin@corporateos.local";
    public const string Manager = "manager@corporateos.local";   // Sophia Turner, Software Development
    public const string Employee = "employee@corporateos.local"; // Daniel Kim, reports to Sophia
}

[Collection(ApiCollection.Name)]
public abstract class ApiTestBase(ApiFactory factory)
{
    protected static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    protected ApiFactory Factory { get; } = factory;

    protected HttpClient AnonymousClient() => Factory.CreateClient();

    /// <summary>Signs in through the API and returns a client carrying the bearer token (and the refresh cookie).</summary>
    protected async Task<HttpClient> SignInAsync(string email)
    {
        var client = Factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = DemoUsers.Password });
        response.StatusCode.Should().Be(HttpStatusCode.OK, $"demo user {email} should be able to sign in");

        var auth = await ReadDataAsync<JsonElement>(response);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("accessToken").GetString());
        return client;
    }

    protected static async Task<T> ReadDataAsync<T>(HttpResponseMessage response)
    {
        var envelope = await response.Content.ReadFromJsonAsync<Envelope<T>>(Json);
        envelope.Should().NotBeNull();
        envelope!.Success.Should().BeTrue($"the response was {(int)response.StatusCode}: {envelope.Message}");
        return envelope.Data!;
    }

    protected static async Task<Envelope<JsonElement>> ReadEnvelopeAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<Envelope<JsonElement>>(Json))!;

    protected static Task<HttpResponseMessage> PostAsync(HttpClient client, string url, object? body = null) =>
        client.PostAsJsonAsync(url, body ?? new { }, Json);

    /// <summary>A weekday far enough ahead that it never collides with seeded leave; distinct per call site.</summary>
    protected static DateOnly FutureWeekday(int daysAhead)
    {
        var date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(daysAhead);
        while (date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
        {
            date = date.AddDays(1);
        }

        return date;
    }

    protected static string Unique(string prefix) => $"{prefix}{Guid.NewGuid().ToString("N")[..8]}";

    public sealed record Envelope<T>(bool Success, T? Data, string? Message, Dictionary<string, string[]>? Errors);
}
