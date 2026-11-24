using CorporateOS.API.Authorization;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Features.AuditLogs;
using CorporateOS.Application.Features.Reports;
using CorporateOS.Application.Features.Settings;
using CorporateOS.Application.Features.Users;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CorporateOS.Domain.Localization;

namespace CorporateOS.API.Controllers;

[Route("api/admin/users")]
[Authorize(Policy = Policies.AdminOrAbove)]
public sealed class AdminUsersController(IUserAdminService users) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<UserListItemDto>>>> List([FromQuery] UserQuery query, CancellationToken ct) =>
        OkResponse(await users.ListAsync(query, ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<UserListItemDto>>> Get(Guid id, CancellationToken ct) =>
        OkResponse(await users.GetAsync(id, ct));

    [HttpPost("{id:guid}/activate")]
    public async Task<ActionResult<ApiResponse<UserListItemDto>>> Activate(Guid id, CancellationToken ct) =>
        OkResponse(await users.SetActiveAsync(id, true, ct));

    [HttpPost("{id:guid}/deactivate")]
    public async Task<ActionResult<ApiResponse<UserListItemDto>>> Deactivate(Guid id, CancellationToken ct) =>
        OkResponse(await users.SetActiveAsync(id, false, ct));

    /// <summary>Locks the account (omit minutes for an indefinite lock) and ends its sessions.</summary>
    [HttpPost("{id:guid}/lock")]
    public async Task<ActionResult<ApiResponse<UserListItemDto>>> Lock(Guid id, LockUserRequest request, CancellationToken ct) =>
        OkResponse(await users.LockAsync(id, request.Minutes, ct));

    [HttpPost("{id:guid}/unlock")]
    public async Task<ActionResult<ApiResponse<UserListItemDto>>> Unlock(Guid id, CancellationToken ct) =>
        OkResponse(await users.UnlockAsync(id, ct));

    [HttpPost("{id:guid}/reset-password")]
    public async Task<ActionResult<ApiResponse<object>>> ResetPassword(Guid id, AdminResetPasswordRequest request, CancellationToken ct)
    {
        await users.ResetPasswordAsync(id, request, ct);
        return OkMessage(Text.Get("success.passwordResetByAdmin"));
    }

    /// <summary>Replaces the user's roles. Granting or revoking Admin/SuperAdmin requires SuperAdmin.</summary>
    [HttpPut("{id:guid}/roles")]
    public async Task<ActionResult<ApiResponse<UserListItemDto>>> AssignRoles(Guid id, AssignRolesRequest request, CancellationToken ct) =>
        OkResponse(await users.AssignRolesAsync(id, request, ct));

    [HttpGet("{id:guid}/activity")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ActivityItemDto>>>> Activity(Guid id, CancellationToken ct) =>
        OkResponse(await users.GetActivityAsync(id, ct));
}

[Route("api/admin/roles")]
[Authorize(Policy = Policies.AdminOrAbove)]
public sealed class AdminRolesController(IUserAdminService users) : ApiControllerBase
{
    /// <summary>Roles with member counts and the permission matrix enforced by the API.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<RolesOverviewDto>>> Get(CancellationToken ct) =>
        OkResponse(await users.GetRolesAsync(ct));
}

[Route("api/admin/audit-logs")]
[Authorize(Policy = Policies.AdminOrAbove)]
public sealed class AdminAuditLogsController(IAuditLogService auditLogs, IExportService export) : ApiControllerBase
{
    /// <summary>Read-only audit trail. Security events are visible to SuperAdmins only.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<AuditLogDto>>>> List([FromQuery] AuditLogQuery query, CancellationToken ct) =>
        OkResponse(await auditLogs.ListAsync(query, ct));

    [HttpGet("filters")]
    public async Task<ActionResult<ApiResponse<AuditLogFiltersDto>>> Filters(CancellationToken ct) =>
        OkResponse(await auditLogs.GetFiltersAsync(ct));

    [HttpGet("export")]
    [Produces("text/csv")]
    public async Task<IActionResult> Export([FromQuery] AuditLogQuery query, CancellationToken ct)
    {
        var file = export.ToCsv(await auditLogs.ExportAsync(query, ct));
        return File(file.Content, file.ContentType, file.FileName);
    }
}

[Route("api/admin/settings")]
[Authorize(Policy = Policies.AdminOrAbove)]
public sealed class AdminSettingsController(ISettingsAdminService settings) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<SettingDto>>>> Get(CancellationToken ct) =>
        OkResponse(await settings.GetAllAsync(ct));

    /// <summary>Updates settings. Leave, file and security settings require SuperAdmin.</summary>
    [HttpPut]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<SettingDto>>>> Update(UpdateSettingsRequest request, CancellationToken ct) =>
        OkResponse(await settings.UpdateAsync(request, ct), Text.Get("success.settingsSaved"));

    [HttpPost("logo")]
    [RequestSizeLimit(3 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<object>>> UploadLogo(IFormFile file, CancellationToken ct)
    {
        await settings.UploadLogoAsync(ToUpload(file), ct);
        return OkMessage(Text.Get("success.logoUpdated"));
    }
}

[Route("api/reports")]
[Authorize(Policy = Policies.ManagerOrAbove)]
public sealed class ReportsController(IReportService reports, IExportService export) : ApiControllerBase
{
    /// <summary>Employee report. Add format=Csv or format=Xlsx to download.</summary>
    [HttpGet("employees")]
    public Task<IActionResult> Employees([FromQuery] ReportFilter filter, CancellationToken ct) => Run(ReportType.Employees, filter, ct);

    [HttpGet("departments")]
    public Task<IActionResult> Departments([FromQuery] ReportFilter filter, CancellationToken ct) => Run(ReportType.Departments, filter, ct);

    [HttpGet("projects")]
    public Task<IActionResult> Projects([FromQuery] ReportFilter filter, CancellationToken ct) => Run(ReportType.Projects, filter, ct);

    [HttpGet("tasks")]
    public Task<IActionResult> Tasks([FromQuery] ReportFilter filter, CancellationToken ct) => Run(ReportType.Tasks, filter, ct);

    [HttpGet("leave")]
    public Task<IActionResult> Leave([FromQuery] ReportFilter filter, CancellationToken ct) => Run(ReportType.Leave, filter, ct);

    [HttpGet("expenses")]
    public Task<IActionResult> Expenses([FromQuery] ReportFilter filter, CancellationToken ct) => Run(ReportType.Expenses, filter, ct);

    private async Task<IActionResult> Run(ReportType type, ReportFilter filter, CancellationToken ct)
    {
        var result = await reports.GenerateAsync(type, filter, ct);
        if (filter.Format == ReportFormat.Json)
        {
            return Ok(ApiResponse.Ok(result));
        }

        var table = reports.ToTable(result);
        var file = filter.Format == ReportFormat.Xlsx ? export.ToExcel(table) : export.ToCsv(table);
        return File(file.Content, file.ContentType, file.FileName);
    }
}
