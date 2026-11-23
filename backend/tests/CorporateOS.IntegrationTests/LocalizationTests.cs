using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CorporateOS.Domain.Localization;
using CorporateOS.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace CorporateOS.IntegrationTests;

/// <summary>Responses follow the Accept-Language header (tr, en, de) and default to Turkish.</summary>
public class LocalizationTests(ApiFactory factory) : ApiTestBase(factory)
{
    [Theory]
    [InlineData("tr", Languages.Turkish)]
    [InlineData("de-DE,de;q=0.9,en;q=0.8", Languages.German)]
    [InlineData("en-US", Languages.English)]
    [InlineData("fr-FR", Languages.Turkish)]
    [InlineData(null, Languages.Turkish)]
    public async Task Service_errors_use_the_requested_language(string? acceptLanguage, string expected)
    {
        var client = WithLanguage(AnonymousClient(), acceptLanguage);

        var response = await client.PostAsJsonAsync("/api/auth/login",
            // Unknown account: same message as a wrong password, without locking out a shared demo user.
            new { email = "nobody-i18n@corporateos.local", password = "Wrong-Passw0rd!" });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        response.Content.Headers.ContentLanguage.Should().Contain(expected);
        (await ReadEnvelopeAsync(response)).Message.Should().Be(Text.For(expected, "auth.invalidCredentials"));
    }

    [Fact]
    public async Task Authentication_challenge_is_localized()
    {
        var response = await WithLanguage(AnonymousClient(), "de").GetAsync("/api/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await ReadEnvelopeAsync(response)).Message.Should().Be(Text.For(Languages.German, "error.unauthorized"));
    }

    [Fact]
    public async Task Forbidden_errors_are_localized()
    {
        var client = WithLanguage(await SignInAsync(DemoUsers.Employee), "tr");

        var response = await client.GetAsync("/api/employees");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        Text.Catalog(Languages.Turkish).Values.Should().Contain((await ReadEnvelopeAsync(response)).Message);
    }

    [Fact]
    public async Task Validation_messages_are_localized()
    {
        var english = await AnonymousClient().PostAsJsonAsync("/api/auth/login", new { email = "not-an-email", password = "x" });
        var turkish = await WithLanguage(AnonymousClient(), "tr")
            .PostAsJsonAsync("/api/auth/login", new { email = "not-an-email", password = "x" });

        var englishEnvelope = await ReadEnvelopeAsync(english);
        var turkishEnvelope = await ReadEnvelopeAsync(turkish);
        turkishEnvelope.Message.Should().Be(Text.For(Languages.Turkish, "error.validationFailed"));
        turkishEnvelope.Errors!["email"].Should().NotBeEquivalentTo(englishEnvelope.Errors!["email"]);
    }

    [Fact]
    public async Task Preferred_language_is_saved_in_the_profile_and_returned_on_sign_in()
    {
        var client = await SignInAsync(DemoUsers.SuperAdmin);
        try
        {
            var unsupported = await client.PutAsJsonAsync("/api/profile/language", new { language = "fr" });
            unsupported.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await ReadEnvelopeAsync(unsupported)).Errors!["language"]
                .Should().ContainSingle().Which.Should().Be(Text.For(Languages.English, "auth.unsupportedLanguage"));

            var saved = await client.PutAsJsonAsync("/api/profile/language", new { language = "de" });
            (await ReadDataAsync<JsonElement>(saved)).GetProperty("language").GetString().Should().Be("de");

            var again = await SignInAsync(DemoUsers.SuperAdmin);
            var me = await ReadDataAsync<JsonElement>(await again.GetAsync("/api/auth/me"));
            me.GetProperty("language").GetString().Should().Be("de");
        }
        finally
        {
            await client.PutAsJsonAsync("/api/profile/language", new { language = "tr" });
        }
    }

    private static HttpClient WithLanguage(HttpClient client, string? acceptLanguage)
    {
        client.DefaultRequestHeaders.AcceptLanguage.Clear();
        if (acceptLanguage is not null)
        {
            client.DefaultRequestHeaders.AcceptLanguage.ParseAdd(acceptLanguage);
        }

        return client;
    }
}
