using System.Text;
using CorporateOS.Application.Common.Files;
using FluentAssertions;

namespace CorporateOS.UnitTests.Files;

public class FileSignaturesTests
{
    private static readonly byte[] PdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\n%âãÏÓ\n");
    private static readonly byte[] PngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D];
    private static readonly byte[] JpegBytes = [0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1];
    private static readonly byte[] ZipBytes = [0x50, 0x4B, 0x03, 0x04, 0x14, 0, 0, 0, 8, 0, 0, 0];
    private static readonly byte[] WebpBytes = [.. "RIFF"u8, 0x24, 0, 0, 0, .. "WEBP"u8];
    private static readonly byte[] ExeBytes = [0x4D, 0x5A, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0];

    private static Task<bool> Matches(byte[] content, string extension) =>
        FileSignatures.MatchesAsync(new MemoryStream(content), extension, CancellationToken.None);

    [Theory]
    [InlineData(".pdf")]
    [InlineData(".png")]
    [InlineData(".jpg")]
    [InlineData(".jpeg")]
    [InlineData(".webp")]
    [InlineData(".docx")]
    [InlineData(".xlsx")]
    public async Task Genuine_files_match_their_extension(string extension)
    {
        var content = extension switch
        {
            ".pdf" => PdfBytes,
            ".png" => PngBytes,
            ".jpg" or ".jpeg" => JpegBytes,
            ".webp" => WebpBytes,
            _ => ZipBytes
        };

        (await Matches(content, extension)).Should().BeTrue();
    }

    [Theory]
    [InlineData(".pdf")]
    [InlineData(".png")]
    [InlineData(".jpg")]
    [InlineData(".docx")]
    public async Task Renamed_executable_is_rejected(string extension) =>
        (await Matches(ExeBytes, extension)).Should().BeFalse();

    [Fact]
    public async Task Png_renamed_to_pdf_is_rejected() =>
        (await Matches(PngBytes, ".pdf")).Should().BeFalse();

    [Fact]
    public async Task Riff_without_webp_marker_is_rejected() =>
        (await Matches([.. "RIFF"u8, 0, 0, 0, 0, .. "WAVE"u8], ".webp")).Should().BeFalse();

    [Fact]
    public async Task Truncated_file_is_rejected() =>
        (await Matches([0x89, 0x50], ".png")).Should().BeFalse();

    [Fact]
    public async Task Plain_text_is_accepted_but_binary_text_file_is_rejected()
    {
        (await Matches(Encoding.UTF8.GetBytes("name,amount\nA,1\n"), ".csv")).Should().BeTrue();
        (await Matches(ExeBytes, ".txt")).Should().BeFalse();
        (await Matches([0x41, 0x42, 0x00, 0x43], ".csv")).Should().BeFalse();
    }
}
