using System.Linq.Expressions;
using CorporateOS.Application.Common.Models;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Common.Extensions;

public static class QueryableExtensions
{
    public static async Task<PagedResult<T>> ToPagedResultAsync<T>(
        this IQueryable<T> query,
        PagedQuery paging,
        CancellationToken cancellationToken)
    {
        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<T>
        {
            Items = items,
            Page = paging.Page,
            PageSize = paging.PageSize,
            TotalItems = total
        };
    }

    /// <summary>
    /// Applies a whitelisted sort. Unknown sort keys fall back to <paramref name="defaultKey"/>,
    /// so client input can never reach arbitrary columns.
    /// </summary>
    public static IQueryable<T> ApplySort<T>(
        this IQueryable<T> query,
        PagedQuery paging,
        IReadOnlyDictionary<string, Expression<Func<T, object?>>> sortMap,
        string defaultKey,
        bool defaultDescending = false)
    {
        var useDefault = string.IsNullOrWhiteSpace(paging.SortBy) || !sortMap.ContainsKey(paging.SortBy);
        var key = useDefault ? defaultKey : paging.SortBy!;
        var descending = useDefault ? defaultDescending : paging.SortDescending;
        var selector = sortMap[key];

        return descending ? query.OrderByDescending(selector) : query.OrderBy(selector);
    }

    public static IQueryable<T> WhereIf<T>(this IQueryable<T> query, bool condition, Expression<Func<T, bool>> predicate) =>
        condition ? query.Where(predicate) : query;
}

public static class SortMap
{
    /// <summary>Builds a case-insensitive sort whitelist.</summary>
    public static IReadOnlyDictionary<string, Expression<Func<T, object?>>> For<T>(
        params (string Key, Expression<Func<T, object?>> Selector)[] entries) =>
        entries.ToDictionary(e => e.Key, e => e.Selector, StringComparer.OrdinalIgnoreCase);
}
