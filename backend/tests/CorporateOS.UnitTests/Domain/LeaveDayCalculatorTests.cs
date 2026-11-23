using CorporateOS.Domain.Rules;
using FluentAssertions;

namespace CorporateOS.UnitTests.Domain;

public class LeaveDayCalculatorTests
{
    // 2026-11-23 is a Monday.
    private static readonly DateOnly Monday = new(2026, 11, 23);

    [Fact]
    public void Single_weekday_counts_as_one_day() =>
        LeaveDayCalculator.CountWorkingDays(Monday, Monday).Should().Be(1);

    [Fact]
    public void Full_week_excludes_weekend() =>
        LeaveDayCalculator.CountWorkingDays(Monday, Monday.AddDays(6)).Should().Be(5);

    [Fact]
    public void Weekend_only_range_is_zero() =>
        LeaveDayCalculator.CountWorkingDays(Monday.AddDays(5), Monday.AddDays(6)).Should().Be(0);

    [Fact]
    public void Range_spanning_two_weekends_counts_only_weekdays() =>
        // Friday .. Monday eleven days later: Fri + 5 + Mon = 7
        LeaveDayCalculator.CountWorkingDays(Monday.AddDays(4), Monday.AddDays(14)).Should().Be(7);

    [Fact]
    public void End_before_start_is_zero() =>
        LeaveDayCalculator.CountWorkingDays(Monday.AddDays(3), Monday).Should().Be(0);

    [Theory]
    [InlineData(0, 4, 4, 8, true)]   // touching on the boundary day
    [InlineData(0, 4, 2, 3, true)]   // contained
    [InlineData(0, 4, 5, 9, false)]  // adjacent, no shared day
    [InlineData(5, 9, 0, 4, false)]
    public void Overlaps_is_inclusive(int aStart, int aEnd, int bStart, int bEnd, bool expected) =>
        LeaveDayCalculator.Overlaps(Monday.AddDays(aStart), Monday.AddDays(aEnd), Monday.AddDays(bStart), Monday.AddDays(bEnd))
            .Should().Be(expected);
}
