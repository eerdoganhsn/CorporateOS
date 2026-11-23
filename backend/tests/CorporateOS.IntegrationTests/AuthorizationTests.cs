using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CorporateOS.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace CorporateOS.IntegrationTests;

/// <summary>Role gates enforced by the API regardless of what the UI shows.</summary>
public class AuthorizationTests(ApiFactory factory) : ApiTestBase(factory)
{
    [Theory]
    [InlineData("/api/admin/settings")]
    [InlineData("/api/admin/users")]
    [InlineData("/api/admin/audit-logs")]
    [InlineData("/api/employees")]
    [InlineData("/api/reports/employees")]
    [InlineData("/api/dashboard/admin")]
    public async Task Employee_is_forbidden_from_admin_and_manager_endpoints(string url)
    {
        var client = await SignInAsync(DemoUsers.Employee);
        (await client.GetAsync(url)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Employee_cannot_change_settings()
    {
        var client = await SignInAsync(DemoUsers.Employee);
        var response = await client.PutAsJsonAsync("/api/admin/settings", new { values = new Dictionary<string, string> { ["General.CompanyName"] = "Hacked" } });
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Theory]
    [InlineData("/api/admin/users")]
    [InlineData("/api/admin/settings")]
    [InlineData("/api/admin/roles")]
    public async Task Manager_is_forbidden_from_admin_endpoints(string url)
    {
        var client = await SignInAsync(DemoUsers.Manager);
        (await client.GetAsync(url)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Manager_cannot_change_superadmin_only_security_settings()
    {
        var client = await SignInAsync(DemoUsers.Manager);
        var response = await client.PutAsJsonAsync("/api/admin/settings",
            new { values = new Dictionary<string, string> { ["Security.MaxFailedLoginAttempts"] = "99" } });
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Admin_cannot_change_superadmin_only_security_settings_but_superadmin_can()
    {
        var body = new { values = new Dictionary<string, string> { ["Security.LockoutMinutes"] = "20" } };

        var admin = await SignInAsync(DemoUsers.Admin);
        (await admin.PutAsJsonAsync("/api/admin/settings", body)).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var superAdmin = await SignInAsync(DemoUsers.SuperAdmin);
        (await superAdmin.PutAsJsonAsync("/api/admin/settings", body)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Admin_cannot_grant_the_superadmin_role()
    {
        var admin = await SignInAsync(DemoUsers.Admin);
        var users = await ReadDataAsync<JsonElement>(await admin.GetAsync($"/api/admin/users?search={Uri.EscapeDataString(DemoUsers.Employee)}"));
        var userId = users.GetProperty("items")[0].GetProperty("id").GetString();

        var response = await admin.PutAsJsonAsync($"/api/admin/users/{userId}/roles", new { roles = new[] { "SuperAdmin" } });

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Theory]
    [InlineData(DemoUsers.Admin)]
    [InlineData(DemoUsers.SuperAdmin)]
    [InlineData(DemoUsers.Manager)]
    public async Task Managers_and_admins_can_list_employees(string email)
    {
        var client = await SignInAsync(email);
        var response = await client.GetAsync("/api/employees");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadDataAsync<JsonElement>(response)).GetProperty("totalItems").GetInt32().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task Admin_can_read_settings()
    {
        var client = await SignInAsync(DemoUsers.Admin);
        (await client.GetAsync("/api/admin/settings")).StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
