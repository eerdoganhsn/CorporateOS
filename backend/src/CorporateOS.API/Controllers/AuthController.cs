using CorporateOS.API.Configuration;
using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Features.Auth;
using CorporateOS.Domain.Localization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace CorporateOS.API.Controllers;

/// <summary>
/// Sign-in, token refresh and password flows. The access token is returned in the body;
/// the refresh token is set as an HttpOnly, SameSite=Strict cookie scoped to /api/auth.
/// </summary>
[Route("api/auth")]
public sealed class AuthController(IAuthService authService, IOptions<AuthCookieOptions> cookieOptions) : ApiControllerBase
{
    /// <summary>Signs in with email and password.</summary>
    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var result = await authService.LoginAsync(request, cancellationToken);
        SetRefreshCookie(result);
        return OkResponse(result.Response);
    }

    /// <summary>Exchanges the refresh-token cookie for a new access token (rotating the refresh token).</summary>
    [AllowAnonymous]
    [HttpPost("refresh")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> Refresh(CancellationToken cancellationToken)
    {
        var token = Request.Cookies[cookieOptions.Value.Name];
        if (string.IsNullOrEmpty(token))
        {
            throw new UnauthorizedException(Text.Get("auth.noSession"));
        }

        try
        {
            var result = await authService.RefreshAsync(token, cancellationToken);
            SetRefreshCookie(result);
            return OkResponse(result.Response);
        }
        catch (UnauthorizedException)
        {
            ClearRefreshCookie();
            throw;
        }
    }

    /// <summary>Revokes the current refresh token and clears the cookie.</summary>
    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<ActionResult<ApiResponse<object>>> Logout(CancellationToken cancellationToken)
    {
        await authService.LogoutAsync(Request.Cookies[cookieOptions.Value.Name], cancellationToken);
        ClearRefreshCookie();
        return OkMessage("Signed out.");
    }

    /// <summary>Returns the signed-in user, roles and linked employee profile.</summary>
    [HttpGet("me")]
    public async Task<ActionResult<ApiResponse<AuthUserDto>>> Me(CancellationToken cancellationToken) =>
        OkResponse(await authService.GetCurrentUserAsync(cancellationToken));

    /// <summary>Sends a password reset link if the account exists. Always returns success.</summary>
    [AllowAnonymous]
    [HttpPost("forgot-password")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<ActionResult<ApiResponse<object>>> ForgotPassword(ForgotPasswordRequest request, CancellationToken cancellationToken)
    {
        await authService.ForgotPasswordAsync(request, cancellationToken);
        return OkMessage("If an account exists for that email, a reset link has been sent.");
    }

    /// <summary>Completes a password reset using the emailed token.</summary>
    [AllowAnonymous]
    [HttpPost("reset-password")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<ActionResult<ApiResponse<object>>> ResetPassword(ResetPasswordRequest request, CancellationToken cancellationToken)
    {
        await authService.ResetPasswordAsync(request, cancellationToken);
        return OkMessage("Your password has been reset. You can now sign in.");
    }

    /// <summary>Changes the signed-in user's password and signs out other sessions.</summary>
    [HttpPost("change-password")]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> ChangePassword(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        var result = await authService.ChangePasswordAsync(request, cancellationToken);
        SetRefreshCookie(result);
        return OkResponse(result.Response, "Password changed.");
    }

    private void SetRefreshCookie(AuthResult result)
    {
        var options = cookieOptions.Value;
        Response.Cookies.Append(options.Name, result.RefreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = options.Secure,
            SameSite = SameSiteMode.Strict,
            Path = options.Path,
            Expires = result.RefreshTokenExpiresAt,
            IsEssential = true
        });
    }

    private void ClearRefreshCookie()
    {
        var options = cookieOptions.Value;
        Response.Cookies.Delete(options.Name, new CookieOptions
        {
            HttpOnly = true,
            Secure = options.Secure,
            SameSite = SameSiteMode.Strict,
            Path = options.Path
        });
    }
}
