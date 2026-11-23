using System.Globalization;
using System.Text.Json;

namespace CorporateOS.Domain.Localization;

/// <summary>Languages the platform is translated into. Turkish is the default.</summary>
public static class Languages
{
    public const string Turkish = "tr";
    public const string English = "en";
    public const string German = "de";
    public const string Default = Turkish;

    public static readonly IReadOnlyList<string> Supported = [Turkish, English, German];

    /// <summary>Maps any culture or language tag ("de-AT", "EN") to a supported language, or the default.</summary>
    public static string Normalize(string? language)
    {
        if (string.IsNullOrWhiteSpace(language))
        {
            return Default;
        }

        var code = language.Trim().Split('-', '_')[0].ToLowerInvariant();
        return Supported.Contains(code) ? code : Default;
    }

    public static bool IsSupported(string? language) =>
        language is not null && Supported.Contains(language.Trim().ToLowerInvariant());

    /// <summary>True when the primary subtag of a culture tag ("de-AT") is a supported language.</summary>
    public static bool IsSupportedTag(string? tag) =>
        !string.IsNullOrWhiteSpace(tag) && Supported.Contains(tag.Trim().Split('-', '_')[0].ToLowerInvariant());

    public static CultureInfo Culture(string? language) => CultureInfo.GetCultureInfo(Normalize(language));

    /// <summary>The language of the current request (CurrentUICulture), falling back to the default.</summary>
    public static string Current => Normalize(CultureInfo.CurrentUICulture.Name);
}

/// <summary>
/// Message catalog for every user-facing text produced by the backend (errors, validation messages,
/// notifications, e-mails, report labels). Catalogs are embedded JSON files with flat keys and
/// <c>string.Format</c> placeholders. Lookups fall back to English and finally to the key itself.
/// </summary>
public static class Text
{
    private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>> Catalogs = Load();

    /// <summary>Translates into the language of the current request.</summary>
    public static string Get(string key, params object?[] args) => For(Languages.Current, key, args);

    /// <summary>Translates into the given language (e.g. a notification recipient's preferred language).</summary>
    public static string For(string? language, string key, params object?[] args)
    {
        var lang = Languages.Normalize(language);
        var template = Lookup(lang, key) ?? Lookup(Languages.English, key) ?? key;
        if (args.Length == 0)
        {
            return template;
        }

        var culture = Languages.Culture(lang);
        var rendered = args.Select(a => FormatArg(a, lang, culture)).ToArray();
        return string.Format(culture, template, rendered);
    }

    /// <summary>Display name of an enum value, e.g. <c>LeaveType.SickLeave</c> → "Hastalık izni".</summary>
    public static string Enum(Enum value, string? language = null)
    {
        var lang = language is null ? Languages.Current : Languages.Normalize(language);
        return Lookup(lang, EnumKey(value)) ?? Lookup(Languages.English, EnumKey(value)) ?? value.ToString();
    }

    public static string EnumKey(Enum value) => $"enum.{value.GetType().Name}.{value}";

    public static bool Has(string key) => Lookup(Languages.English, key) is not null;

    /// <summary>All keys of a language catalog (used by tests to verify the catalogs are complete).</summary>
    public static IReadOnlyDictionary<string, string> Catalog(string language) => Catalogs[language];

    private static string? Lookup(string language, string key) =>
        Catalogs.TryGetValue(language, out var catalog) && catalog.TryGetValue(key, out var text) ? text : null;

    private static object? FormatArg(object? arg, string language, CultureInfo culture) => arg switch
    {
        null => string.Empty,
        LocalizedText text => text.Render(language),
        Enum e => Enum(e, language),
        DateOnly d => d.ToString("d", culture),
        DateTime dt => dt.ToString("g", culture),
        decimal m => m.ToString("N2", culture),
        _ => arg
    };

    private static IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>> Load()
    {
        var assembly = typeof(Text).Assembly;
        var result = new Dictionary<string, IReadOnlyDictionary<string, string>>();
        foreach (var language in Languages.Supported)
        {
            using var stream = assembly.GetManifestResourceStream($"CorporateOS.Domain.Localization.Resources.{language}.json")
                               ?? throw new InvalidOperationException($"Missing message catalog for '{language}'.");
            result[language] = JsonSerializer.Deserialize<Dictionary<string, string>>(stream)
                               ?? throw new InvalidOperationException($"Message catalog for '{language}' is empty.");
        }

        return result;
    }
}

/// <summary>
/// A translatable message that is rendered later in a specific language — used for notifications and
/// e-mails, which must be written in the recipient's language rather than the sender's.
/// </summary>
public sealed class LocalizedText
{
    private readonly string? _key;
    private readonly object?[] _args;
    private readonly string? _raw;

    private LocalizedText(string? key, object?[] args, string? raw)
    {
        _key = key;
        _args = args;
        _raw = raw;
    }

    public static LocalizedText Of(string key, params object?[] args) => new(key, args, null);

    /// <summary>User-provided content (e.g. an announcement title) that is shown as-is in every language.</summary>
    public static LocalizedText Raw(string text) => new(null, [], text);

    public string Render(string? language) => _raw ?? Text.For(language, _key!, _args);

    public override string ToString() => Render(Languages.Current);
}
