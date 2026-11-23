using System.Net;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Options;
using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Localization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CorporateOS.Application.Features.Auth;

public interface IAuthService
{
    Task<AuthResult> LoginAsync(LoginRequest request, CancellationToken cancellationToken);
    Task<AuthResult> RefreshAsync(string refreshToken, CancellationToken cancellationToken);
    Task LogoutAsync(string? refreshToken, CancellationToken cancellationToken);
    Task<AuthUserDto> GetCurrentUserAsync(CancellationToken cancellationToken);
    Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken cancellationToken);
    Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken cancellationToken);
    Task<AuthResult> ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken);
}

public sealed class AuthService(
    UserManager<ApplicationUser> userManager,
    IApplicationDbContext db,
    ITokenService tokenService,
    ISettingsService settings,
    ICurrentUserService currentUser,
    IAuditService audit,
    IEmailService email,
    IOptions<AppUrlOptions> urls,
    TimeProvider clock,
    ILogger<AuthService> logger) : IAuthService
{
    private static string InvalidCredentials => Text.Get("auth.invalidCredentials");
    private const string RotatedReason = "Rotated";
    private const int RotationGraceSeconds = 10;

    public async Task<AuthResult> LoginAsync(LoginRequest request, CancellationToken cancellationToken)
    {
        var now = Now;
        var user = await userManager.FindByEmailAsync(request.Email);

        if (user is null)
        {
            logger.LogWarning("Login failed: unknown account.");
            audit.Record("Auth.LoginFailed", "User", null, newValues: new { reason = "UnknownAccount" }, userEmail: request.Email);
            await db.SaveChangesAsync(cancellationToken);
            throw new UnauthorizedException(InvalidCredentials);
        }

        if (user.LockoutEnd is { } lockoutEnd && lockoutEnd.UtcDateTime > now)
        {
            logger.LogWarning("Login rejected: account {UserId} is locked.", user.Id);
            throw new UnauthorizedException(Text.Get("auth.locked", lockoutEnd.UtcDateTime));
        }

        if (!await userManager.CheckPasswordAsync(user, request.Password))
        {
            await RegisterFailedAttemptAsync(user, now, cancellationToken);
            throw new UnauthorizedException(InvalidCredentials);
        }

        if (!user.IsActive)
        {
            logger.LogWarning("Login rejected: account {UserId} is deactivated.", user.Id);
            audit.Record("Auth.LoginFailed", "User", user.Id.ToString(), newValues: new { reason = "Deactivated" }, userId: user.Id, userEmail: user.Email);
            await db.SaveChangesAsync(cancellationToken);
            throw new UnauthorizedException(Text.Get("auth.deactivated"));
        }

        user.AccessFailedCount = 0;
        user.LockoutEnd = null;
        user.LastLoginAt = now;
        audit.Record("Auth.Login", "User", user.Id.ToString(), userId: user.Id, userEmail: user.Email);

        var result = await IssueTokensAsync(user, cancellationToken);
        await userManager.UpdateAsync(user); // also flushes the refresh token and audit entry
        logger.LogInformation("User {UserId} signed in.", user.Id);
        return result;
    }

    public async Task<AuthResult> RefreshAsync(string refreshToken, CancellationToken cancellationToken)
    {
        var now = Now;
        var hash = tokenService.HashToken(refreshToken);
        var stored = await db.RefreshTokens.Include(t => t.User)
            .SingleOrDefaultAsync(t => t.TokenHash == hash, cancellationToken)
            ?? throw new UnauthorizedException(Text.Get("auth.invalidRefreshToken"));

        if (stored.RevokedAt is not null)
        {
            // Two requests racing to refresh within a few seconds is benign; reject without escalating.
            if (stored.RevokedReason == RotatedReason && stored.RevokedAt > now.AddSeconds(-RotationGraceSeconds))
            {
                throw new UnauthorizedException(Text.Get("auth.concurrentRefresh"));
            }

            // A rotated token was presented again: assume theft and end every session of this user.
            logger.LogWarning("Refresh token reuse detected for user {UserId}; revoking all sessions.", stored.UserId);
            await RevokeAllAsync(stored.UserId, "Reuse detected", cancellationToken);
            audit.Record("Auth.RefreshTokenReuse", "User", stored.UserId.ToString(), userId: stored.UserId, userEmail: stored.User.Email);
            await db.SaveChangesAsync(cancellationToken);
            throw new UnauthorizedException(Text.Get("auth.sessionInvalid"));
        }

        if (stored.ExpiresAt <= now || !stored.User.IsActive)
        {
            throw new UnauthorizedException(Text.Get("auth.sessionExpired"));
        }

        var result = await IssueTokensAsync(stored.User, cancellationToken);
        stored.Revoke(now, currentUser.IpAddress, RotatedReason, tokenService.HashToken(result.RefreshToken));
        await db.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            return;
        }

        var hash = tokenService.HashToken(refreshToken);
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        if (stored is { RevokedAt: null })
        {
            stored.Revoke(Now, currentUser.IpAddress, "Logout");
            audit.Record("Auth.Logout", "User", stored.UserId.ToString(), userId: stored.UserId);
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<AuthUserDto> GetCurrentUserAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId ?? throw new UnauthorizedException();
        var user = await userManager.FindByIdAsync(userId.ToString()) ?? throw new UnauthorizedException();
        var roles = await userManager.GetRolesAsync(user);
        return await BuildUserDtoAsync(user, roles, cancellationToken);
    }

    public async Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken cancellationToken)
    {
        var user = await userManager.FindByEmailAsync(request.Email);

        // Always behave identically so the endpoint cannot be used to discover accounts.
        if (user is null || !user.IsActive)
        {
            logger.LogInformation("Password reset requested for an unknown or inactive account.");
            return;
        }

        var token = await userManager.GeneratePasswordResetTokenAsync(user);
        var link = $"{urls.Value.FrontendUrl.TrimEnd('/')}/reset-password" +
                   $"?email={Uri.EscapeDataString(user.Email!)}&token={Uri.EscapeDataString(token)}";

        await email.SendAsync(
            user.Email!,
            Text.Get("auth.resetEmail.subject"),
            $"""
             <p>Hello {WebUtility.HtmlEncode(user.DisplayName)},</p>
             <p>We received a request to reset your password. The link below is valid for a limited time.</p>
             <p><a href="{link}">Reset password</a></p>
             <p>If you did not request this, you can ignore this email.</p>
             """,
            cancellationToken);

        audit.Record("Auth.PasswordResetRequested", "User", user.Id.ToString(), userId: user.Id, userEmail: user.Email);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken cancellationToken)
    {
        var user = await userManager.FindByEmailAsync(request.Email)
                   ?? throw new RequestValidationException("token", Text.Get("auth.resetLinkInvalid"));

        var result = await userManager.ResetPasswordAsync(user, request.Token, request.NewPassword);
        ThrowIfFailed(result, "newPassword");

        user.AccessFailedCount = 0;
        user.LockoutEnd = null;
        await RevokeAllAsync(user.Id, "Password reset", cancellationToken);
        audit.Record("Auth.PasswordReset", "User", user.Id.ToString(), userId: user.Id, userEmail: user.Email);
        await userManager.UpdateAsync(user);
    }

    public async Task<AuthResult> ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId ?? throw new UnauthorizedException();
        var user = await userManager.FindByIdAsync(userId.ToString()) ?? throw new UnauthorizedException();

        if (!await userManager.CheckPasswordAsync(user, request.CurrentPassword))
        {
            throw new RequestValidationException("currentPassword", Text.Get("auth.currentPasswordIncorrect"));
        }

        var result = await userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        ThrowIfFailed(result, "newPassword");

        // Sign out every other session and hand this one a fresh token pair.
        await RevokeAllAsync(user.Id, "Password changed", cancellationToken);
        audit.Record("Auth.PasswordChanged", "User", user.Id.ToString(), userId: user.Id, userEmail: user.Email);
        var tokens = await IssueTokensAsync(user, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return tokens;
    }

    private async Task RegisterFailedAttemptAsync(ApplicationUser user, DateTime now, CancellationToken cancellationToken)
    {
        var maxAttempts = await settings.GetIntAsync(SettingKeys.MaxFailedLoginAttempts, cancellationToken);
        var lockoutMinutes = await settings.GetIntAsync(SettingKeys.LockoutMinutes, cancellationToken);

        user.AccessFailedCount++;
        var locked = user.AccessFailedCount >= maxAttempts;
        if (locked)
        {
            user.LockoutEnd = now.AddMinutes(lockoutMinutes);
            user.AccessFailedCount = 0;
            logger.LogWarning("Account {UserId} locked for {Minutes} minutes after repeated failed sign-ins.", user.Id, lockoutMinutes);
        }

        logger.LogWarning("Login failed: wrong password for {UserId}.", user.Id);
        audit.Record(locked ? "Auth.AccountLocked" : "Auth.LoginFailed", "User", user.Id.ToString(),
            newValues: new { reason = "InvalidPassword" }, userId: user.Id, userEmail: user.Email);
        await userManager.UpdateAsync(user);
    }

    private async Task<AuthResult> IssueTokensAsync(ApplicationUser user, CancellationToken cancellationToken)
    {
        var roles = (await userManager.GetRolesAsync(user)).ToList();
        var accessMinutes = await settings.GetIntAsync(SettingKeys.AccessTokenMinutes, cancellationToken);
        var refreshDays = await settings.GetIntAsync(SettingKeys.RefreshTokenDays, cancellationToken);

        var accessToken = tokenService.CreateAccessToken(user, roles, accessMinutes);
        var refreshToken = tokenService.GenerateRefreshToken();
        var refreshExpires = Now.AddDays(refreshDays);

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = tokenService.HashToken(refreshToken),
            ExpiresAt = refreshExpires,
            CreatedAt = Now,
            CreatedByIp = currentUser.IpAddress
        });

        var dto = await BuildUserDtoAsync(user, roles, cancellationToken);
        return new AuthResult(new AuthResponse(accessToken.Token, accessToken.ExpiresAt, dto), refreshToken, refreshExpires);
    }

    private async Task<AuthUserDto> BuildUserDtoAsync(ApplicationUser user, IList<string> roles, CancellationToken cancellationToken)
    {
        var employee = await db.Employees.AsNoTracking()
            .Where(e => e.UserId == user.Id)
            .Select(e => new { e.Id, e.DepartmentId, DepartmentName = e.Department.Name, PositionTitle = e.Position.Title, e.ProfileImagePath })
            .FirstOrDefaultAsync(cancellationToken);

        var orderedRoles = Roles.All.Where(roles.Contains).ToList();
        return new AuthUserDto(
            user.Id,
            user.Email!,
            user.DisplayName,
            orderedRoles,
            orderedRoles.FirstOrDefault() ?? Roles.Employee,
            employee?.Id,
            employee?.DepartmentId,
            employee?.DepartmentName,
            employee?.PositionTitle,
            MediaUrls.Avatar(employee?.ProfileImagePath),
            Languages.Normalize(user.PreferredLanguage));
    }

    private async Task RevokeAllAsync(Guid userId, string reason, CancellationToken cancellationToken)
    {
        var now = Now;
        var active = await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null && t.ExpiresAt > now)
            .ToListAsync(cancellationToken);
        foreach (var token in active)
        {
            token.Revoke(now, currentUser.IpAddress, reason);
        }
    }

    private static void ThrowIfFailed(IdentityResult result, string field)
    {
        if (!result.Succeeded)
        {
            var messages = result.Errors.Select(e => e.Code == "InvalidToken" ? Text.Get("auth.resetLinkInvalid") : e.Description).ToArray();
            throw new RequestValidationException(new Dictionary<string, string[]> { [field] = messages });
        }
    }

    private DateTime Now => clock.GetUtcNow().UtcDateTime;
}
