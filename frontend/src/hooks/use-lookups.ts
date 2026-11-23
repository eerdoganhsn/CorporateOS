import { useQuery } from '@tanstack/react-query'
import { lookupsApi } from '@/api/endpoints'
import { usePermissions } from '@/store/auth-store'

const LOOKUP_STALE_TIME = 5 * 60 * 1000

export function useDepartmentLookup() {
  return useQuery({ queryKey: ['lookups', 'departments'], queryFn: lookupsApi.departments, staleTime: LOOKUP_STALE_TIME })
}

export function usePositionLookup(departmentId?: number) {
  return useQuery({
    queryKey: ['lookups', 'positions', departmentId ?? null],
    queryFn: () => lookupsApi.positions(departmentId),
    staleTime: LOOKUP_STALE_TIME,
  })
}

/** Employee options; only managers and administrators may load them. */
export function useEmployeeLookup(params?: { departmentId?: number; projectId?: number }, enabled = true) {
  const { isManagerOrAbove } = usePermissions()
  return useQuery({
    queryKey: ['lookups', 'employees', params ?? {}],
    queryFn: () => lookupsApi.employees(params),
    staleTime: LOOKUP_STALE_TIME,
    enabled: enabled && isManagerOrAbove,
  })
}

export function useProjectLookup() {
  return useQuery({ queryKey: ['lookups', 'projects'], queryFn: lookupsApi.projects, staleTime: LOOKUP_STALE_TIME })
}
