using CorporateOS.API.Authorization;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Features.Announcements;
using CorporateOS.Application.Features.Documents;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CorporateOS.API.Controllers;

[Route("api/announcements")]
public sealed class AnnouncementsController(IAnnouncementService announcements) : ApiControllerBase
{
    /// <summary>Published, unexpired announcements targeted at the caller (pinned first).</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<AnnouncementDto>>>> List([FromQuery] AnnouncementQuery query, CancellationToken ct) =>
        OkResponse(await announcements.ListAsync(query, ct));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<AnnouncementDto>>> Get(int id, CancellationToken ct) =>
        OkResponse(await announcements.GetAsync(id, ct));

    /// <summary>Creates an announcement. Audience notifications go out immediately or at the publish date.</summary>
    [HttpPost]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<AnnouncementDto>>> Create(SaveAnnouncementRequest request, CancellationToken ct)
    {
        var created = await announcements.CreateAsync(request, ct);
        return CreatedResponse(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<AnnouncementDto>>> Update(int id, SaveAnnouncementRequest request, CancellationToken ct) =>
        OkResponse(await announcements.UpdateAsync(id, request, ct));

    [HttpPatch("{id:int}/pin")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<AnnouncementDto>>> Pin(int id, PinAnnouncementRequest request, CancellationToken ct) =>
        OkResponse(await announcements.SetPinnedAsync(id, request.IsPinned, ct));

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await announcements.DeleteAsync(id, ct);
        return NoContent();
    }
}

[Route("api/documents")]
public sealed class DocumentsController(IDocumentService documents) : ApiControllerBase
{
    /// <summary>Documents the caller may access, filtered by search, category and department.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<DocumentDto>>>> List([FromQuery] DocumentQuery query, CancellationToken ct) =>
        OkResponse(await documents.ListAsync(query, ct));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<DocumentDto>>> Get(int id, CancellationToken ct) =>
        OkResponse(await documents.GetAsync(id, ct));

    /// <summary>Uploads a document (multipart form). Extension, size and file signature are validated.</summary>
    [HttpPost("upload")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    [RequestSizeLimit(55 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<DocumentDto>>> Upload([FromForm] UploadDocumentRequest request, IFormFile file, CancellationToken ct)
    {
        var created = await documents.UploadAsync(request, ToUpload(file), ct);
        return CreatedResponse(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<DocumentDto>>> Update(int id, UpdateDocumentRequest request, CancellationToken ct) =>
        OkResponse(await documents.UpdateAsync(id, request, ct));

    [HttpGet("{id:int}/download")]
    [Produces("application/octet-stream")]
    public async Task<IActionResult> Download(int id, CancellationToken ct)
    {
        var file = await documents.DownloadAsync(id, ct);
        return FileResult(file.Content, file.ContentType, file.FileName);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await documents.DeleteAsync(id, ct);
        return NoContent();
    }
}
