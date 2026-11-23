using CorporateOS.Application.Common.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CorporateOS.API.Controllers;

[ApiController]
[Authorize]
[Produces("application/json")]
[ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
[ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
public abstract class ApiControllerBase : ControllerBase
{
    protected ActionResult<ApiResponse<T>> OkResponse<T>(T data, string? message = null) =>
        Ok(ApiResponse.Ok(data, message));

    protected ActionResult<ApiResponse<T>> CreatedResponse<T>(string actionName, object routeValues, T data) =>
        CreatedAtAction(actionName, routeValues, ApiResponse.Ok(data));

    protected ActionResult<ApiResponse<object>> OkMessage(string message) =>
        Ok(ApiResponse.Ok(message));

    protected static FileUpload ToUpload(IFormFile file) =>
        new(file.FileName, file.ContentType, file.Length, file.OpenReadStream);

    protected FileStreamResult FileResult(Stream stream, string contentType, string fileName) =>
        File(stream, contentType, fileName);
}
