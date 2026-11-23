using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.API.Services;

public sealed class CurrentUserService(IHttpContextAccessor accessor, IServiceProvider services) : ICurrentUserService
{
    private UserScope? _scope;

    private HttpContext? Context => accessor.HttpContext;

    public Guid? UserId =>
        Guid.TryParse(Context?.User.FindFirst(AppClaimTypes.UserId)?.Value, out var id) ? id : null;

    public string? Email => Context?.User.FindFirst(AppClaimTypes.Email)?.Value;

    public bool IsAuthenticated => Context?.User.Identity?.IsAuthenticated == true;

    public string? IpAddress => Context?.Connection.RemoteIpAddress?.ToString();

    public string? UserAgent => Context?.Request.Headers.UserAgent.ToString();

    public async Task<UserScope> GetScopeAsync(CancellationToken cancellationToken = default)
    {
        if (_scope is not null)
        {
            return _scope;
        }

        var userId = UserId ?? throw new UnauthorizedException();
        var principal = Context!.User;

        // Resolved lazily: the DbContext's interceptor depends on this service.
        var db = services.GetRequiredService<IApplicationDbContext>();
        var employee = await db.Employees.AsNoTracking()
            .Where(e => e.UserId == userId)
            .Select(e => new { e.Id, e.DepartmentId })
            .FirstOrDefaultAsync(cancellationToken);

        var roles = principal.FindAll(AppClaimTypes.Role).Select(c => c.Value).ToHashSet(StringComparer.Ordinal);

        _scope = new UserScope(
            userId,
            Email ?? string.Empty,
            principal.FindFirst(AppClaimTypes.DisplayName)?.Value ?? string.Empty,
            roles,
            employee?.Id,
            employee?.DepartmentId);
        return _scope;
    }
}
