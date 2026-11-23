namespace CorporateOS.Application.Common.Options;

public sealed class AppUrlOptions
{
    public const string SectionName = "App";

    /// <summary>Public URL of the React frontend; used to build links in emails.</summary>
    public string FrontendUrl { get; set; } = "http://localhost:5173";
}

public static class MediaUrls
{
    /// <summary>Profile images are served as static files with unguessable generated names.</summary>
    public static string? Avatar(string? relativePath) =>
        string.IsNullOrEmpty(relativePath) ? null : "/media/" + relativePath;
}
