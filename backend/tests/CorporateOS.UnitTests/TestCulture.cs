using System.Globalization;
using System.Runtime.CompilerServices;

namespace CorporateOS.UnitTests;

internal static class TestCulture
{
    /// <summary>
    /// Backend messages follow CurrentUICulture (default Turkish). Assertions are written against the
    /// English catalog, so every test thread runs with an English UI culture regardless of the machine.
    /// </summary>
    [ModuleInitializer]
    internal static void UseEnglishMessages()
    {
        var english = CultureInfo.GetCultureInfo("en");
        CultureInfo.DefaultThreadCurrentUICulture = english;
        CultureInfo.CurrentUICulture = english;
    }
}
