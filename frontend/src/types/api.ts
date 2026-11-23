/** Envelope returned by every API endpoint. */
export interface ApiResponse<T> {
  success: boolean
  data: T
  message: string | null
  errors?: Record<string, string[]> | null
}

export interface PagedResult<T> {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface PagedQuery {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export interface EmployeeSummary {
  id: number
  fullName: string
  employeeNumber: string
  email: string
  positionTitle: string | null
  avatarUrl: string | null
}

export interface ActivityItem {
  id: number
  action: string
  entityName: string
  entityId: string | null
  userName: string | null
  details: string | null
  createdAt: string
}

export interface ChartPoint {
  label: string
  value: number
}
