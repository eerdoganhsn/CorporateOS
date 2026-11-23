using System.Globalization;
using System.Text.RegularExpressions;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Localization;
using FluentAssertions;

namespace CorporateOS.UnitTests.Domain;

public partial class LocalizationTests
{
    [GeneratedRegex(@"\{(\d+)[^}]*\}")]
    private static partial Regex Placeholder();

    [Theory]
    [InlineData(Languages.Turkish)]
    [InlineData(Languages.German)]
    public void Catalog_has_the_same_keys_and_placeholders_as_english(string language)
    {
        var english = Text.Catalog(Languages.English);
        var other = Text.Catalog(language);

        other.Keys.Should().BeEquivalentTo(english.Keys);
        foreach (var (key, text) in english)
        {
            Placeholders(other[key]).Should().BeEquivalentTo(Placeholders(text), $"placeholders of '{key}' must match");
        }
    }

    [Fact]
    public void Every_enum_value_used_in_messages_has_a_translation()
    {
        Type[] enums =
        [
            typeof(LeaveType), typeof(LeaveRequestStatus), typeof(ExpenseCategory), typeof(ExpenseStatus),
            typeof(ProjectStatus), typeof(Priority), typeof(TaskItemStatus), typeof(EmploymentType), typeof(EmployeeStatus)
        ];

        var missing = enums.SelectMany(t => System.Enum.GetValues(t).Cast<System.Enum>())
            .Select(Text.EnumKey)
            .Where(key => !Text.Has(key))
            .ToList();

        missing.Should().BeEmpty();
    }

    [Theory]
    [InlineData("tr-TR", Languages.Turkish)]
    [InlineData("DE", Languages.German)]
    [InlineData("en-US", Languages.English)]
    [InlineData("fr", Languages.Turkish)]
    [InlineData(null, Languages.Turkish)]
    public void Normalize_maps_tags_to_supported_languages(string? tag, string expected) =>
        Languages.Normalize(tag).Should().Be(expected);

    [Fact]
    public void Get_uses_the_current_ui_culture_and_translates_enum_arguments()
    {
        var previous = CultureInfo.CurrentUICulture;
        try
        {
            CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo("tr");
            Text.Get("error.forbidden").Should().Be(Text.Catalog(Languages.Turkish)["error.forbidden"]);
            Text.Get("expense.locked", ExpenseStatus.Paid)
                .Should().Contain(Text.Catalog(Languages.Turkish)["enum.ExpenseStatus.Paid"]);
        }
        finally
        {
            CultureInfo.CurrentUICulture = previous;
        }
    }

    [Fact]
    public void LocalizedText_renders_in_the_requested_language()
    {
        var text = LocalizedText.Of("notify.taskAssigned.message", "Report", "Apollo");

        text.Render(Languages.English).Should().Be("\"Report\" in Apollo.");
        LocalizedText.Of("notify.taskAssigned.title").Render(Languages.German)
            .Should().Be(Text.Catalog(Languages.German)["notify.taskAssigned.title"]);
        LocalizedText.Raw("Town hall").Render(Languages.Turkish).Should().Be("Town hall");
    }

    private static IEnumerable<string> Placeholders(string text) =>
        Placeholder().Matches(text).Select(m => m.Groups[1].Value).Distinct().Order();
}
