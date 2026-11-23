using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CorporateOS.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;

namespace CorporateOS.IntegrationTests;

public class AuthTests(ApiFactory factory) : ApiTestBase(factory)
{
    private const string CookieName = "corporateos_rt";

    [Fact]
    public async Task Login_with_valid_credentials_returns_token_and_httponly_refresh_cookie()
    {
        var response = await AnonymousClient().PostAsJsonAsync("/api/auth/login",
            new { email = DemoUsers.Employee, password = DemoUsers.Password });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var data = await ReadDataAsync<JsonElement>(response);
        data.GetProperty("accessToken").GetString().Should().NotBeNullOrWhiteSpace();
        data.GetProperty("user").GetProperty("primaryRole").GetString().Should().Be("Employee");

        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith(CookieName + "="));
        cookie.Should().ContainEquivalentOf("httponly").And.ContainEquivalentOf("samesite=strict").And.Contain("path=/api/auth");
        (await response.Content.ReadAsStringAsync()).Should().NotContain("refreshToken", "the refresh token must never be in the body");
    }

    [Fact]
    public async Task Login_with_wrong_password_returns_401_without_revealing_which_field_was_wrong()
    {
        var wrongPassword = await AnonymousClient().PostAsJsonAsync("/api/auth/login",
            new { email = DemoUsers.Manager, password = "Wrong-Passw0rd!" });
        var unknownUser = await AnonymousClient().PostAsJsonAsync("/api/auth/login",
            new { email = "nobody@corporateos.local", password = "Wrong-Passw0rd!" });

        wrongPassword.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        unknownUser.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await ReadEnvelopeAsync(wrongPassword)).Message.Should().Be((await ReadEnvelopeAsync(unknownUser)).Message);
    }

    [Fact]
    public async Task Login_with_malformed_email_returns_400_with_field_error()
    {
        var response = await AnonymousClient().PostAsJsonAsync("/api/auth/login", new { email = "not-an-email", password = "x" });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadEnvelopeAsync(response)).Errors.Should().ContainKey("email");
    }

    [Theory]
    [InlineData("/api/auth/me")]
    [InlineData("/api/employees")]
    [InlineData("/api/dashboard/employee")]
    [InlineData("/api/admin/settings")]
    public async Task Protected_endpoints_return_401_without_token(string url)
    {
        var response = await AnonymousClient().GetAsync(url);
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Forged_token_is_rejected()
    {
        var client = AnonymousClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid");

        (await client.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Refresh_rotates_the_cookie_and_issues_a_working_access_token()
    {
        var client = AnonymousClient(); // keeps cookies between calls
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email = DemoUsers.Employee, password = DemoUsers.Password });
        var original = RefreshCookie(login);

        var refresh = await client.PostAsync("/api/auth/refresh", null);

        refresh.StatusCode.Should().Be(HttpStatusCode.OK);
        RefreshCookie(refresh).Should().NotBe(original, "the refresh token is rotated on every use");

        var token = (await ReadDataAsync<JsonElement>(refresh)).GetProperty("accessToken").GetString();
        var me = AnonymousClient();
        me.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var meResponse = await me.GetAsync("/api/auth/me");
        meResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadDataAsync<JsonElement>(meResponse)).GetProperty("email").GetString().Should().Be(DemoUsers.Employee);
    }

    [Fact]
    public async Task Refresh_without_cookie_returns_401()
    {
        (await AnonymousClient().PostAsync("/api/auth/refresh", null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Reusing_a_rotated_token_within_the_grace_window_is_rejected_but_keeps_the_session()
    {
        var (original, rotated) = await LoginAndRotateAsync(DemoUsers.Admin);

        // A concurrent tab presenting the old token a moment later: benign race.
        (await RefreshWith(original)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var stillValid = await RefreshWith(rotated);
        stillValid.StatusCode.Should().Be(HttpStatusCode.OK, "a race inside the grace window must not end the session");
    }

    [Fact]
    public async Task Reusing_a_rotated_token_after_the_grace_window_revokes_every_session()
    {
        var (original, rotated) = await LoginAndRotateAsync(DemoUsers.Manager);
        var otherDevice = RefreshCookie(await AnonymousClient().PostAsJsonAsync("/api/auth/login",
            new { email = DemoUsers.Manager, password = DemoUsers.Password }));

        Factory.Clock.Advance(TimeSpan.FromSeconds(11)); // past AuthService.RotationGraceSeconds (10 s)

        var replay = await RefreshWith(original);
        replay.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await ReadEnvelopeAsync(replay)).Message.Should().Contain("no longer valid");

        (await RefreshWith(rotated)).StatusCode.Should().Be(HttpStatusCode.Unauthorized, "theft is assumed: the current token is revoked too");
        (await RefreshWith(otherDevice)).StatusCode.Should().Be(HttpStatusCode.Unauthorized, "all sessions of the user are revoked");

        // The user can still sign in again.
        await SignInAsync(DemoUsers.Manager);
    }

    [Fact]
    public async Task Logout_revokes_the_refresh_token()
    {
        var client = AnonymousClient();
        var token = RefreshCookie(await client.PostAsJsonAsync("/api/auth/login", new { email = DemoUsers.SuperAdmin, password = DemoUsers.Password }));

        (await client.PostAsync("/api/auth/logout", null)).StatusCode.Should().Be(HttpStatusCode.OK);

        (await RefreshWith(token)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private async Task<(string Original, string Rotated)> LoginAndRotateAsync(string email)
    {
        var login = await AnonymousClient().PostAsJsonAsync("/api/auth/login", new { email, password = DemoUsers.Password });
        var original = RefreshCookie(login);
        var refresh = await RefreshWith(original);
        refresh.StatusCode.Should().Be(HttpStatusCode.OK);
        return (original, RefreshCookie(refresh));
    }

    /// <summary>Calls /refresh presenting exactly the given token (no cookie jar).</summary>
    private Task<HttpResponseMessage> RefreshWith(string token)
    {
        var client = Factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
        request.Headers.Add("Cookie", $"{CookieName}={token}");
        return client.SendAsync(request);
    }

    private static string RefreshCookie(HttpResponseMessage response)
    {
        var header = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith(CookieName + "="));
        return header[(CookieName.Length + 1)..header.IndexOf(';')];
    }
}
