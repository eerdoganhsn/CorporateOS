using CorporateOS.Domain.Localization;
namespace CorporateOS.Application.Common.Exceptions;

/// <summary>HTTP 404.</summary>
public class NotFoundException(string message) : Exception(message)
{
    /// <param name="entityName">Entity type name; translated through the <c>entity.&lt;Name&gt;</c> catalog key.</param>
    public NotFoundException(string entityName, object key)
        : this(Text.Get("error.notFound", Text.Get("entity." + entityName), key)) { }
}

/// <summary>HTTP 403. The caller is authenticated but not allowed to perform the action.</summary>
public class ForbiddenException(string? message = null)
    : Exception(message ?? Text.Get("error.forbidden"));

/// <summary>HTTP 401.</summary>
public class UnauthorizedException(string? message = null) : Exception(message ?? Text.Get("error.unauthorized"));

/// <summary>HTTP 409. Typically a uniqueness violation.</summary>
public class ConflictException(string message) : Exception(message);

/// <summary>HTTP 400 with per-field error messages.</summary>
public class RequestValidationException(IDictionary<string, string[]> errors)
    : Exception(Text.Get("error.validationFailed"))
{
    public IDictionary<string, string[]> Errors { get; } = errors;

    public RequestValidationException(string field, string error)
        : this(new Dictionary<string, string[]> { [field] = [error] }) { }
}
