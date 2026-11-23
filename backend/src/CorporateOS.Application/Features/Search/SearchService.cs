using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Features.Documents;
using CorporateOS.Application.Features.Projects;
using CorporateOS.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Search;

public sealed record SearchResultItemDto(string Type, int Id, string Title, string? Subtitle, string Url);

public sealed record SearchResultsDto(string Query, IReadOnlyList<SearchResultItemDto> Items);

public interface ISearchService
{
    Task<SearchResultsDto> SearchAsync(string query, CancellationToken cancellationToken);
}

/// <summary>Global search across modules, honouring the same visibility rules as each module.</summary>
public sealed class SearchService(IApplicationDbContext db, ICurrentUserService currentUser, TimeProvider clock) : ISearchService
{
    private const int PerType = 5;

    public async Task<SearchResultsDto> SearchAsync(string query, CancellationToken cancellationToken)
    {
        var term = query.Trim();
        if (term.Length < 2)
        {
            return new SearchResultsDto(term, []);
        }

        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var results = new List<SearchResultItemDto>();

        if (scope.IsManagerOrAbove)
        {
            var departmentId = scope.DepartmentId ?? -1;
            results.AddRange(await db.Employees.AsNoTracking()
                .Where(e => scope.IsAdmin || e.DepartmentId == departmentId)
                .Where(e => (e.FirstName + " " + e.LastName).Contains(term) || e.Email.Contains(term) || e.EmployeeNumber.Contains(term))
                .OrderBy(e => e.FirstName).Take(PerType)
                .Select(e => new SearchResultItemDto("Employee", e.Id, e.FirstName + " " + e.LastName,
                    e.Position.Title + " · " + e.Department.Name, "/employees/" + e.Id))
                .ToListAsync(cancellationToken));
        }

        results.AddRange(await db.Projects.AsNoTracking()
            .Where(ProjectAccess.VisibleProjects(scope))
            .Where(p => p.Name.Contains(term) || p.ProjectCode.Contains(term))
            .OrderBy(p => p.Name).Take(PerType)
            .Select(p => new SearchResultItemDto("Project", p.Id, p.Name, p.ProjectCode, "/projects/" + p.Id))
            .ToListAsync(cancellationToken));

        results.AddRange(await db.Tasks.AsNoTracking()
            .Where(ProjectAccess.VisibleTasks(scope))
            .Where(t => t.Title.Contains(term))
            .OrderByDescending(t => t.CreatedAt).Take(PerType)
            .Select(t => new SearchResultItemDto("Task", t.Id, t.Title, t.Project.ProjectCode, "/tasks/" + t.Id))
            .ToListAsync(cancellationToken));

        results.AddRange(await db.Documents.AsNoTracking()
            .Where(DocumentService.VisibleTo(scope))
            .Where(d => d.Name.Contains(term) || d.OriginalFileName.Contains(term))
            .OrderBy(d => d.Name).Take(PerType)
            .Select(d => new SearchResultItemDto("Document", d.Id, d.Name, d.Category.ToString(), "/documents?search=" + d.Name))
            .ToListAsync(cancellationToken));

        var now = clock.GetUtcNow().UtcDateTime;
        var deptId = scope.DepartmentId ?? -1;
        var isManager = scope.IsManagerOrAbove;
        results.AddRange(await db.Announcements.AsNoTracking()
            .Where(a => a.PublishDate <= now && (a.ExpireDate == null || a.ExpireDate > now))
            .Where(a => scope.IsAdmin || a.TargetType == AnnouncementTarget.AllEmployees ||
                        (a.TargetType == AnnouncementTarget.SpecificDepartment && a.DepartmentId == deptId) ||
                        (a.TargetType == AnnouncementTarget.ManagersOnly && isManager))
            .Where(a => a.Title.Contains(term))
            .OrderByDescending(a => a.PublishDate).Take(PerType)
            .Select(a => new SearchResultItemDto("Announcement", a.Id, a.Title, null, "/announcements/" + a.Id))
            .ToListAsync(cancellationToken));

        return new SearchResultsDto(term, results);
    }
}
