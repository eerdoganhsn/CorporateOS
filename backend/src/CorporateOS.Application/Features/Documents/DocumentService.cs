using System.Linq.Expressions;
using CorporateOS.Application.Common.Audience;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Files;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Documents;

public sealed class DocumentQuery : PagedQuery
{
    public DocumentCategory? Category { get; set; }
    public int? DepartmentId { get; set; }
    public DocumentAccessLevel? AccessLevel { get; set; }
}

public sealed record DocumentDto(
    int Id,
    string Name,
    string? Description,
    string OriginalFileName,
    string FileType,
    long FileSize,
    DocumentCategory Category,
    int? DepartmentId,
    string? DepartmentName,
    DocumentAccessLevel AccessLevel,
    string UploadedByName,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public record DocumentMetadataRequest
{
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public DocumentCategory Category { get; init; } = DocumentCategory.General;
    public DocumentAccessLevel AccessLevel { get; init; } = DocumentAccessLevel.AllEmployees;
    public int? DepartmentId { get; init; }
}

public sealed record UploadDocumentRequest : DocumentMetadataRequest;

public sealed record UpdateDocumentRequest : DocumentMetadataRequest;

public abstract class DocumentMetadataValidator<T> : AbstractValidator<T> where T : DocumentMetadataRequest
{
    protected DocumentMetadataValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(1000);
        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.AccessLevel).IsInEnum();
        RuleFor(x => x.DepartmentId).NotNull().When(x => x.AccessLevel == DocumentAccessLevel.DepartmentOnly)
            .WithMessage(_ => Text.Get("document.departmentRequired"));
    }
}

public sealed class UploadDocumentRequestValidator : DocumentMetadataValidator<UploadDocumentRequest>;

public sealed class UpdateDocumentRequestValidator : DocumentMetadataValidator<UpdateDocumentRequest>;

public interface IDocumentService
{
    Task<PagedResult<DocumentDto>> ListAsync(DocumentQuery query, CancellationToken cancellationToken);
    Task<DocumentDto> GetAsync(int id, CancellationToken cancellationToken);
    Task<DocumentDto> UploadAsync(UploadDocumentRequest request, FileUpload file, CancellationToken cancellationToken);
    Task<DocumentDto> UpdateAsync(int id, UpdateDocumentRequest request, CancellationToken cancellationToken);
    Task<FileDownload> DownloadAsync(int id, CancellationToken cancellationToken);
    Task DeleteAsync(int id, CancellationToken cancellationToken);
}

