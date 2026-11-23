using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using FluentValidation;
using Mapster;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Positions;

public sealed class PositionQuery : PagedQuery
{
    public int? DepartmentId { get; set; }
    public RecordStatus? Status { get; set; }
    public PositionLevel? Level { get; set; }
}

/// <summary>Mapped with Mapster (see MappingConfig).</summary>
public sealed class PositionDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Description { get; init; }
    public int? DepartmentId { get; init; }
    public string? DepartmentName { get; init; }
    public PositionLevel Level { get; init; }
    public RecordStatus Status { get; init; }
    public int EmployeeCount { get; init; }
}

public sealed record SavePositionRequest(string Title, string? Description, int? DepartmentId, PositionLevel Level, RecordStatus Status);

public sealed class SavePositionRequestValidator : AbstractValidator<SavePositionRequest>
{
    public SavePositionRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Description).MaximumLength(1000);
        RuleFor(x => x.Level).IsInEnum();
        RuleFor(x => x.Status).IsInEnum();
    }
}

public interface IPositionService
{
    Task<PagedResult<PositionDto>> ListAsync(PositionQuery query, CancellationToken cancellationToken);
    Task<PositionDto> CreateAsync(SavePositionRequest request, CancellationToken cancellationToken);
    Task<PositionDto> UpdateAsync(int id, SavePositionRequest request, CancellationToken cancellationToken);
    Task DeleteAsync(int id, CancellationToken cancellationToken);
}

public sealed class PositionService(IApplicationDbContext db, IAuditService audit) : IPositionService
{
    private static readonly IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<PositionDto, object?>>> Sort =
        SortMap.For<PositionDto>(
            ("title", p => p.Title),
            ("level", p => p.Level),
            ("department", p => p.DepartmentName),
            ("employeeCount", p => p.EmployeeCount));

    public Task<PagedResult<PositionDto>> ListAsync(PositionQuery query, CancellationToken cancellationToken) =>
        db.Positions.AsNoTracking()
            .WhereIf(query.DepartmentId.HasValue, p => p.DepartmentId == query.DepartmentId)
            .WhereIf(query.Status.HasValue, p => p.Status == query.Status)
            .WhereIf(query.Level.HasValue, p => p.Level == query.Level)
            .WhereIf(!string.IsNullOrWhiteSpace(query.Search), p => p.Title.Contains(query.Search!))
            .ProjectToType<PositionDto>()
            .ApplySort(query, Sort, "title")
            .ToPagedResultAsync(query, cancellationToken);

    public async Task<PositionDto> CreateAsync(SavePositionRequest request, CancellationToken cancellationToken)
    {
        await ValidateAsync(request, null, cancellationToken);
        var position = new Position();
        Apply(position, request);
        db.Positions.Add(position);
        await db.SaveChangesAsync(cancellationToken);

        audit.Record("Position.Created", nameof(Position), position.Id.ToString(), newValues: request);
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(position.Id, cancellationToken);
    }

    public async Task<PositionDto> UpdateAsync(int id, SavePositionRequest request, CancellationToken cancellationToken)
    {
        var position = await db.Positions.FirstOrDefaultAsync(p => p.Id == id, cancellationToken)
                       ?? throw new NotFoundException("Position", id);
        await ValidateAsync(request, id, cancellationToken);

        var before = new SavePositionRequest(position.Title, position.Description, position.DepartmentId, position.Level, position.Status);
        Apply(position, request);
        audit.Record("Position.Updated", nameof(Position), id.ToString(), before, request);
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken)
    {
        var position = await db.Positions.FirstOrDefaultAsync(p => p.Id == id, cancellationToken)
                       ?? throw new NotFoundException("Position", id);
        if (await db.Employees.IgnoreQueryFilters().AnyAsync(e => e.PositionId == id, cancellationToken))
        {
            throw new ConflictException(Text.Get("position.inUse"));
        }

        db.Positions.Remove(position);
        audit.Record("Position.Deleted", nameof(Position), id.ToString(), new { position.Title });
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<PositionDto> GetAsync(int id, CancellationToken cancellationToken) =>
        await db.Positions.AsNoTracking().Where(p => p.Id == id).ProjectToType<PositionDto>().FirstAsync(cancellationToken);

    private async Task ValidateAsync(SavePositionRequest request, int? excludeId, CancellationToken cancellationToken)
    {
        if (request.DepartmentId.HasValue && !await db.Departments.AnyAsync(d => d.Id == request.DepartmentId, cancellationToken))
        {
            throw new RequestValidationException("departmentId", Text.Get("error.departmentNotFound"));
        }

        var title = request.Title.Trim();
        if (await db.Positions.AnyAsync(p => p.Title == title && p.DepartmentId == request.DepartmentId && p.Id != excludeId, cancellationToken))
        {
            throw new ConflictException(Text.Get("position.titleInUse", title));
        }
    }

    private static void Apply(Position position, SavePositionRequest request)
    {
        position.Title = request.Title.Trim();
        position.Description = request.Description?.Trim();
        position.DepartmentId = request.DepartmentId;
        position.Level = request.Level;
        position.Status = request.Status;
    }
}
