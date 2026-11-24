using CorporateOS.API.Authorization;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Features.Auth;
using CorporateOS.Application.Features.Dashboard;
using CorporateOS.Application.Features.Notifications;
using CorporateOS.Application.Features.Profile;
using CorporateOS.Application.Features.Search;
using CorporateOS.Application.Features.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CorporateOS.Domain.Localization;

namespace CorporateOS.API.Controllers;

[Route("api/notifications")]
public sealed class NotificationsController(INotificationService notifications) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<NotificationDto>>>> List([FromQuery] NotificationQuery query, CancellationToken ct) =>
        OkResponse(await notifications.ListAsync(query, ct));

    [HttpGet("unread-count")]
    public async Task<ActionResult<ApiResponse<UnreadCountDto>>> UnreadCount(CancellationToken ct) =>
        OkResponse(await notifications.GetUnreadCountAsync(ct));

    [HttpPatch("{id:long}/read")]
    public async Task<ActionResult<ApiResponse<object>>> MarkRead(long id, CancellationToken ct)
    {
        await notifications.MarkReadAsync(id, ct);
        return OkMessage(Text.Get("success.notificationRead"));
    }

    [HttpPatch("read-all")]
    public async Task<ActionResult<ApiResponse<int>>> MarkAllRead(CancellationToken ct) =>
        OkResponse(await notifications.MarkAllReadAsync(ct), Text.Get("success.allNotificationsRead"));
}

[Route("api/dashboard")]
public sealed class DashboardController(IDashboardService dashboard) : ApiControllerBase
{
    [HttpGet("admin")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<AdminDashboardDto>>> Admin(CancellationToken ct) =>
        OkResponse(await dashboard.GetAdminAsync(ct));

    [HttpGet("manager")]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<ManagerDashboardDto>>> Manager(CancellationToken ct) =>
        OkResponse(await dashboard.GetManagerAsync(ct));

    [HttpGet("employee")]
    public async Task<ActionResult<ApiResponse<EmployeeDashboardDto>>> Employee(CancellationToken ct) =>
        OkResponse(await dashboard.GetEmployeeAsync(ct));
}

[Route("api/profile")]
public sealed class ProfileController(IProfileService profile) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<ProfileDto>>> Get(CancellationToken ct) =>
        OkResponse(await profile.GetAsync(ct));

    /// <summary>Updates the fields employees may maintain themselves (contact and emergency details).</summary>
    [HttpPut]
    public async Task<ActionResult<ApiResponse<ProfileDto>>> Update(UpdateProfileRequest request, CancellationToken ct) =>
        OkResponse(await profile.UpdateAsync(request, ct));

    [HttpPost("avatar")]
    [RequestSizeLimit(3 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<string>>> UploadAvatar(IFormFile file, CancellationToken ct) =>
        OkResponse(await profile.UploadAvatarAsync(ToUpload(file), ct));

    /// <summary>Saves the preferred language (tr, en or de) used for the UI, e-mails and notifications.</summary>
    [HttpPut("language")]
    public async Task<ActionResult<ApiResponse<AuthUserDto>>> UpdateLanguage(UpdateLanguageRequest request, CancellationToken ct) =>
        OkResponse(await profile.UpdateLanguageAsync(request, ct));
}

[Route("api/search")]
public sealed class SearchController(ISearchService search) : ApiControllerBase
{
    /// <summary>Searches employees, projects, tasks, documents and announcements visible to the caller.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<SearchResultsDto>>> Search([FromQuery] string q, CancellationToken ct) =>
        OkResponse(await search.SearchAsync(q ?? string.Empty, ct));
}

[Route("api/settings")]
public sealed class PublicSettingsController(ISettingsAdminService settings) : ApiControllerBase
{
    /// <summary>Company branding and client-relevant limits. Available before sign-in.</summary>
    [AllowAnonymous]
    [HttpGet("public")]
    public async Task<ActionResult<ApiResponse<PublicSettingsDto>>> Public(CancellationToken ct) =>
        OkResponse(await settings.GetPublicAsync(ct));

    [AllowAnonymous]
    [HttpGet("logo")]
    [ResponseCache(Duration = 300)]
    public async Task<IActionResult> Logo(CancellationToken ct)
    {
        var logo = await settings.GetLogoAsync(ct);
        return logo is null ? NotFound() : File(logo.Content, logo.ContentType);
    }
}