public sealed class DocumentService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IAuditService audit,
    INotificationPublisher notifications,
    IFileUploadValidator fileValidator,
    IFileStorage storage) : IDocumentService
{
    private static readonly IReadOnlyDictionary<string, Expression<Func<Document, object?>>> Sort =
        SortMap.For<Document>(
            ("name", d => d.Name),
            ("category", d => d.Category),
            ("fileSize", d => d.FileSize),
            ("createdAt", d => d.CreatedAt));

    public async Task<PagedResult<DocumentDto>> ListAsync(DocumentQuery query, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var search = query.Search?.Trim();

        var documents = db.Documents.AsNoTracking()
            .Where(VisibleTo(scope))
            .WhereIf(query.Category.HasValue, d => d.Category == query.Category)
            .WhereIf(query.DepartmentId.HasValue, d => d.DepartmentId == query.DepartmentId)
            .WhereIf(query.AccessLevel.HasValue, d => d.AccessLevel == query.AccessLevel)
            .WhereIf(!string.IsNullOrEmpty(search), d =>
                d.Name.Contains(search!) || (d.Description != null && d.Description.Contains(search!)) || d.OriginalFileName.Contains(search!));

        return await Project(documents.ApplySort(query, Sort, "createdAt", defaultDescending: true))
            .ToPagedResultAsync(query, cancellationToken);
    }

    public async Task<DocumentDto> GetAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var dto = await Project(db.Documents.AsNoTracking().Where(d => d.Id == id).Where(VisibleTo(scope)))
            .FirstOrDefaultAsync(cancellationToken);
        if (dto is null)
        {
            throw await db.Documents.AnyAsync(d => d.Id == id, cancellationToken)
                ? new ForbiddenException(Text.Get("document.noAccess"))
                : new NotFoundException("Document", id);
        }

        return dto;
    }

    public async Task<DocumentDto> UploadAsync(UploadDocumentRequest request, FileUpload file, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        await ValidateDepartmentAsync(request, cancellationToken);
        var validated = await fileValidator.ValidateAsync(file, UploadKind.Document, cancellationToken);

        await using var stream = file.OpenReadStream();
        var path = await storage.SaveAsync(stream, "documents", validated.Extension, cancellationToken);

        var document = new Document
        {
            FilePath = path,
            OriginalFileName = validated.SafeOriginalName,
            FileType = validated.Extension.TrimStart('.').ToUpperInvariant(),
            ContentType = validated.ContentType,
            FileSize = file.Length,
            UploadedById = scope.UserId
        };
        Apply(document, request);
        db.Documents.Add(document);
        await db.SaveChangesAsync(cancellationToken);

        await NotifyAudienceAsync(document, scope.UserId, cancellationToken);
        audit.Record("Document.Uploaded", nameof(Document), document.Id.ToString(), newValues: new
        {
            document.Name, document.OriginalFileName, document.FileSize, document.Category, document.AccessLevel, document.DepartmentId
        });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(document.Id, cancellationToken);
    }

    public async Task<DocumentDto> UpdateAsync(int id, UpdateDocumentRequest request, CancellationToken cancellationToken)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id, cancellationToken)
                       ?? throw new NotFoundException("Document", id);
        await ValidateDepartmentAsync(request, cancellationToken);

        var before = new { document.Name, document.Category, document.AccessLevel, document.DepartmentId };
        Apply(document, request);
        audit.Record("Document.Updated", nameof(Document), id.ToString(), before,
            new { document.Name, document.Category, document.AccessLevel, document.DepartmentId });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<FileDownload> DownloadAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var document = await db.Documents.AsNoTracking().Where(d => d.Id == id).Where(VisibleTo(scope)).FirstOrDefaultAsync(cancellationToken);
        if (document is null)
        {
            throw await db.Documents.AnyAsync(d => d.Id == id, cancellationToken)
                ? new ForbiddenException(Text.Get("document.noAccess"))
                : new NotFoundException("Document", id);
        }

        var stream = await storage.OpenReadAsync(document.FilePath, cancellationToken)
                     ?? throw new NotFoundException(Text.Get("error.fileMissing"));

        audit.Record("Document.Downloaded", nameof(Document), id.ToString());
        await db.SaveChangesAsync(cancellationToken);
        return new FileDownload(stream, document.ContentType, document.OriginalFileName);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id, cancellationToken)
                       ?? throw new NotFoundException("Document", id);

        // Soft delete: the stored file is retained so the action can be reviewed or reversed.
        db.Documents.Remove(document);
        audit.Record("Document.Deleted", nameof(Document), id.ToString(), new { document.Name, document.OriginalFileName });
        await db.SaveChangesAsync(cancellationToken);
    }

    public static Expression<Func<Document, bool>> VisibleTo(UserScope scope)
    {
        if (scope.IsAdmin)
        {
            return _ => true;
        }

        var departmentId = scope.DepartmentId ?? -1;
        var isManager = scope.IsManager;
        return d => d.AccessLevel == DocumentAccessLevel.AllEmployees ||
                    (d.AccessLevel == DocumentAccessLevel.Managers && isManager) ||
                    (d.AccessLevel == DocumentAccessLevel.DepartmentOnly && d.DepartmentId == departmentId);
    }

    /// <summary>Targeted documents (department, managers) and company policies notify their audience.</summary>
    private async Task NotifyAudienceAsync(Document document, Guid uploaderId, CancellationToken cancellationToken)
    {
        List<Guid> audience = document.AccessLevel switch
        {
            DocumentAccessLevel.DepartmentOnly => await AudienceResolver.DepartmentUsersAsync(db, document.DepartmentId!.Value, cancellationToken),
            DocumentAccessLevel.Managers => await AudienceResolver.ManagersAndAdminsAsync(db, cancellationToken),
            DocumentAccessLevel.AllEmployees when document.Category == DocumentCategory.Policy => await AudienceResolver.AllActiveUsersAsync(db, cancellationToken),
            _ => []
        };

        await notifications.NotifyUsersAsync(audience.Where(u => u != uploaderId),
            LocalizedText.Of("notify.documentShared.title"),
            LocalizedText.Of("notify.documentShared.message", document.Name, document.Category),
            NotificationType.DocumentShared, nameof(Document), document.Id.ToString(), cancellationToken);
    }

    private async Task ValidateDepartmentAsync(DocumentMetadataRequest request, CancellationToken cancellationToken)
    {
        if (request.DepartmentId.HasValue && !await db.Departments.AnyAsync(d => d.Id == request.DepartmentId, cancellationToken))
        {
            throw new RequestValidationException("departmentId", Text.Get("error.departmentNotFound"));
        }
    }

    private static void Apply(Document document, DocumentMetadataRequest request)
    {
        document.Name = request.Name.Trim();
        document.Description = request.Description?.Trim();
        document.Category = request.Category;
        document.AccessLevel = request.AccessLevel;
        document.DepartmentId = request.DepartmentId;
    }

    private static IQueryable<DocumentDto> Project(IQueryable<Document> query) =>
        query.Select(d => new DocumentDto(
            d.Id, d.Name, d.Description, d.OriginalFileName, d.FileType, d.FileSize, d.Category, d.DepartmentId,
            d.Department != null ? d.Department.Name : null, d.AccessLevel, d.UploadedBy.DisplayName, d.CreatedAt, d.UpdatedAt));
}
