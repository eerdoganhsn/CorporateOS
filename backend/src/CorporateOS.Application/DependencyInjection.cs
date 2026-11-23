using CorporateOS.Application.Common.Files;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Mapping;
using CorporateOS.Application.Features.Announcements;
using CorporateOS.Application.Features.AuditLogs;
using CorporateOS.Application.Features.Auth;
using CorporateOS.Application.Features.Dashboard;
using CorporateOS.Application.Features.Departments;
using CorporateOS.Application.Features.Documents;
using CorporateOS.Application.Features.Employees;
using CorporateOS.Application.Features.Expenses;
using CorporateOS.Application.Features.Leave;
using CorporateOS.Application.Features.Lookups;
using CorporateOS.Application.Features.Notifications;
using CorporateOS.Application.Features.Positions;
using CorporateOS.Application.Features.Profile;
using CorporateOS.Application.Features.Projects;
using CorporateOS.Application.Features.Reports;
using CorporateOS.Application.Features.Search;
using CorporateOS.Application.Features.Settings;
using CorporateOS.Application.Features.Tasks;
using CorporateOS.Application.Features.Users;
using FluentValidation;
using Mapster;
using Microsoft.Extensions.DependencyInjection;

namespace CorporateOS.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly, includeInternalTypes: true);
        MappingConfig.Register(TypeAdapterConfig.GlobalSettings);

        services.AddScoped<INotificationPublisher, NotificationPublisher>();
        services.AddScoped<IFileUploadValidator, FileUploadValidator>();

        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IProfileService, ProfileService>();
        services.AddScoped<ILookupService, LookupService>();
        services.AddScoped<ISearchService, SearchService>();
        services.AddScoped<IDashboardService, DashboardService>();

        services.AddScoped<IDepartmentService, DepartmentService>();
        services.AddScoped<IPositionService, PositionService>();
        services.AddScoped<IEmployeeService, EmployeeService>();
        services.AddScoped<IProjectService, ProjectService>();
        services.AddScoped<ITaskService, TaskService>();
        services.AddScoped<ILeaveService, LeaveService>();
        services.AddScoped<IExpenseService, ExpenseService>();
        services.AddScoped<IAnnouncementService, AnnouncementService>();
        services.AddScoped<IDocumentService, DocumentService>();
        services.AddScoped<INotificationService, NotificationService>();

        services.AddScoped<IUserAdminService, UserAdminService>();
        services.AddScoped<IAuditLogService, AuditLogService>();
        services.AddScoped<ISettingsAdminService, SettingsAdminService>();
        services.AddScoped<IReportService, ReportService>();

        return services;
    }
}
