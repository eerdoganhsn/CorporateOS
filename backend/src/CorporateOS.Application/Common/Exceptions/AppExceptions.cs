namespace CorporateOS.Application.Common.Exceptions;

/// <summary>HTTP 404.</summary>
public class NotFoundException(string message) : Exception(message)
{
    public NotFoundException(string entityName, object key)
        : this($"{entityName} '{key}' was not found.") { }
}

/// <summary>HTTP 403. The caller is authenticated but not allowed to perform the action.</summary>
public class ForbiddenException(string message = "You do not have permission to perform this action.")
    : Exception(message);

/// <summary>HTTP 401.</summary>
public class UnauthorizedException(string message = "Authentication is required.") : Exception(message);

/// <summary>HTTP 409. Typically a uniqueness violation.</summary>
public class ConflictException(string message) : Exception(message);

/// <summary>HTTP 400 with per-field error messages.</summary>
public class RequestValidationException(IDictionary<string, string[]> errors)
    : Exception("Validation failed")
{
    public IDictionary<string, string[]> Errors { get; } = errors;

    public RequestValidationException(string field, string error)
        : this(new Dictionary<string, string[]> { [field] = [error] }) { }
}
