using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Exceptions;
using CorporateOS.Domain.Localization;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.API.Middleware;

/// <summary>
/// Translates exceptions into the standard <see cref="ApiResponse{T}"/> envelope with the
/// matching HTTP status. Internal details are only exposed in Development.
/// </summary>
public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger, IHostEnvironment environment)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, message, errors) = exception switch
        {
            RequestValidationException e => (StatusCodes.Status400BadRequest, e.Message, e.Errors),
            UnauthorizedException e => (StatusCodes.Status401Unauthorized, e.Message, null),
            ForbiddenException e => (StatusCodes.Status403Forbidden, e.Message, null),
            NotFoundException e => (StatusCodes.Status404NotFound, e.Message, null),
            ConflictException e => (StatusCodes.Status409Conflict, e.Message, null),
            DbUpdateConcurrencyException => (StatusCodes.Status409Conflict, Text.Get("error.concurrency"), null),
            DbUpdateException e when IsUniqueViolation(e) => (StatusCodes.Status409Conflict, Text.Get("error.uniqueViolation"), null),
            DomainException e => (StatusCodes.Status422UnprocessableEntity, e.Message, null),
            BadHttpRequestException e => (e.StatusCode, e.Message, null),
            _ => (StatusCodes.Status500InternalServerError,
                environment.IsDevelopment() ? exception.Message : Text.Get("error.unexpected"),
                (IDictionary<string, string[]>?)null)
        };

        if (status >= 500)
        {
            logger.LogError(exception, "Unhandled exception for {Method} {Path}", httpContext.Request.Method, httpContext.Request.Path);
        }
        else if (exception is DbUpdateException)
        {
            logger.LogWarning(exception, "Database constraint violation for {Path}", httpContext.Request.Path);
        }

        httpContext.Response.StatusCode = status;
        await httpContext.Response.WriteAsJsonAsync(ApiResponse.Fail(message, errors), cancellationToken);
        return true;
    }

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is SqlException { Number: 2601 or 2627 };
}
