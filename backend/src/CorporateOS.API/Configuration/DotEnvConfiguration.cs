namespace CorporateOS.API.Configuration;

/// <summary>
/// Development convenience: loads KEY=VALUE pairs from the repository's .env file so the
/// API and docker compose share one local, git-ignored configuration file. Real environment
/// variables always take precedence. Not used outside Development.
/// </summary>
public static class DotEnvConfiguration
{
    public static void AddDotEnvFile(this ConfigurationManager configuration, IHostEnvironment environment)
    {
        if (!environment.IsDevelopment())
        {
            return;
        }

        var file = FindUpwards(environment.ContentRootPath, ".env");
        if (file is null)
        {
            return;
        }

        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        foreach (var rawLine in File.ReadAllLines(file))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#'))
            {
                continue;
            }

            var separator = line.IndexOf('=');
            if (separator <= 0)
            {
                continue;
            }

            var key = line[..separator].Trim().Replace("__", ":");
            var value = line[(separator + 1)..].Trim().Trim('"');
            values[key] = value;
        }

        configuration.AddInMemoryCollection(values);
        // Re-add environment variables so they override values from the file.
        configuration.AddEnvironmentVariables();
    }

    private static string? FindUpwards(string startDirectory, string fileName)
    {
        for (var dir = new DirectoryInfo(startDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, fileName);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }
}
