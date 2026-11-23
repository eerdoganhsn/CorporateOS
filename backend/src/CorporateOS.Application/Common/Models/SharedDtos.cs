namespace CorporateOS.Application.Common.Models;

/// <summary>Compact employee reference used inside other DTOs.</summary>
public sealed record EmployeeSummaryDto(
    int Id,
    string FullName,
    string EmployeeNumber,
    string Email,
    string? PositionTitle,
    string? AvatarUrl);

/// <summary>A single entry in an activity timeline, sourced from audit logs.</summary>
public sealed record ActivityItemDto(
    long Id,
    string Action,
    string EntityName,
    string? EntityId,
    string? UserName,
    string? Details,
    DateTime CreatedAt);
