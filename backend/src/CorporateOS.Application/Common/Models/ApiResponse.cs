namespace CorporateOS.Application.Common.Models;

/// <summary>Uniform envelope returned by every API endpoint.</summary>
public class ApiResponse<T>
{
    public bool Success { get; init; }
    public T? Data { get; init; }
    public string? Message { get; init; }
    public IDictionary<string, string[]>? Errors { get; init; }
}

public static class ApiResponse
{
    public static ApiResponse<T> Ok<T>(T data, string? message = null) =>
        new() { Success = true, Data = data, Message = message };

    public static ApiResponse<object> Ok(string? message = null) =>
        new() { Success = true, Data = null, Message = message };

    public static ApiResponse<object> Fail(string message, IDictionary<string, string[]>? errors = null) =>
        new() { Success = false, Data = null, Message = message, Errors = errors };
}
