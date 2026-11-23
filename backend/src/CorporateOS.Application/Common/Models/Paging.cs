namespace CorporateOS.Application.Common.Models;

public sealed class PagedResult<T>
{
    public IReadOnlyList<T> Items { get; init; } = [];
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalItems { get; init; }
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(TotalItems / (double)PageSize);
}

/// <summary>Common list parameters bound from the query string.</summary>
public class PagedQuery
{
    private const int MaxPageSize = 100;
    private int _page = 1;
    private int _pageSize = 20;

    public int Page
    {
        get => _page;
        set => _page = value < 1 ? 1 : value;
    }

    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = value switch { < 1 => 20, > MaxPageSize => MaxPageSize, _ => value };
    }

    public string? Search { get; set; }
    public string? SortBy { get; set; }

    /// <summary>"asc" or "desc".</summary>
    public string? SortDirection { get; set; }

    public bool SortDescending => string.Equals(SortDirection, "desc", StringComparison.OrdinalIgnoreCase);
}

public sealed record LookupDto(int Id, string Name);

public sealed record ExportFile(byte[] Content, string ContentType, string FileName);

/// <summary>A stored file streamed back to an authorized caller.</summary>
public sealed record FileDownload(Stream Content, string ContentType, string FileName);

/// <summary>Tabular data shared by CSV and Excel exporters.</summary>
public sealed record ReportTable(string Title, IReadOnlyList<string> Columns, IReadOnlyList<IReadOnlyList<object?>> Rows);

/// <summary>Framework-neutral representation of an uploaded file.</summary>
public sealed record FileUpload(string FileName, string ContentType, long Length, Func<Stream> OpenReadStream);
