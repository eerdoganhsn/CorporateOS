using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Constants;
using CorporateOS.Domain.Localization;

namespace CorporateOS.Application.Common.Files;

public enum UploadKind
{
    Document,
    Receipt,
    Image
}

public sealed record ValidatedUpload(string Extension, string ContentType, string SafeOriginalName);

public interface IFileUploadValidator
{
    Task<ValidatedUpload> ValidateAsync(FileUpload file, UploadKind kind, CancellationToken cancellationToken = default);
}

/// <summary>
/// Validates uploads by extension (allow-list plus hard block-list), size, and file signature
/// ("magic bytes") so a renamed executable cannot pass as a PDF or image.
/// </summary>
public sealed class FileUploadValidator(ISettingsService settings) : IFileUploadValidator
{
    private const string Field = "file";

    public async Task<ValidatedUpload> ValidateAsync(FileUpload file, UploadKind kind, CancellationToken cancellationToken = default)
    {
        if (file.Length <= 0)
        {
            throw new RequestValidationException(Field, Text.Get("file.empty"));
        }

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (string.IsNullOrEmpty(extension) || FileRules.BlockedExtensions.Contains(extension))
        {
            throw new RequestValidationException(Field, Text.Get("file.typeNotAllowed"));
        }

        var allowed = kind switch
        {
            UploadKind.Image => FileRules.ImageExtensions,
            UploadKind.Receipt => FileRules.ReceiptExtensions,
            _ => await GetConfiguredExtensionsAsync(cancellationToken)
        };

        if (!allowed.Contains(extension))
        {
            throw new RequestValidationException(Field, Text.Get("file.allowedTypes", string.Join(", ", allowed.Order())));
        }

        var maxBytes = kind == UploadKind.Image
            ? FileRules.MaxImageBytes
            : await settings.GetIntAsync(SettingKeys.MaxUploadSizeMb, cancellationToken) * 1024L * 1024L;

        if (file.Length > maxBytes)
        {
            throw new RequestValidationException(Field, Text.Get("file.tooLarge", maxBytes / (1024 * 1024)));
        }

        await using (var stream = file.OpenReadStream())
        {
            if (!await FileSignatures.MatchesAsync(stream, extension, cancellationToken))
            {
                throw new RequestValidationException(Field, Text.Get("file.signatureMismatch"));
            }
        }

        var safeName = Path.GetFileName(file.FileName);
        safeName = new string(safeName.Where(c => !char.IsControl(c) && !Path.GetInvalidFileNameChars().Contains(c)).ToArray());
        if (safeName.Length > 255)
        {
            safeName = safeName[^255..];
        }

        return new ValidatedUpload(extension, FileRules.ContentTypeFor(extension), safeName);
    }

    private async Task<IReadOnlySet<string>> GetConfiguredExtensionsAsync(CancellationToken cancellationToken)
    {
        var raw = await settings.GetAsync(SettingKeys.AllowedExtensions, cancellationToken);
        return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(e => e.StartsWith('.') ? e.ToLowerInvariant() : "." + e.ToLowerInvariant())
            .Where(e => !FileRules.BlockedExtensions.Contains(e))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}

public static class FileSignatures
{
    private static readonly byte[] Pdf = "%PDF"u8.ToArray();
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF];
    private static readonly byte[] Zip = [0x50, 0x4B, 0x03, 0x04];
    private static readonly byte[] Riff = "RIFF"u8.ToArray();

    public static async Task<bool> MatchesAsync(Stream stream, string extension, CancellationToken cancellationToken)
    {
        var header = new byte[12];
        var read = await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, cancellationToken);
        var span = header.AsSpan(0, read);

        return extension switch
        {
            ".pdf" => span.StartsWith(Pdf),
            ".png" => span.StartsWith(Png),
            ".jpg" or ".jpeg" => span.StartsWith(Jpeg),
            ".webp" => span.StartsWith(Riff) && read >= 12 && span[8..12].SequenceEqual("WEBP"u8),
            ".docx" or ".xlsx" or ".pptx" => span.StartsWith(Zip),
            // Plain-text formats have no signature; reject binary content such as an MZ executable header.
            ".txt" or ".csv" => !span.StartsWith("MZ"u8) && !span.Contains((byte)0),
            _ => true
        };
    }
}
