using CorporateOS.Domain.Localization;
using Microsoft.AspNetCore.Identity;

namespace CorporateOS.Infrastructure.Identity;

/// <summary>Identity error messages in the language of the current request.</summary>
public sealed class LocalizedIdentityErrorDescriber : IdentityErrorDescriber
{
    public override IdentityError DefaultError() => Error(nameof(DefaultError), "identity.generic");

    public override IdentityError PasswordMismatch() => Error(nameof(PasswordMismatch), "password.mismatch");

    public override IdentityError DuplicateEmail(string email) => Error(nameof(DuplicateEmail), "identity.duplicateEmail", email);

    public override IdentityError DuplicateUserName(string userName) => Error(nameof(DuplicateUserName), "identity.duplicateUserName", userName);

    public override IdentityError InvalidEmail(string? email) => Error(nameof(InvalidEmail), "identity.invalidEmail", email);

    public override IdentityError PasswordTooShort(int length) => Error(nameof(PasswordTooShort), "password.tooShort", length);

    public override IdentityError PasswordRequiresDigit() => Error(nameof(PasswordRequiresDigit), "password.requiresDigit");

    public override IdentityError PasswordRequiresUpper() => Error(nameof(PasswordRequiresUpper), "password.requiresUpper");

    public override IdentityError PasswordRequiresLower() => Error(nameof(PasswordRequiresLower), "password.requiresLower");

    public override IdentityError PasswordRequiresNonAlphanumeric() =>
        Error(nameof(PasswordRequiresNonAlphanumeric), "password.requiresSymbol");

    private static IdentityError Error(string code, string key, params object?[] args) =>
        new() { Code = code, Description = Text.Get(key, args) };
}
