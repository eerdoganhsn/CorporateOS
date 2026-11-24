using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Features.Tasks;
using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using CorporateOS.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;

namespace CorporateOS.UnitTests.Tasks;

/// <summary>
/// Authorization rules of <see cref="TaskService"/> against an in-memory database.
///
/// Org chart used by every test:
///   Engineering (dept 1): Alice (1, employee), Bob (2, employee), Mia (3, manager), Paul (5, project manager)
///   Finance     (dept 2): Olga (4, employee, outside the project), Ivan (6, inactive)
///   Project 1 "Portal" belongs to Engineering, managed by Paul. Task 100 → Alice, task 200 → Bob.
/// </summary>
public sealed class TaskServiceAuthorizationTests : IDisposable
{
    private const int Alice = 1, Bob = 2, Mia = 3, Olga = 4, Paul = 5, Ivan = 6;
    private const int Engineering = 1, Finance = 2;
    private const int PortalProject = 1, AliceTask = 100, BobTask = 200;

    private readonly ApplicationDbContext _db;
    private readonly FakeCurrentUser _currentUser = new();
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 11, 23, 9, 0, 0, TimeSpan.Zero));

    public TaskServiceAuthorizationTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"tasks-{Guid.NewGuid()}")
            .Options;
        _db = new ApplicationDbContext(options);
        Seed();
    }

    public void Dispose() => _db.Dispose();

    private TaskService Service() => new(_db, _currentUser, new NoOpAudit(), new NoOpNotifications(), _clock);

    private void ActAs(int employeeId, string role)
    {
        var departmentId = employeeId is Olga or Ivan ? Finance : Engineering;
        _currentUser.Scope = new UserScope(Guid.NewGuid(), $"user{employeeId}@test.local", $"User {employeeId}", [role], employeeId, departmentId);
    }

    private void ActAsAdmin() =>
        _currentUser.Scope = new UserScope(Guid.NewGuid(), "admin@test.local", "Admin", [Roles.Admin], null, null);

    private static UpdateTaskStatusRequest Status(TaskItemStatus status, int? progress = null) => new(status, progress, null);

    private static CreateTaskRequest NewTask(int? assignee) =>
        new(PortalProject, "Write release notes", null, assignee, TaskItemStatus.Todo, Priority.Medium, null, null);

    // ---------------------------------------------------------------- employees

    [Fact]
    public async Task Employee_can_update_progress_of_own_task()
    {
        ActAs(Alice, Roles.Employee);

        var result = await Service().UpdateStatusAsync(AliceTask, Status(TaskItemStatus.InProgress, 40), CancellationToken.None);

        result.Status.Should().Be(TaskItemStatus.InProgress);
        result.ProgressPercentage.Should().Be(40);
    }

    [Fact]
    public async Task Employee_cannot_change_status_of_someone_elses_task()
    {
        ActAs(Alice, Roles.Employee);

        var act = () => Service().UpdateStatusAsync(BobTask, Status(TaskItemStatus.Completed), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
        (await _db.Tasks.AsNoTracking().SingleAsync(t => t.Id == BobTask)).Status.Should().Be(TaskItemStatus.Todo);
    }

    [Fact]
    public async Task Employee_cannot_cancel_own_task()
    {
        ActAs(Alice, Roles.Employee);

        var act = () => Service().UpdateStatusAsync(AliceTask, Status(TaskItemStatus.Cancelled), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>().WithMessage("*manager*");
    }

    [Fact]
    public async Task Employee_cannot_edit_details_of_own_task()
    {
        ActAs(Alice, Roles.Employee);
        var update = new UpdateTaskRequest("Renamed", null, Alice, TaskItemStatus.Todo, Priority.Critical, null, null, null, 0);

        var act = () => Service().UpdateAsync(AliceTask, update, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Employee_cannot_view_or_delete_someone_elses_task()
    {
        ActAs(Alice, Roles.Employee);

        await Service().Invoking(s => s.GetAsync(BobTask, CancellationToken.None)).Should().ThrowAsync<ForbiddenException>();
        await Service().Invoking(s => s.DeleteAsync(AliceTask, CancellationToken.None)).Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Employee_cannot_create_tasks()
    {
        ActAs(Alice, Roles.Employee);

        await Service().Invoking(s => s.CreateAsync(NewTask(Alice), CancellationToken.None)).Should().ThrowAsync<ForbiddenException>();
    }

    // ---------------------------------------------------------------- managers

    [Fact]
    public async Task Department_manager_can_assign_task_to_department_member()
    {
        ActAs(Mia, Roles.Manager);

        var created = await Service().CreateAsync(NewTask(Bob), CancellationToken.None);

        created.AssignedTo!.Id.Should().Be(Bob);
        (await _db.Tasks.SingleAsync(t => t.Id == created.Id)).AssignedById.Should().Be(Mia);
    }

    [Fact]
    public async Task Department_manager_cannot_assign_employee_outside_department_and_project()
    {
        ActAs(Mia, Roles.Manager);

        var act = () => Service().CreateAsync(NewTask(Olga), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>().WithMessage("*department or of this project*");
    }

    [Fact]
    public async Task Department_manager_can_assign_project_member_from_another_department()
    {
        _db.ProjectMembers.Add(new ProjectMember { ProjectId = PortalProject, EmployeeId = Olga, Role = "Analyst" });
        await _db.SaveChangesAsync();
        ActAs(Mia, Roles.Manager);

        var created = await Service().CreateAsync(NewTask(Olga), CancellationToken.None);

        created.AssignedTo!.Id.Should().Be(Olga);
    }

    [Fact]
    public async Task Manager_of_another_department_cannot_manage_project_tasks()
    {
        ActAs(Olga, Roles.Manager); // Finance manager, Portal belongs to Engineering

        await Service().Invoking(s => s.CreateAsync(NewTask(null), CancellationToken.None)).Should().ThrowAsync<ForbiddenException>();
        await Service().Invoking(s => s.UpdateStatusAsync(AliceTask, Status(TaskItemStatus.Review), CancellationToken.None))
            .Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Manager_can_cancel_department_task()
    {
        ActAs(Mia, Roles.Manager);

        var result = await Service().UpdateStatusAsync(BobTask, Status(TaskItemStatus.Cancelled), CancellationToken.None);

        result.Status.Should().Be(TaskItemStatus.Cancelled);
    }

    [Fact]
    public async Task Project_manager_can_assign_anyone_active()
    {
        ActAs(Paul, Roles.Employee); // not a Manager role, but manages the project

        var created = await Service().CreateAsync(NewTask(Olga), CancellationToken.None);

        created.AssignedTo!.Id.Should().Be(Olga);
    }

    [Fact]
    public async Task Inactive_employee_cannot_be_assigned_even_by_admin()
    {
        ActAsAdmin();

        var act = () => Service().CreateAsync(NewTask(Ivan), CancellationToken.None);

        (await act.Should().ThrowAsync<RequestValidationException>()).Which.Errors.Should().ContainKey("assignedToId");
    }

    [Fact]
    public async Task Admin_can_reassign_any_task()
    {
        ActAsAdmin();
        var update = new UpdateTaskRequest("Reassigned", null, Olga, TaskItemStatus.InProgress, Priority.High, null, null, null, 10);

        var result = await Service().UpdateAsync(BobTask, update, CancellationToken.None);

        result.AssignedTo!.Id.Should().Be(Olga);
        result.Title.Should().Be("Reassigned");
    }

    // ---------------------------------------------------------------- setup

    private void Seed()
    {
        _db.Departments.AddRange(
            new Department { Id = Engineering, Name = "Engineering", Code = "ENG" },
            new Department { Id = Finance, Name = "Finance", Code = "FIN" });
        _db.Positions.Add(new Position { Id = 1, Title = "Specialist" });

        Employee Person(int id, string first, int department, EmployeeStatus status = EmployeeStatus.Active) => new()
        {
            Id = id, EmployeeNumber = $"EMP-{id:000}", FirstName = first, LastName = "Test", Email = $"{first.ToLowerInvariant()}@test.local",
            DepartmentId = department, PositionId = 1, HireDate = new DateOnly(2024, 1, 1), Status = status
        };

        _db.Employees.AddRange(
            Person(Alice, "Alice", Engineering), Person(Bob, "Bob", Engineering), Person(Mia, "Mia", Engineering),
            Person(Olga, "Olga", Finance), Person(Paul, "Paul", Engineering), Person(Ivan, "Ivan", Finance, EmployeeStatus.Inactive));

        _db.Projects.Add(new Project
        {
            Id = PortalProject, Name = "Portal", ProjectCode = "PRT", StartDate = new DateOnly(2026, 1, 1),
            DepartmentId = Engineering, ProjectManagerId = Paul, Status = ProjectStatus.Active
        });
        _db.ProjectMembers.AddRange(
            new ProjectMember { ProjectId = PortalProject, EmployeeId = Alice },
            new ProjectMember { ProjectId = PortalProject, EmployeeId = Bob });

        _db.Tasks.AddRange(
            new TaskItem { Id = AliceTask, ProjectId = PortalProject, Title = "Alice's task", AssignedToId = Alice },
            new TaskItem { Id = BobTask, ProjectId = PortalProject, Title = "Bob's task", AssignedToId = Bob });

        _db.SaveChanges();
        _db.ChangeTracker.Clear();
    }

    private sealed class FakeCurrentUser : ICurrentUserService
    {
        public UserScope Scope { get; set; } = null!;
        public Guid? UserId => Scope.UserId;
        public string? Email => Scope.Email;
        public bool IsAuthenticated => true;
        public string? IpAddress => "127.0.0.1";
        public string? UserAgent => "unit-test";
        public Task<UserScope> GetScopeAsync(CancellationToken cancellationToken = default) => Task.FromResult(Scope);
    }

    private sealed class NoOpAudit : IAuditService
    {
        public void Record(string action, string entityName, string? entityId, object? oldValues = null, object? newValues = null,
            Guid? userId = null, string? userEmail = null)
        {
        }
    }

    private sealed class NoOpNotifications : INotificationPublisher
    {
        public Task NotifyUsersAsync(IEnumerable<Guid> userIds, LocalizedText title, LocalizedText message, NotificationType type,
            string? entityType = null, string? entityId = null, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task NotifyEmployeesAsync(IEnumerable<int> employeeIds, LocalizedText title, LocalizedText message, NotificationType type,
            string? entityType = null, string? entityId = null, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
