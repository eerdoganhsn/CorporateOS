namespace CorporateOS.Domain.Exceptions;

/// <summary>
/// Raised when an operation violates a business rule (for example approving a request
/// that is no longer pending). Mapped to HTTP 422 by the API.
/// </summary>
public class DomainException(string message) : Exception(message);
