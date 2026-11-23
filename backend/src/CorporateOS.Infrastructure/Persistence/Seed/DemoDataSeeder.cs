using System.Text.Json;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Rules;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CorporateOS.Infrastructure.Persistence.Seed;

/// <summary>
/// Creates a realistic demo company. DEVELOPMENT/DEMO ONLY: every account uses the
/// published password <see cref="DemoPassword"/>. Runs only when the database has no
/// departments, and all dates are relative to "today" so dashboards always look current.
/// </summary>
public sealed class DemoDataSeeder(
    ApplicationDbContext db,
    UserManager<ApplicationUser> userManager,
    IFileStorage storage,
    TimeProvider clock,
    ILogger<DemoDataSeeder> logger)
{
    public const string DemoPassword = "CorporateOS123!";

    private DateTime _now;
    private DateOnly _today;
    private readonly Dictionary<string, Employee> _people = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, Department> _departments = new();
    private readonly Dictionary<string, Position> _positions = new();

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (await db.Departments.IgnoreQueryFilters().AnyAsync(cancellationToken))
        {
            logger.LogInformation("Demo data already present; skipping seed.");
            return;
        }

        _now = clock.GetUtcNow().UtcDateTime;
        _today = DateOnly.FromDateTime(_now);
        logger.LogInformation("Seeding demo data...");

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await SeedOrganizationAsync(cancellationToken);
        await SeedEmployeesAsync(cancellationToken);
        var projects = await SeedProjectsAsync(cancellationToken);
        await SeedTasksAsync(projects, cancellationToken);
        await SeedLeaveAsync(cancellationToken);
        await SeedExpensesAsync(cancellationToken);
        await SeedAnnouncementsAsync(cancellationToken);
        await SeedDocumentsAsync(cancellationToken);
        await SeedNotificationsAndAuditAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        logger.LogInformation("Demo data seeded: {Employees} employees, {Projects} projects.", _people.Count, projects.Count);
    }

    private async Task SeedOrganizationAsync(CancellationToken ct)
    {
        foreach (var (code, name, description) in new[]
                 {
                     ("SWD", "Software Development", "Designs, builds and operates the company's software products and internal platforms."),
                     ("HR", "Human Resources", "Recruitment, onboarding, people operations, benefits and employee relations."),
                     ("FIN", "Finance", "Accounting, budgeting, payroll, expense control and financial reporting."),
                     ("SAM", "Sales & Marketing", "Customer acquisition, account management, brand and campaign execution."),
                     ("OPS", "Operations", "Facilities, logistics, procurement and executive operations.")
                 })
        {
            var department = new Department { Code = code, Name = name, Description = description, CreatedAt = _now.AddYears(-4) };
            _departments[code] = department;
            db.Departments.Add(department);
        }

        await db.SaveChangesAsync(ct);

        foreach (var (key, title, dept, level, description) in new (string, string, string?, PositionLevel, string)[]
                 {
                     ("JSD", "Junior Software Developer", "SWD", PositionLevel.Junior, "Builds features under guidance of senior engineers."),
                     ("SD", "Software Developer", "SWD", PositionLevel.Mid, "Delivers features end to end across the stack."),
                     ("SSD", "Senior Software Developer", "SWD", PositionLevel.Senior, "Leads technical design and mentors developers."),
                     ("TL", "Team Lead", "SWD", PositionLevel.Lead, "Leads a delivery team and owns engineering quality."),
                     ("PM", "Project Manager", null, PositionLevel.Manager, "Plans and delivers cross-functional projects."),
                     ("HRS", "HR Specialist", "HR", PositionLevel.Mid, "Supports recruitment, onboarding and people operations."),
                     ("HRM", "HR Manager", "HR", PositionLevel.Manager, "Owns HR strategy, policy and employee relations."),
                     ("FS", "Finance Specialist", "FIN", PositionLevel.Mid, "Handles accounting, payables and expense control."),
                     ("FM", "Finance Manager", "FIN", PositionLevel.Manager, "Leads finance operations and reporting."),
                     ("SS", "Sales Specialist", "SAM", PositionLevel.Mid, "Manages a customer pipeline and closes deals."),
                     ("MS", "Marketing Specialist", "SAM", PositionLevel.Mid, "Plans and runs marketing campaigns."),
                     ("SM", "Sales Manager", "SAM", PositionLevel.Manager, "Leads the sales and marketing team."),
                     ("OS", "Operations Specialist", "OPS", PositionLevel.Mid, "Coordinates logistics, facilities and procurement."),
                     ("OM", "Operations Manager", "OPS", PositionLevel.Manager, "Runs day-to-day company operations."),
                     ("CEO", "Chief Executive Officer", null, PositionLevel.Executive, "Leads the company.")
                 })
        {
            var position = new Position
            {
                Title = title,
                Description = description,
                DepartmentId = dept is null ? null : _departments[dept].Id,
                Level = level,
                CreatedAt = _now.AddYears(-4)
            };
            _positions[key] = position;
            db.Positions.Add(position);
        }

        await db.SaveChangesAsync(ct);
    }

    private sealed record Person(
        string Key, string First, string Last, string Email, string Dept, string Position, string Role,
        string? Manager, EmploymentType Type, EmployeeStatus Status, int HiredMonthsAgo, decimal Salary);

    private async Task SeedEmployeesAsync(CancellationToken ct)
    {
        var people = new Person[]
        {
            new("olivia", "Olivia", "Bennett", "superadmin@corporateos.local", "OPS", "CEO", Roles.SuperAdmin, null, EmploymentType.FullTime, EmployeeStatus.Active, 70, 210000),
            new("marcus", "Marcus", "Reed", "admin@corporateos.local", "HR", "HRM", Roles.Admin, "olivia", EmploymentType.FullTime, EmployeeStatus.Active, 58, 118000),
            new("sophia", "Sophia", "Turner", "manager@corporateos.local", "SWD", "TL", Roles.Manager, "olivia", EmploymentType.FullTime, EmployeeStatus.Active, 52, 142000),
            new("daniel", "Daniel", "Kim", "employee@corporateos.local", "SWD", "SD", Roles.Employee, "sophia", EmploymentType.FullTime, EmployeeStatus.Active, 26, 98000),
            new("ethan", "Ethan", "Walker", "ethan.walker@corporateos.local", "SWD", "SSD", Roles.Employee, "sophia", EmploymentType.FullTime, EmployeeStatus.Active, 44, 128000),
            new("ava", "Ava", "Martinez", "ava.martinez@corporateos.local", "SWD", "SD", Roles.Employee, "sophia", EmploymentType.FullTime, EmployeeStatus.Active, 20, 95000),
            new("liam", "Liam", "Chen", "liam.chen@corporateos.local", "SWD", "JSD", Roles.Employee, "sophia", EmploymentType.FullTime, EmployeeStatus.Active, 9, 72000),
            new("noah", "Noah", "Patel", "noah.patel@corporateos.local", "SWD", "SSD", Roles.Employee, "sophia", EmploymentType.FullTime, EmployeeStatus.OnLeave, 38, 131000),
            new("mia", "Mia", "Johnson", "mia.johnson@corporateos.local", "SWD", "JSD", Roles.Employee, "sophia", EmploymentType.Intern, EmployeeStatus.Active, 3, 38000),
            new("james", "James", "Wilson", "james.wilson@corporateos.local", "SWD", "PM", Roles.Employee, "sophia", EmploymentType.FullTime, EmployeeStatus.Active, 33, 115000),
            new("isabella", "Isabella", "Lopez", "isabella.lopez@corporateos.local", "SWD", "SD", Roles.Employee, "sophia", EmploymentType.Contractor, EmployeeStatus.Active, 7, 105000),
            new("emma", "Emma", "Davis", "emma.davis@corporateos.local", "HR", "HRS", Roles.Employee, "marcus", EmploymentType.FullTime, EmployeeStatus.Active, 29, 68000),
            new("lucas", "Lucas", "Brown", "lucas.brown@corporateos.local", "HR", "HRS", Roles.Employee, "marcus", EmploymentType.PartTime, EmployeeStatus.Active, 14, 36000),
            new("charlotte", "Charlotte", "Evans", "charlotte.evans@corporateos.local", "FIN", "FM", Roles.Manager, "olivia", EmploymentType.FullTime, EmployeeStatus.Active, 61, 125000),
            new("benjamin", "Benjamin", "Clark", "benjamin.clark@corporateos.local", "FIN", "FS", Roles.Employee, "charlotte", EmploymentType.FullTime, EmployeeStatus.Active, 35, 76000),
            new("amelia", "Amelia", "Lewis", "amelia.lewis@corporateos.local", "FIN", "FS", Roles.Employee, "charlotte", EmploymentType.FullTime, EmployeeStatus.Active, 18, 71000),
            new("henry", "Henry", "Young", "henry.young@corporateos.local", "FIN", "FS", Roles.Employee, "charlotte", EmploymentType.FullTime, EmployeeStatus.Active, 46, 79000),
            new("william", "William", "Harris", "william.harris@corporateos.local", "SAM", "SM", Roles.Manager, "olivia", EmploymentType.FullTime, EmployeeStatus.Active, 49, 121000),
            new("harper", "Harper", "Hall", "harper.hall@corporateos.local", "SAM", "MS", Roles.Employee, "william", EmploymentType.FullTime, EmployeeStatus.Active, 22, 69000),
            new("alexander", "Alexander", "King", "alexander.king@corporateos.local", "SAM", "SS", Roles.Employee, "william", EmploymentType.FullTime, EmployeeStatus.Active, 31, 74000),
            new("evelyn", "Evelyn", "Wright", "evelyn.wright@corporateos.local", "SAM", "SS", Roles.Employee, "william", EmploymentType.FullTime, EmployeeStatus.Active, 12, 70000),
            new("sebastian", "Sebastian", "Scott", "sebastian.scott@corporateos.local", "SAM", "MS", Roles.Employee, "william", EmploymentType.Intern, EmployeeStatus.Active, 4, 34000),
            new("grace", "Grace", "Adams", "grace.adams@corporateos.local", "OPS", "OM", Roles.Manager, "olivia", EmploymentType.FullTime, EmployeeStatus.Active, 55, 112000),
            new("jack", "Jack", "Nelson", "jack.nelson@corporateos.local", "OPS", "OS", Roles.Employee, "grace", EmploymentType.FullTime, EmployeeStatus.Active, 27, 64000),
            new("chloe", "Chloe", "Baker", "chloe.baker@corporateos.local", "OPS", "OS", Roles.Employee, "grace", EmploymentType.FullTime, EmployeeStatus.Inactive, 40, 62000),
        };

        var number = 1;
        foreach (var p in people)
        {
            var hired = _today.AddMonths(-p.HiredMonthsAgo);
            var user = new ApplicationUser
            {
                UserName = p.Email,
                Email = p.Email,
                EmailConfirmed = true,
                DisplayName = $"{p.First} {p.Last}",
                IsActive = p.Status is EmployeeStatus.Active or EmployeeStatus.OnLeave,
                CreatedAt = hired.ToDateTime(new TimeOnly(9, 0)),
                LastLoginAt = p.Status == EmployeeStatus.Active ? _now.AddHours(-(number * 7 % 90)) : null
            };

            var result = await userManager.CreateAsync(user, DemoPassword);
            if (!result.Succeeded)
            {
                throw new InvalidOperationException($"Failed to seed user {p.Email}: {string.Join(", ", result.Errors.Select(e => e.Description))}");
            }

            await userManager.AddToRoleAsync(user, p.Role);

            var employee = new Employee
            {
                EmployeeNumber = $"EMP-{number:D4}",
                FirstName = p.First,
                LastName = p.Last,
                Email = p.Email,
                Phone = $"+1 555 01{number:D2}",
                DepartmentId = _departments[p.Dept].Id,
                PositionId = _positions[p.Position].Id,
                HireDate = hired,
                EmploymentType = p.Type,
                Status = p.Status,
                Address = $"{100 + number * 7} {Streets[number % Streets.Length]}, Springfield",
                EmergencyContactName = $"{EmergencyNames[number % EmergencyNames.Length]} {p.Last}",
                EmergencyContactPhone = $"+1 555 02{number:D2}",
                BirthDate = _today.AddYears(-(24 + number % 25)).AddDays(-(number * 37 % 300)),
                Salary = p.Salary,
                UserId = user.Id,
                CreatedAt = hired.ToDateTime(new TimeOnly(9, 0))
            };
            _people[p.Key] = employee;
            db.Employees.Add(employee);
            number++;
        }

        await db.SaveChangesAsync(ct);

        foreach (var p in people.Where(p => p.Manager is not null))
        {
            _people[p.Key].ManagerId = _people[p.Manager!].Id;
        }

        _departments["SWD"].ManagerId = _people["sophia"].Id;
        _departments["HR"].ManagerId = _people["marcus"].Id;
        _departments["FIN"].ManagerId = _people["charlotte"].Id;
        _departments["SAM"].ManagerId = _people["william"].Id;
        _departments["OPS"].ManagerId = _people["grace"].Id;
        await db.SaveChangesAsync(ct);
    }

    private static readonly string[] Streets = ["Maple Avenue", "Oak Street", "Cedar Lane", "Pine Road", "Elm Court", "Birch Way", "Willow Drive"];
    private static readonly string[] EmergencyNames = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie"];

    private async Task<List<Project>> SeedProjectsAsync(CancellationToken ct)
    {
        var definitions = new (string Code, string Name, string Dept, string Pm, ProjectStatus Status, Priority Priority, int StartOffset, int? EndOffset, decimal Budget, int Progress, string Description, string[] Members)[]
        {
            ("CPM-2026", "Customer Portal Modernization", "SWD", "james", ProjectStatus.Active, Priority.High, -150, 120, 250000, 55,
                "Rebuild the customer self-service portal on a modern stack with single sign-on, a new billing area and accessibility compliance.",
                ["sophia", "daniel", "ethan", "ava", "liam", "isabella", "harper"]),
            ("HRIS-26", "HR Information System Rollout", "HR", "marcus", ProjectStatus.Active, Priority.Medium, -90, 60, 80000, 40,
                "Replace spreadsheets with a central HR information system covering onboarding, contracts and leave policies.",
                ["emma", "lucas", "noah", "benjamin"]),
            ("FIN-CLOSE", "Automated Month-End Close", "FIN", "charlotte", ProjectStatus.Planning, Priority.High, 14, 200, 120000, 10,
                "Automate reconciliations and journal entries to shorten the month-end close from eight days to three.",
                ["benjamin", "amelia", "henry", "ethan"]),
            ("MKT-Q4", "Q4 Brand Campaign", "SAM", "william", ProjectStatus.Active, Priority.Critical, -60, 25, 60000, 70,
                "Multi-channel brand campaign for the fourth quarter including the product launch event and paid media.",
                ["harper", "alexander", "evelyn", "sebastian"]),
            ("OPS-WMS", "Warehouse Management Upgrade", "OPS", "grace", ProjectStatus.OnHold, Priority.Medium, -120, 90, 150000, 25,
                "Upgrade warehouse management software and barcode scanners. Paused pending vendor contract renewal.",
                ["jack", "daniel", "amelia"]),
            ("DATA-HUB", "Analytics Data Hub", "SWD", "sophia", ProjectStatus.Completed, Priority.Medium, -330, -40, 95000, 100,
                "Central data warehouse and self-service dashboards for operational reporting.",
                ["ethan", "noah", "ava"])
        };

        var projects = new List<Project>();
        foreach (var d in definitions)
        {
            var project = new Project
            {
                ProjectCode = d.Code,
                Name = d.Name,
                Description = d.Description,
                DepartmentId = _departments[d.Dept].Id,
                ProjectManagerId = _people[d.Pm].Id,
                Status = d.Status,
                Priority = d.Priority,
                StartDate = _today.AddDays(d.StartOffset),
                EndDate = d.EndOffset.HasValue ? _today.AddDays(d.EndOffset.Value) : null,
                Budget = d.Budget,
                ProgressPercentage = d.Progress,
                CreatedAt = _now.AddDays(Math.Min(d.StartOffset, 0) - 10)
            };
            project.Members.Add(new ProjectMember { EmployeeId = _people[d.Pm].Id, Role = "Project Manager", JoinedAt = project.CreatedAt });
            foreach (var member in d.Members.Where(m => m != d.Pm))
            {
                project.Members.Add(new ProjectMember
                {
                    EmployeeId = _people[member].Id,
                    Role = member is "sophia" or "ethan" ? "Technical Lead" : member is "harper" ? "Design" : "Member",
                    JoinedAt = project.CreatedAt.AddDays(3)
                });
            }

            projects.Add(project);
            db.Projects.Add(project);
        }

        await db.SaveChangesAsync(ct);
        return projects;
    }

    private async Task SeedTasksAsync(List<Project> projects, CancellationToken ct)
    {
        var definitions = new (int Project, string Title, string Assignee, string By, TaskItemStatus Status, Priority Priority, int? Due, decimal Est, decimal Actual, int Progress)[]
        {
            (0, "Design single sign-on integration", "ethan", "james", TaskItemStatus.Completed, Priority.High, -30, 24, 26, 100),
            (0, "Implement billing overview page", "daniel", "james", TaskItemStatus.InProgress, Priority.High, 5, 32, 18, 60),
            (0, "Accessibility audit of checkout flow", "ava", "james", TaskItemStatus.Review, Priority.Medium, 2, 16, 15, 90),
            (0, "Migrate customer profile API", "daniel", "sophia", TaskItemStatus.Todo, Priority.Medium, 12, 20, 0, 0),
            (0, "Set up end-to-end test suite", "liam", "sophia", TaskItemStatus.InProgress, Priority.Medium, -3, 24, 20, 70),
            (0, "Invoice PDF generation service", "isabella", "james", TaskItemStatus.InProgress, Priority.High, 1, 18, 9, 45),
            (0, "Portal visual design system", "harper", "james", TaskItemStatus.Completed, Priority.Medium, -45, 40, 44, 100),
            (0, "Performance budget and monitoring", "ethan", "sophia", TaskItemStatus.Todo, Priority.Low, 30, 12, 0, 0),
            (0, "Fix session timeout on mobile Safari", "daniel", "sophia", TaskItemStatus.Todo, Priority.Critical, -1, 6, 0, 0),
            (1, "Collect HR data migration requirements", "emma", "marcus", TaskItemStatus.Completed, Priority.High, -50, 16, 14, 100),
            (1, "Configure onboarding workflow", "emma", "marcus", TaskItemStatus.InProgress, Priority.Medium, 7, 24, 10, 40),
            (1, "Import employee contracts", "lucas", "marcus", TaskItemStatus.Todo, Priority.Medium, 14, 20, 0, 0),
            (1, "Payroll interface specification", "benjamin", "marcus", TaskItemStatus.Review, Priority.High, 3, 12, 11, 85),
            (1, "Single sign-on for HRIS", "noah", "marcus", TaskItemStatus.Todo, Priority.Low, 21, 10, 0, 0),
            (2, "Map current close process", "amelia", "charlotte", TaskItemStatus.InProgress, Priority.High, 10, 16, 6, 30),
            (2, "Evaluate reconciliation tools", "benjamin", "charlotte", TaskItemStatus.Todo, Priority.Medium, 25, 20, 0, 0),
            (2, "Define journal entry templates", "henry", "charlotte", TaskItemStatus.Todo, Priority.Medium, 35, 12, 0, 0),
            (2, "Technical feasibility review", "ethan", "charlotte", TaskItemStatus.Todo, Priority.Medium, 18, 8, 0, 0),
            (3, "Launch event landing page", "harper", "william", TaskItemStatus.Completed, Priority.Critical, -10, 20, 22, 100),
            (3, "Paid social campaign setup", "evelyn", "william", TaskItemStatus.InProgress, Priority.High, 4, 16, 9, 55),
            (3, "Press release and media list", "sebastian", "william", TaskItemStatus.Review, Priority.Medium, 1, 10, 9, 90),
            (3, "Partner co-marketing outreach", "alexander", "william", TaskItemStatus.InProgress, Priority.High, -2, 14, 10, 65),
            (3, "Campaign performance dashboard", "harper", "william", TaskItemStatus.Todo, Priority.Medium, 9, 8, 0, 0),
            (3, "Customer testimonial videos", "evelyn", "william", TaskItemStatus.Cancelled, Priority.Low, null, 30, 4, 10),
            (4, "Vendor contract renewal", "grace", "grace", TaskItemStatus.InProgress, Priority.High, -5, 10, 6, 50),
            (4, "Barcode scanner pilot", "jack", "grace", TaskItemStatus.Todo, Priority.Medium, 40, 24, 0, 0),
            (4, "Inventory data cleanup", "amelia", "grace", TaskItemStatus.Completed, Priority.Medium, -60, 30, 34, 100),
            (4, "WMS integration spike", "daniel", "grace", TaskItemStatus.Completed, Priority.Low, -70, 8, 9, 100),
            (5, "Build warehouse schema", "ethan", "sophia", TaskItemStatus.Completed, Priority.High, -200, 40, 38, 100),
            (5, "Operational KPI dashboards", "ava", "sophia", TaskItemStatus.Completed, Priority.Medium, -120, 32, 35, 100),
            (5, "Data quality checks", "noah", "sophia", TaskItemStatus.Completed, Priority.Medium, -90, 20, 18, 100),
            (5, "Handover documentation", "ava", "sophia", TaskItemStatus.Completed, Priority.Low, -45, 8, 7, 100),
            (0, "Customer feedback survey integration", "ava", "sophia", TaskItemStatus.Todo, Priority.Low, 20, 10, 0, 0),
            (1, "Leave policy configuration", "lucas", "marcus", TaskItemStatus.InProgress, Priority.Medium, 6, 8, 3, 35),
        };

        var tasks = new List<TaskItem>();
        foreach (var d in definitions)
        {
            var project = projects[d.Project];
            var created = project.CreatedAt.AddDays(5 + tasks.Count % 20);
            if (created > _now)
            {
                created = _now.AddDays(-2);
            }

            var task = new TaskItem
            {
                ProjectId = project.Id,
                Title = d.Title,
                Description = $"{d.Title} for the {project.Name} project. Acceptance criteria are tracked in the project brief.",
                AssignedToId = _people[d.Assignee].Id,
                AssignedById = _people[d.By].Id,
                Status = d.Status,
                Priority = d.Priority,
                DueDate = d.Due.HasValue ? _today.AddDays(d.Due.Value) : null,
                EstimatedHours = d.Est,
                ActualHours = d.Actual == 0 ? null : d.Actual,
                ProgressPercentage = d.Progress,
                CompletedAt = d.Status == TaskItemStatus.Completed ? _today.AddDays((d.Due ?? 0) - 1).ToDateTime(new TimeOnly(16, 30)) : null,
                CreatedAt = created
            };
            tasks.Add(task);
            db.Tasks.Add(task);
        }

        await db.SaveChangesAsync(ct);

        var comments = new (int Task, string Author, string Text, int HoursAgo)[]
        {
            (1, "daniel", "Billing totals are wired up. Working on the invoice history table next.", 30),
            (1, "james", "Great progress. Please align the empty states with the design system.", 26),
            (2, "ava", "Found two contrast issues on the payment step; fixes are in review.", 20),
            (2, "sophia", "Thanks — let's include keyboard focus order in the checklist too.", 18),
            (4, "liam", "Flaky login test fixed by waiting for the redirect explicitly.", 50),
            (5, "isabella", "PDF layout matches the finance template. Need sample invoices with discounts.", 12),
            (8, "sophia", "Reproduced on iOS 17. Likely related to the refresh cookie path.", 6),
            (8, "daniel", "I'll pick this up after the billing page review.", 4),
            (10, "emma", "Onboarding checklist imported. Waiting on IT for account provisioning steps.", 40),
            (12, "benjamin", "Spec draft shared with payroll provider for comments.", 22),
            (19, "evelyn", "Audience segments approved. Creatives due from design on Thursday.", 15),
            (20, "sebastian", "Press release ready for final legal review.", 9),
            (21, "alexander", "Two partners confirmed, waiting on a third.", 28),
            (24, "grace", "Vendor sent a revised quote; reviewing with finance.", 33),
            (14, "amelia", "Current close takes 8 working days; biggest delay is intercompany reconciliation.", 45),
        };

        foreach (var c in comments)
        {
            db.TaskComments.Add(new TaskComment
            {
                TaskItemId = tasks[c.Task].Id,
                AuthorId = _people[c.Author].UserId!.Value,
                Content = c.Text,
                CreatedAt = _now.AddHours(-c.HoursAgo)
            });
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task SeedLeaveAsync(CancellationToken ct)
    {
        var year = _today.Year;
        var balances = _people.Values.ToDictionary(e => e.Id, e => new LeaveBalance { EmployeeId = e.Id, Year = year, TotalDays = 20 });
        balances[_people["olivia"].Id].TotalDays = 25;
        balances[_people["marcus"].Id].TotalDays = 25;
        balances[_people["lucas"].Id].TotalDays = 10;

        var requests = new (string Who, LeaveType Type, int StartOffset, int Length, LeaveRequestStatus Status, string? Approver, string Reason)[]
        {
            ("daniel", LeaveType.AnnualLeave, -75, 5, LeaveRequestStatus.Approved, "sophia", "Family vacation"),
            ("daniel", LeaveType.AnnualLeave, 21, 3, LeaveRequestStatus.Pending, null, "Long weekend trip"),
            ("daniel", LeaveType.SickLeave, -20, 1, LeaveRequestStatus.Approved, "sophia", "Flu"),
            ("ethan", LeaveType.AnnualLeave, 10, 5, LeaveRequestStatus.Pending, null, "Conference and holiday"),
            ("ava", LeaveType.AnnualLeave, -40, 4, LeaveRequestStatus.Approved, "sophia", "Wedding"),
            ("liam", LeaveType.AnnualLeave, 5, 2, LeaveRequestStatus.Pending, null, "Moving apartment"),
            ("noah", LeaveType.PaternityLeave, -5, 15, LeaveRequestStatus.Approved, "sophia", "Paternity leave"),
            ("isabella", LeaveType.UnpaidLeave, 30, 5, LeaveRequestStatus.Rejected, "sophia", "Personal travel"),
            ("emma", LeaveType.AnnualLeave, -100, 7, LeaveRequestStatus.Approved, "marcus", "Summer holiday"),
            ("lucas", LeaveType.SickLeave, -3, 2, LeaveRequestStatus.Approved, "marcus", "Medical appointment"),
            ("benjamin", LeaveType.AnnualLeave, 14, 4, LeaveRequestStatus.Pending, null, "Family visit"),
            ("amelia", LeaveType.AnnualLeave, -60, 3, LeaveRequestStatus.Approved, "charlotte", "Short break"),
            ("harper", LeaveType.AnnualLeave, 2, 3, LeaveRequestStatus.Pending, null, "Personal"),
            ("alexander", LeaveType.AnnualLeave, -130, 10, LeaveRequestStatus.Approved, "william", "Summer holiday"),
            ("evelyn", LeaveType.Other, 7, 1, LeaveRequestStatus.Cancelled, null, "Jury duty (rescheduled)"),
            ("jack", LeaveType.AnnualLeave, -15, 5, LeaveRequestStatus.Approved, "grace", "Holiday"),
            ("sophia", LeaveType.AnnualLeave, 35, 5, LeaveRequestStatus.Pending, null, "Winter break"),
        };

        foreach (var r in requests)
        {
            var start = NextWorkingDay(_today.AddDays(r.StartOffset));
            var end = AddWorkingDays(start, r.Length - 1);
            var employee = _people[r.Who];
            var days = LeaveDayCalculator.CountWorkingDays(start, end);
            var created = _now.AddDays(Math.Min(r.StartOffset, 0) - 14);

            var leave = new LeaveRequest
            {
                EmployeeId = employee.Id,
                LeaveType = r.Type,
                StartDate = start,
                EndDate = end,
                TotalDays = days,
                Reason = r.Reason,
                Status = r.Status,
                CreatedAt = created
            };

            if (r.Approver is not null)
            {
                leave.ApprovedById = _people[r.Approver].Id;
                leave.ApprovedAt = created.AddDays(1);
                if (r.Status == LeaveRequestStatus.Rejected)
                {
                    leave.RejectionReason = "Critical release window; please choose different dates.";
                }
                else
                {
                    leave.ApprovalNote = "Enjoy your time off.";
                }
            }

            if (r.Status == LeaveRequestStatus.Approved && r.Type == LeaveType.AnnualLeave && start.Year == year)
            {
                balances[employee.Id].UsedDays += days;
            }

            db.LeaveRequests.Add(leave);
        }

        db.LeaveBalances.AddRange(balances.Values);
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedExpensesAsync(CancellationToken ct)
    {
        var expenses = new (string Who, ExpenseCategory Category, decimal Amount, string Currency, int DaysAgo, ExpenseStatus Status, string? Approver, string Description)[]
        {
            ("daniel", ExpenseCategory.Equipment, 129.99m, "USD", 4, ExpenseStatus.Draft, null, "Ergonomic keyboard"),
            ("daniel", ExpenseCategory.Travel, 420.00m, "USD", 12, ExpenseStatus.Submitted, null, "Train tickets to client workshop"),
            ("daniel", ExpenseCategory.Meal, 64.50m, "USD", 35, ExpenseStatus.Approved, "sophia", "Team lunch after release"),
            ("daniel", ExpenseCategory.Accommodation, 610.00m, "USD", 80, ExpenseStatus.Paid, "sophia", "Hotel for DevConf (3 nights)"),
            ("daniel", ExpenseCategory.Office, 45.00m, "USD", 50, ExpenseStatus.Rejected, "sophia", "Desk plant"),
            ("ethan", ExpenseCategory.Travel, 980.00m, "USD", 20, ExpenseStatus.Submitted, null, "Flight to architecture summit"),
            ("ava", ExpenseCategory.Equipment, 349.00m, "USD", 9, ExpenseStatus.Submitted, null, "External monitor"),
            ("liam", ExpenseCategory.Transportation, 38.20m, "USD", 6, ExpenseStatus.Submitted, null, "Taxi to data center"),
            ("isabella", ExpenseCategory.Meal, 120.00m, "USD", 25, ExpenseStatus.Approved, "sophia", "Client dinner"),
            ("james", ExpenseCategory.Travel, 1250.00m, "USD", 60, ExpenseStatus.Paid, "sophia", "Customer site visit"),
            ("emma", ExpenseCategory.Office, 89.90m, "USD", 15, ExpenseStatus.Submitted, null, "Onboarding welcome kits"),
            ("marcus", ExpenseCategory.Travel, 760.00m, "USD", 40, ExpenseStatus.Approved, "olivia", "HR leadership forum"),
            ("benjamin", ExpenseCategory.Office, 59.00m, "USD", 18, ExpenseStatus.Approved, "charlotte", "Accounting reference books"),
            ("amelia", ExpenseCategory.Transportation, 24.00m, "USD", 3, ExpenseStatus.Submitted, null, "Parking at auditor's office"),
            ("harper", ExpenseCategory.Equipment, 1899.00m, "USD", 70, ExpenseStatus.Paid, "william", "Design laptop"),
            ("alexander", ExpenseCategory.Meal, 210.00m, "EUR", 14, ExpenseStatus.Submitted, null, "Partner dinner in Berlin"),
            ("alexander", ExpenseCategory.Accommodation, 540.00m, "EUR", 15, ExpenseStatus.Approved, "william", "Hotel Berlin (2 nights)"),
            ("evelyn", ExpenseCategory.Travel, 315.00m, "USD", 110, ExpenseStatus.Paid, "william", "Trade show travel"),
            ("jack", ExpenseCategory.Equipment, 230.00m, "USD", 22, ExpenseStatus.Submitted, null, "Safety equipment for warehouse"),
            ("grace", ExpenseCategory.Travel, 870.00m, "USD", 150, ExpenseStatus.Paid, "olivia", "Vendor site evaluation"),
            ("sophia", ExpenseCategory.Meal, 180.00m, "USD", 8, ExpenseStatus.Submitted, null, "Sprint retrospective team dinner"),
            ("henry", ExpenseCategory.Office, 75.00m, "USD", 200, ExpenseStatus.Paid, "charlotte", "Calculator and supplies"),
        };

        foreach (var e in expenses)
        {
            var date = _today.AddDays(-e.DaysAgo);
            var created = date.ToDateTime(new TimeOnly(18, 0));
            var expense = new Expense
            {
                EmployeeId = _people[e.Who].Id,
                Category = e.Category,
                Amount = e.Amount,
                Currency = e.Currency,
                ExpenseDate = date,
                Description = e.Description,
                Status = e.Status,
                CreatedAt = created,
                SubmittedAt = e.Status == ExpenseStatus.Draft ? null : created.AddHours(2)
            };

            if (e.Approver is not null)
            {
                expense.ApprovedById = _people[e.Approver].Id;
                expense.ApprovedAt = created.AddDays(2);
                if (e.Status == ExpenseStatus.Rejected)
                {
                    expense.RejectionReason = "Decorative items are not reimbursable under the expense policy.";
                }
            }

            if (e.Status == ExpenseStatus.Paid)
            {
                expense.PaidAt = created.AddDays(6);
            }

            db.Expenses.Add(expense);
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task SeedAnnouncementsAsync(CancellationToken ct)
    {
        var author = _people["marcus"].UserId!.Value;
        var ceo = _people["olivia"].UserId!.Value;
        var items = new (string Title, string Content, AnnouncementPriority Priority, int PublishDaysAgo, int? ExpireInDays, bool Pinned, AnnouncementTarget Target, string? Dept, Guid By)[]
        {
            ("Welcome to CorporateOS", "CorporateOS is now our single place for tasks, leave, expenses, documents and company news. Please review your profile and emergency contact details this week.",
                AnnouncementPriority.High, 30, null, true, AnnouncementTarget.AllEmployees, null, ceo),
            ("Updated travel & expense policy", "The travel and expense policy has been updated. Meals are reimbursable up to 75 USD per person and receipts are required for all claims above 25 USD. The full policy is available in Documents.",
                AnnouncementPriority.Normal, 12, null, false, AnnouncementTarget.AllEmployees, null, author),
            ("Office closed for maintenance", "The main office will be closed this Saturday for electrical maintenance. Remote access remains available.",
                AnnouncementPriority.Normal, 3, 5, false, AnnouncementTarget.AllEmployees, null, author),
            ("Release freeze next week", "A code freeze applies from Monday to Wednesday for the customer portal release. Only critical fixes approved by the team lead will be merged.",
                AnnouncementPriority.Urgent, 1, 10, true, AnnouncementTarget.SpecificDepartment, "SWD", _people["sophia"].UserId!.Value),
            ("Q3 performance review calibration", "Managers: calibration sessions run next week. Please submit preliminary ratings for your team by Friday.",
                AnnouncementPriority.High, 5, 20, false, AnnouncementTarget.ManagersOnly, null, author),
            ("Annual company offsite", "Save the date! Our annual offsite takes place next month. Agenda and travel details will follow.",
                AnnouncementPriority.Normal, -3, 40, false, AnnouncementTarget.AllEmployees, null, ceo),
            ("Benefits enrollment closed", "Open enrollment for benefits has closed. Contact HR with any questions.",
                AnnouncementPriority.Low, 60, -20, false, AnnouncementTarget.AllEmployees, null, author),
        };

        foreach (var a in items)
        {
            var publish = _now.AddDays(-a.PublishDaysAgo);
            db.Announcements.Add(new Announcement
            {
                Title = a.Title,
                Content = a.Content,
                Priority = a.Priority,
                PublishDate = publish,
                ExpireDate = a.ExpireInDays.HasValue ? _now.AddDays(a.ExpireInDays.Value) : null,
                IsPinned = a.Pinned,
                TargetType = a.Target,
                DepartmentId = a.Dept is null ? null : _departments[a.Dept].Id,
                CreatedById = a.By,
                CreatedAt = publish.AddMinutes(-30),
                // Scheduled items stay unsent so the background job notifies at publish time.
                NotificationsSentAt = publish <= _now ? publish : null
            });
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task SeedDocumentsAsync(CancellationToken ct)
    {
        var uploader = _people["marcus"].UserId!.Value;
        var items = new (string Name, string Description, DocumentCategory Category, DocumentAccessLevel Access, string? Dept, string Extension, Func<byte[]> Content)[]
        {
            ("Employee Handbook 2026", "Company values, conduct, working hours and benefits.", DocumentCategory.HR, DocumentAccessLevel.AllEmployees, null, ".pdf",
                () => SampleFiles.Pdf("Employee Handbook 2026", ["1. Our values", "2. Working hours and remote work", "3. Leave and holidays", "4. Code of conduct", "5. Benefits overview"])),
            ("Travel & Expense Policy", "Rules for travel booking, per-diems and reimbursable expenses.", DocumentCategory.Policy, DocumentAccessLevel.AllEmployees, null, ".pdf",
                () => SampleFiles.Pdf("Travel & Expense Policy", ["Meals: up to 75 USD per person", "Receipts required above 25 USD", "Submit claims within 60 days", "Economy class for flights under 6 hours"])),
            ("Information Security Policy", "Acceptable use, passwords and incident reporting.", DocumentCategory.Policy, DocumentAccessLevel.AllEmployees, null, ".pdf",
                () => SampleFiles.Pdf("Information Security Policy", ["Use a password manager", "Lock your screen when away", "Report incidents to security@corporateos.local within 1 hour"])),
            ("Leave Request Procedure", "How to request, approve and record leave.", DocumentCategory.Procedure, DocumentAccessLevel.AllEmployees, null, ".txt",
                () => SampleFiles.Text("Leave Request Procedure\n\n1. Submit the request in CorporateOS at least two weeks in advance.\n2. Your manager approves or rejects it.\n3. Approved annual leave is deducted from your balance automatically.\n")),
            ("Engineering On-Call Runbook", "Escalation paths and first-response steps for production incidents.", DocumentCategory.Procedure, DocumentAccessLevel.DepartmentOnly, "SWD", ".pdf",
                () => SampleFiles.Pdf("Engineering On-Call Runbook", ["Acknowledge alerts within 10 minutes", "Open an incident channel", "Escalate to the team lead after 30 minutes"])),
            ("FY Budget Summary", "Department budget allocations for the fiscal year.", DocumentCategory.Finance, DocumentAccessLevel.Managers, null, ".csv",
                () => SampleFiles.Text("Department,Budget USD\nSoftware Development,1450000\nHuman Resources,420000\nFinance,380000\nSales & Marketing,910000\nOperations,640000\n")),
            ("Customer Portal Project Charter", "Scope, milestones and stakeholders for CPM-2026.", DocumentCategory.Project, DocumentAccessLevel.DepartmentOnly, "SWD", ".pdf",
                () => SampleFiles.Pdf("Customer Portal Project Charter", ["Objective: modern self-service portal", "Milestone 1: SSO", "Milestone 2: Billing", "Milestone 3: Launch"])),
            ("Salary Bands 2026", "Compensation bands by level. Confidential.", DocumentCategory.HR, DocumentAccessLevel.AdminOnly, null, ".csv",
                () => SampleFiles.Text("Level,Min USD,Max USD\nJunior,60000,80000\nMid,75000,105000\nSenior,100000,140000\nLead,125000,160000\nManager,110000,170000\n")),
        };

        var index = 0;
        foreach (var d in items)
        {
            var bytes = d.Content();
            using var stream = new MemoryStream(bytes);
            var path = await storage.SaveAsync(stream, "documents", d.Extension, ct);
            db.Documents.Add(new Document
            {
                Name = d.Name,
                Description = d.Description,
                FilePath = path,
                OriginalFileName = d.Name.Replace(' ', '-').Replace("&", "and") + d.Extension,
                FileType = d.Extension.TrimStart('.').ToUpperInvariant(),
                ContentType = FileRules.ContentTypeFor(d.Extension),
                FileSize = bytes.Length,
                Category = d.Category,
                AccessLevel = d.Access,
                DepartmentId = d.Dept is null ? null : _departments[d.Dept].Id,
                UploadedById = uploader,
                CreatedAt = _now.AddDays(-(40 - index * 4))
            });
            index++;
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task SeedNotificationsAndAuditAsync(CancellationToken ct)
    {
        var tasks = await db.Tasks.AsNoTracking().ToListAsync(ct);
        var leave = await db.LeaveRequests.AsNoTracking().ToListAsync(ct);
        var expenses = await db.Expenses.AsNoTracking().ToListAsync(ct);
        var announcements = await db.Announcements.AsNoTracking().Where(a => a.NotificationsSentAt != null).ToListAsync(ct);

        void Notify(string who, string title, string message, NotificationType type, string? entityType, int? entityId, int hoursAgo, bool read)
        {
            db.Notifications.Add(new Notification
            {
                UserId = _people[who].UserId!.Value,
                Title = title,
                Message = message,
                Type = type,
                RelatedEntityType = entityType,
                RelatedEntityId = entityId?.ToString(),
                IsRead = read,
                ReadAt = read ? _now.AddHours(-hoursAgo + 1) : null,
                CreatedAt = _now.AddHours(-hoursAgo)
            });
        }

        // Task assignments for every open task.
        foreach (var task in tasks.Where(t => t.AssignedToId.HasValue && t.Status is TaskItemStatus.Todo or TaskItemStatus.InProgress))
        {
            var who = _people.First(p => p.Value.Id == task.AssignedToId).Key;
            Notify(who, "New task assigned", $"\"{task.Title}\" has been assigned to you.", NotificationType.TaskAssigned, "Task", task.Id,
                (int)(_now - task.CreatedAt).TotalHours, read: task.Status == TaskItemStatus.InProgress);
        }

        foreach (var request in leave.Where(l => l.Status is LeaveRequestStatus.Approved or LeaveRequestStatus.Rejected))
        {
            var who = _people.First(p => p.Value.Id == request.EmployeeId).Key;
            var approved = request.Status == LeaveRequestStatus.Approved;
            Notify(who, approved ? "Leave request approved" : "Leave request rejected",
                $"Your {request.LeaveType} request for {request.StartDate:MMM d} – {request.EndDate:MMM d} was {(approved ? "approved" : "rejected")}.",
                approved ? NotificationType.LeaveApproved : NotificationType.LeaveRejected, nameof(LeaveRequest), request.Id,
                (int)(_now - request.ApprovedAt!.Value).TotalHours, read: request.StartDate < _today.AddDays(-30));
        }

        foreach (var request in leave.Where(l => l.Status == LeaveRequestStatus.Pending))
        {
            var employee = _people.Values.First(p => p.Id == request.EmployeeId);
            var approverKey = _people.First(p => p.Value.Id == employee.ManagerId).Key;
            Notify(approverKey, "Leave request awaiting approval", $"{employee.FullName} requested {request.TotalDays} day(s) of {request.LeaveType}.",
                NotificationType.LeaveSubmitted, nameof(LeaveRequest), request.Id, (int)(_now - request.CreatedAt).TotalHours, read: false);
        }

        foreach (var expense in expenses.Where(e => e.Status is ExpenseStatus.Approved or ExpenseStatus.Rejected or ExpenseStatus.Paid))
        {
            var who = _people.First(p => p.Value.Id == expense.EmployeeId).Key;
            var (title, type) = expense.Status switch
            {
                ExpenseStatus.Rejected => ("Expense rejected", NotificationType.ExpenseRejected),
                ExpenseStatus.Paid => ("Expense reimbursed", NotificationType.ExpensePaid),
                _ => ("Expense approved", NotificationType.ExpenseApproved)
            };
            Notify(who, title, $"Your {expense.Category} expense of {expense.Amount:N2} {expense.Currency} — {expense.Description}.", type,
                nameof(Expense), expense.Id, (int)(_now - expense.ApprovedAt!.Value).TotalHours, read: expense.Status == ExpenseStatus.Paid);
        }

        var demoKeys = new[] { "olivia", "marcus", "sophia", "daniel" };
        foreach (var announcement in announcements.Where(a => a.TargetType == AnnouncementTarget.AllEmployees))
        {
            foreach (var key in demoKeys.Where(k => _people[k].UserId != announcement.CreatedById))
            {
                Notify(key, announcement.Title, announcement.Content.Length > 140 ? announcement.Content[..137] + "..." : announcement.Content,
                    NotificationType.AnnouncementPublished, nameof(Announcement), announcement.Id,
                    (int)(_now - announcement.PublishDate).TotalHours, read: announcement.PublishDate < _now.AddDays(-7));
            }
        }

        Notify("daniel", "Task due soon", "\"Implement billing overview page\" is due in 5 days.", NotificationType.TaskDueSoon, "Task",
            tasks.First(t => t.Title == "Implement billing overview page").Id, 2, read: false);

        // Representative audit history.
        var admin = _people["marcus"];
        var superAdmin = _people["olivia"];
        var manager = _people["sophia"];
        void Audit(Employee actor, string action, string entity, string? id, object? oldValues, object? newValues, int hoursAgo) =>
            db.AuditLogs.Add(new AuditLog
            {
                UserId = actor.UserId,
                UserEmail = actor.Email,
                Action = action,
                EntityName = entity,
                EntityId = id,
                OldValues = oldValues is null ? null : JsonSerializer.Serialize(oldValues),
                NewValues = newValues is null ? null : JsonSerializer.Serialize(newValues),
                IpAddress = "10.0.0." + (10 + hoursAgo % 40),
                UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0",
                CreatedAt = _now.AddHours(-hoursAgo)
            });

        Audit(superAdmin, "Auth.Login", "User", superAdmin.UserId.ToString(), null, null, 2);
        Audit(admin, "Auth.Login", "User", admin.UserId.ToString(), null, null, 5);
        Audit(manager, "Auth.Login", "User", manager.UserId.ToString(), null, null, 8);
        Audit(admin, "Employee.Created", "Employee", _people["mia"].Id.ToString(), null,
            new { EmployeeNumber = _people["mia"].EmployeeNumber, FirstName = "Mia", LastName = "Johnson", Status = "Active" }, 24 * 90);
        Audit(admin, "Employee.Updated", "Employee", _people["noah"].Id.ToString(), new { Status = "Active" }, new { Status = "OnLeave" }, 24 * 5);
        Audit(admin, "Employee.Deactivated", "Employee", _people["chloe"].Id.ToString(), new { Status = "Active" }, new { Status = "Inactive" }, 24 * 20);
        Audit(superAdmin, "User.RolesChanged", "User", _people["grace"].UserId.ToString(), new { Roles = new[] { "Employee" } }, new { Roles = new[] { "Manager" } }, 24 * 45);
        Audit(superAdmin, "Setting.Updated", "SystemSetting", SettingKeys.MaxUploadSizeMb, new { Value = "5" }, new { Value = "10" }, 24 * 30);
        Audit(admin, "Department.Updated", "Department", _departments["FIN"].Id.ToString(), new { ManagerId = (int?)null }, new { ManagerId = _people["charlotte"].Id }, 24 * 60);
        Audit(admin, "Project.Created", "Project", (await db.Projects.FirstAsync(p => p.ProjectCode == "FIN-CLOSE", ct)).Id.ToString(), null, new { ProjectCode = "FIN-CLOSE", Status = "Planning" }, 24 * 7);

        foreach (var request in leave.Where(l => l.ApprovedById.HasValue).Take(6))
        {
            var approver = _people.Values.First(p => p.Id == request.ApprovedById);
            Audit(approver, request.Status == LeaveRequestStatus.Rejected ? "Leave.Rejected" : "Leave.Approved", nameof(LeaveRequest), request.Id.ToString(),
                new { Status = "Pending" }, new { Status = request.Status.ToString() }, (int)(_now - request.ApprovedAt!.Value).TotalHours);
        }

        foreach (var expense in expenses.Where(e => e.ApprovedById.HasValue).Take(6))
        {
            var approver = _people.Values.First(p => p.Id == expense.ApprovedById);
            Audit(approver, expense.Status == ExpenseStatus.Rejected ? "Expense.Rejected" : "Expense.Approved", nameof(Expense), expense.Id.ToString(),
                new { Status = "Submitted" }, new { Status = expense.Status == ExpenseStatus.Rejected ? "Rejected" : "Approved", expense.Amount }, (int)(_now - expense.ApprovedAt!.Value).TotalHours);
        }

        foreach (var task in tasks.Where(t => t.AssignedById.HasValue).Take(8))
        {
            var assigner = _people.Values.First(p => p.Id == task.AssignedById);
            Audit(assigner, "Task.Assigned", "Task", task.Id.ToString(), null, new { task.AssignedToId, task.Title }, (int)(_now - task.CreatedAt).TotalHours);
        }

        await db.SaveChangesAsync(ct);
    }

    private static DateOnly NextWorkingDay(DateOnly date)
    {
        while (date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
        {
            date = date.AddDays(1);
        }

        return date;
    }

    private static DateOnly AddWorkingDays(DateOnly start, int days)
    {
        var date = start;
        while (days > 0)
        {
            date = date.AddDays(1);
            if (date.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday))
            {
                days--;
            }
        }

        return date;
    }
}
