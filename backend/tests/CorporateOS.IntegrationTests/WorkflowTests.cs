using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CorporateOS.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace CorporateOS.IntegrationTests;

public class EmployeeTests(ApiFactory factory) : ApiTestBase(factory)
{
    private async Task<object> NewEmployeeAsync(HttpClient admin, string email, string number)
    {
        var department = (await ReadDataAsync<JsonElement>(await admin.GetAsync("/api/lookups/departments")))[0].GetProperty("id").GetInt32();
        var position = (await ReadDataAsync<JsonElement>(await admin.GetAsync("/api/lookups/positions")))[0].GetProperty("id").GetInt32();
        return new
        {
            employeeNumber = number,
            firstName = "Grace",
            lastName = "Hopper",
            email,
            departmentId = department,
            positionId = position,
            hireDate = DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd"),
            employmentType = "FullTime",
            status = "Active"
        };
    }

    [Fact]
    public async Task Admin_creates_employee()
    {
        var admin = await SignInAsync(DemoUsers.Admin);
        var email = $"{Unique("grace.")}@corporateos.local";

        var response = await admin.PostAsJsonAsync("/api/employees", await NewEmployeeAsync(admin, email, Unique("T-")), Json);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await ReadDataAsync<JsonElement>(response);
        created.GetProperty("email").GetString().Should().Be(email);
        response.Headers.Location.Should().NotBeNull();

        (await admin.GetAsync($"/api/employees/{created.GetProperty("id").GetInt32()}")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Duplicate_email_or_employee_number_returns_409()
    {
        var admin = await SignInAsync(DemoUsers.Admin);
        var email = $"{Unique("dup.")}@corporateos.local";
        var number = Unique("D-");
        (await admin.PostAsJsonAsync("/api/employees", await NewEmployeeAsync(admin, email, number), Json)).StatusCode.Should().Be(HttpStatusCode.Created);

        var sameEmail = await admin.PostAsJsonAsync("/api/employees", await NewEmployeeAsync(admin, email, Unique("D-")), Json);
        var sameNumber = await admin.PostAsJsonAsync("/api/employees", await NewEmployeeAsync(admin, $"{Unique("other.")}@corporateos.local", number), Json);

        sameEmail.StatusCode.Should().Be(HttpStatusCode.Conflict);
        sameNumber.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Invalid_email_returns_400_with_field_error()
    {
        var admin = await SignInAsync(DemoUsers.Admin);

        var response = await admin.PostAsJsonAsync("/api/employees", await NewEmployeeAsync(admin, "not-an-email", Unique("X-")), Json);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadEnvelopeAsync(response)).Errors.Should().ContainKey("email");
    }

    [Fact]
    public async Task Manager_cannot_create_employees()
    {
        var manager = await SignInAsync(DemoUsers.Manager);
        var body = await NewEmployeeAsync(await SignInAsync(DemoUsers.Admin), $"{Unique("m.")}@corporateos.local", Unique("M-"));

        (await manager.PostAsJsonAsync("/api/employees", body, Json)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}

public class ProjectTests(ApiFactory factory) : ApiTestBase(factory)
{
    private static object Project(string code, DateOnly start, DateOnly? end) => new
    {
        name = "Integration project " + code,
        projectCode = code,
        description = "Created by an integration test",
        startDate = start.ToString("yyyy-MM-dd"),
        endDate = end?.ToString("yyyy-MM-dd"),
        status = "Planning",
        priority = "Medium",
        budget = 5000,
        progressPercentage = 0
    };

    [Fact]
    public async Task Admin_creates_project()
    {
        var admin = await SignInAsync(DemoUsers.Admin);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var code = Unique("IT-").ToUpperInvariant();

        var response = await admin.PostAsJsonAsync("/api/projects", Project(code, today, today.AddMonths(3)), Json);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        (await ReadDataAsync<JsonElement>(response)).GetProperty("projectCode").GetString().Should().Be(code);
    }

    [Fact]
    public async Task End_date_before_start_date_returns_400()
    {
        var admin = await SignInAsync(DemoUsers.Admin);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var response = await admin.PostAsJsonAsync("/api/projects", Project(Unique("BAD-"), today, today.AddDays(-1)), Json);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadEnvelopeAsync(response)).Errors.Should().ContainKey("endDate");
    }

    [Fact]
    public async Task Employee_cannot_create_projects()
    {
        var employee = await SignInAsync(DemoUsers.Employee);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        (await employee.PostAsJsonAsync("/api/projects", Project(Unique("E-"), today, null), Json)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}

public class LeaveTests(ApiFactory factory) : ApiTestBase(factory)
{
    private static object Leave(DateOnly start, DateOnly end, string reason = "Integration test") => new
    {
        leaveType = "SickLeave",
        startDate = start.ToString("yyyy-MM-dd"),
        endDate = end.ToString("yyyy-MM-dd"),
        reason
    };

    private async Task<int> SubmitAsync(HttpClient employee, DateOnly day)
    {
        var response = await employee.PostAsJsonAsync("/api/leave-requests", Leave(day, day), Json);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await ReadDataAsync<JsonElement>(response);
        created.GetProperty("status").GetString().Should().Be("Pending");
        created.GetProperty("totalDays").GetInt32().Should().Be(1);
        return created.GetProperty("id").GetInt32();
    }

    [Fact]
    public async Task Employee_submits_and_manager_approves()
    {
        var employee = await SignInAsync(DemoUsers.Employee);
        var id = await SubmitAsync(employee, FutureWeekday(400));

        var manager = await SignInAsync(DemoUsers.Manager);
        var approve = await PostAsync(manager, $"/api/leave-requests/{id}/approve", new { note = "Get well soon" });

        approve.StatusCode.Should().Be(HttpStatusCode.OK);
        var approved = await ReadDataAsync<JsonElement>(approve);
        approved.GetProperty("status").GetString().Should().Be("Approved");

        // Approving twice is a business-rule violation.
        (await PostAsync(manager, $"/api/leave-requests/{id}/approve", new { note = (string?)null })).StatusCode
            .Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task Manager_rejects_with_reason()
    {
        var employee = await SignInAsync(DemoUsers.Employee);
        var id = await SubmitAsync(employee, FutureWeekday(420));
        var manager = await SignInAsync(DemoUsers.Manager);

        (await PostAsync(manager, $"/api/leave-requests/{id}/reject", new { reason = "" })).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var reject = await PostAsync(manager, $"/api/leave-requests/{id}/reject", new { reason = "Release week" });
        reject.StatusCode.Should().Be(HttpStatusCode.OK);
        var rejected = await ReadDataAsync<JsonElement>(reject);
        rejected.GetProperty("status").GetString().Should().Be("Rejected");
        rejected.GetProperty("rejectionReason").GetString().Should().Be("Release week");
    }

    [Fact]
    public async Task End_before_start_returns_400()
    {
        var employee = await SignInAsync(DemoUsers.Employee);
        var start = FutureWeekday(440);

        var response = await employee.PostAsJsonAsync("/api/leave-requests", Leave(start, start.AddDays(-1)), Json);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadEnvelopeAsync(response)).Errors.Should().ContainKey("endDate");
    }

    [Fact]
    public async Task Overlapping_request_returns_409()
    {
        var employee = await SignInAsync(DemoUsers.Employee);
        var day = FutureWeekday(460);
        await SubmitAsync(employee, day);

        (await employee.PostAsJsonAsync("/api/leave-requests", Leave(day, day), Json)).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Employee_cannot_approve_leave()
    {
        var employee = await SignInAsync(DemoUsers.Employee);
        var id = await SubmitAsync(employee, FutureWeekday(480));

        (await PostAsync(employee, $"/api/leave-requests/{id}/approve")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}

public class ExpenseTests(ApiFactory factory) : ApiTestBase(factory)
{
    private static object Expense(decimal amount, string description = "Integration test taxi") => new
    {
        category = "Travel",
        amount,
        currency = "USD",
        expenseDate = DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd"),
        description
    };

    private async Task<int> CreateAndSubmitAsync(HttpClient employee)
    {
        var create = await employee.PostAsJsonAsync("/api/expenses", Expense(42.50m), Json);
        create.StatusCode.Should().Be(HttpStatusCode.Created);
        var draft = await ReadDataAsync<JsonElement>(create);
        draft.GetProperty("status").GetString().Should().Be("Draft");
        var id = draft.GetProperty("id").GetInt32();

        var submit = await PostAsync(employee, $"/api/expenses/{id}/submit");
        submit.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadDataAsync<JsonElement>(submit)).GetProperty("status").GetString().Should().Be("Submitted");
        return id;
    }

    [Fact]
    public async Task Employee_creates_and_submits_then_manager_approves()
    {
        var employee = await SignInAsync(DemoUsers.Employee);
        var id = await CreateAndSubmitAsync(employee);

        var manager = await SignInAsync(DemoUsers.Manager);
        var approve = await PostAsync(manager, $"/api/expenses/{id}/approve", new { note = "OK" });

        approve.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadDataAsync<JsonElement>(approve)).GetProperty("status").GetString().Should().Be("Approved");

        // Approved expenses are locked for the owner.
        (await employee.PutAsJsonAsync($"/api/expenses/{id}", Expense(1m), Json)).StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task Manager_rejects_and_employee_can_resubmit()
    {
        var employee = await SignInAsync(DemoUsers.Employee);
        var id = await CreateAndSubmitAsync(employee);
        var manager = await SignInAsync(DemoUsers.Manager);

        (await PostAsync(manager, $"/api/expenses/{id}/reject", new { reason = "" })).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var reject = await PostAsync(manager, $"/api/expenses/{id}/reject", new { reason = "Receipt missing" });
        reject.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadDataAsync<JsonElement>(reject)).GetProperty("status").GetString().Should().Be("Rejected");

        var resubmit = await PostAsync(employee, $"/api/expenses/{id}/submit");
        resubmit.StatusCode.Should().Be(HttpStatusCode.OK);
        (await ReadDataAsync<JsonElement>(resubmit)).GetProperty("status").GetString().Should().Be("Submitted");
    }

    [Fact]
    public async Task Draft_cannot_be_approved()
    {
        var employee = await SignInAsync(DemoUsers.Employee);
        var id = (await ReadDataAsync<JsonElement>(await employee.PostAsJsonAsync("/api/expenses", Expense(10m), Json))).GetProperty("id").GetInt32();

        var manager = await SignInAsync(DemoUsers.Manager);
        var response = await PostAsync(manager, $"/api/expenses/{id}/approve", new { note = (string?)null });

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        (await ReadEnvelopeAsync(response)).Message.Should().Contain("submitted");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public async Task Non_positive_amount_returns_400(decimal amount)
    {
        var employee = await SignInAsync(DemoUsers.Employee);

        var response = await employee.PostAsJsonAsync("/api/expenses", Expense(amount), Json);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadEnvelopeAsync(response)).Errors.Should().ContainKey("amount");
    }

    [Fact]
    public async Task Employee_cannot_approve_expenses()
    {
        var employee = await SignInAsync(DemoUsers.Employee);
        var id = await CreateAndSubmitAsync(employee);

        (await PostAsync(employee, $"/api/expenses/{id}/approve")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
