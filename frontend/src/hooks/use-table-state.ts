import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { SortState } from '@/components/common/data-table'

/**
 * Table state (page, size, search, sort and arbitrary filters) stored in the URL so views are
 * shareable, survive refreshes and work with the browser's back button.
 */
export function useTableState<F extends string>(
  filterKeys: readonly F[] = [],
  defaults: { pageSize?: number; sortBy?: string; sortDirection?: 'asc' | 'desc' } = {},
) {
  const [params, setParams] = useSearchParams()

  const page = Number(params.get('page') ?? 1) || 1
  const pageSize = Number(params.get('pageSize') ?? defaults.pageSize ?? 20) || 20
  const search = params.get('search') ?? ''
  const sortBy = params.get('sortBy') ?? defaults.sortBy
  const sortDirection = (params.get('sortDirection') as 'asc' | 'desc' | null) ?? defaults.sortDirection

  const filterKeySignature = filterKeys.join('|')
  const filters = useMemo(() => {
    const result = {} as Record<F, string | undefined>
    for (const key of filterKeySignature.split('|') as F[]) {
      if (key) result[key] = params.get(key) ?? undefined
    }
    return result
  }, [params, filterKeySignature])

  const update = useCallback(
    (changes: Record<string, string | number | undefined | null>, resetPage = true) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(changes)) {
            if (value === undefined || value === null || value === '') next.delete(key)
            else next.set(key, String(value))
          }
          if (resetPage && !('page' in changes)) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return {
    page,
    pageSize,
    search,
    sort: { sortBy, sortDirection } as SortState,
    filters,
    setPage: (value: number) => update({ page: value }, false),
    setPageSize: (value: number) => update({ pageSize: value }),
    setSearch: (value: string) => update({ search: value }),
    setSort: (sort: SortState) => update({ sortBy: sort.sortBy, sortDirection: sort.sortDirection }),
    setFilter: (key: F, value: string | undefined) => update({ [key]: value }),
    reset: () => setParams(new URLSearchParams(), { replace: true }),
    hasActiveFilters: search !== '' || filterKeys.some((k) => !!params.get(k)),
  }
}
