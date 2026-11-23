namespace CorporateOS.Domain.Rules;

public static class LeaveDayCalculator
{
    /// <summary>
    /// Counts working days (Monday–Friday) in the inclusive range. Public holidays are
    /// not modelled; this is a documented limitation.
    /// </summary>
    public static int CountWorkingDays(DateOnly start, DateOnly end)
    {
        if (end < start)
        {
            return 0;
        }

        var days = 0;
        for (var date = start; date <= end; date = date.AddDays(1))
        {
            if (date.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday))
            {
                days++;
            }
        }

        return days;
    }

    public static bool Overlaps(DateOnly startA, DateOnly endA, DateOnly startB, DateOnly endB) =>
        startA <= endB && startB <= endA;
}
