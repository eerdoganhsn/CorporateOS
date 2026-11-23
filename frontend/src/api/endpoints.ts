import { del, downloadFile, get, patch, post, put, upload } from './client'
import type { ActivityItem, PagedQuery, PagedResult } from '@/types/api'
import type {
  AnnouncementPriority,
  AnnouncementTarget,
  DocumentAccessLevel,
  DocumentCategory,
  EmployeeStatus,
  EmploymentType,
  ExpenseCategory,
  ExpenseStatus,
  LeaveStatus,
  LeaveType,
  PositionLevel,
  Priority,
  ProjectStatus,
  RecordStatus,
  RequestListScope,
  Role,
  TaskStatus,
} from '@/types/enums'
import type {
  AdminDashboard,
  AdminUser,
  Announcement,
  AuditLogEntry,
  AuthResponse,
  AuthUser,
  DepartmentDetail,
  DepartmentListItem,
  DepartmentLookup,
  DocumentItem,
  EmployeeDashboard,
  EmployeeDetail,
  EmployeeListItem,
  EmployeeLookup,
  EmployeeProject,
  Expense,
  ExpenseTotals,
  LeaveBalance,
  LeaveCalendarEntry,
  LeaveRequest,
  ManagerDashboard,
  MyLeaveSummary,
  NotificationItem,
  Position,
  PositionLookup,
  Profile,
  ProjectDetail,
  ProjectListItem,
  ProjectLookup,
  PublicSettings,
  ReportResult,
  ReportType,
  RolesOverview,
  SearchResults,
  Setting,
  TaskBoardColumn,
  TaskComment,
  TaskDetail,
  TaskListItem,
} from '@/types/models'

/* ----------------------------------- Auth ---------------------------------- */

export const authApi = {
  login: (email: string, password: string) => post<AuthResponse>('/auth/login', { email, password }),
  logout: () => post<null>('/auth/logout'),
  me: () => get<AuthUser>('/auth/me'),
  forgotPassword: (email: string) => post<null>('/auth/forgot-password', { email }),
  resetPassword: (body: { email: string; token: string; newPassword: string; confirmPassword: string }) =>
    post<null>('/auth/reset-password', body),
  changePassword: (body: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
    post<AuthResponse>('/auth/change-password', body),
}

export const profileApi = {
  get: () => get<Profile>('/profile'),
  update: (body: { phone?: string; address?: string; emergencyContactName?: string; emergencyContactPhone?: string }) =>
    put<Profile>('/profile', body),
  uploadAvatar: (file: File) => upload<string>('/profile/avatar', file),
}

/* ------------------------------- Organization ------------------------------ */

export interface DepartmentPayload {
  name: string
  code: string
  description?: string | null
  managerId?: number | null
  status: RecordStatus
}

export const departmentsApi = {
  list: (query: PagedQuery & { status?: RecordStatus }) =>
    get<PagedResult<DepartmentListItem>>('/departments', query),
  get: (id: number) => get<DepartmentDetail>(`/departments/${id}`),
  create: (body: DepartmentPayload) => post<DepartmentDetail>('/departments', body),
  update: (id: number, body: DepartmentPayload) => put<DepartmentDetail>(`/departments/${id}`, body),
  remove: (id: number) => del(`/departments/${id}`),
}

export interface PositionPayload {
  title: string
  description?: string | null
  departmentId?: number | null
  level: PositionLevel
  status: RecordStatus
}

export const positionsApi = {
  list: (query: PagedQuery & { departmentId?: number; status?: RecordStatus; level?: PositionLevel }) =>
    get<PagedResult<Position>>('/positions', query),
  create: (body: PositionPayload) => post<Position>('/positions', body),
  update: (id: number, body: PositionPayload) => put<Position>(`/positions/${id}`, body),
  remove: (id: number) => del(`/positions/${id}`),
}

export interface EmployeePayload {
  employeeNumber: string
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  departmentId: number
  positionId: number
  managerId?: number | null
  hireDate: string
  employmentType: EmploymentType
  status: EmployeeStatus
  address?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  birthDate?: string | null
  salary?: number | null
  createUserAccount?: boolean
  role?: Role | null
  temporaryPassword?: string | null
}

export type EmployeeQuery = PagedQuery & {
  departmentId?: number
  positionId?: number
  status?: EmployeeStatus
  employmentType?: EmploymentType
}

export const employeesApi = {
  list: (query: EmployeeQuery) => get<PagedResult<EmployeeListItem>>('/employees', query),
  get: (id: number) => get<EmployeeDetail>(`/employees/${id}`),
  create: (body: EmployeePayload) => post<EmployeeDetail>('/employees', body),
  update: (id: number, body: EmployeePayload) => put<EmployeeDetail>(`/employees/${id}`, body),
  changeStatus: (id: number, status: EmployeeStatus) => patch<EmployeeDetail>(`/employees/${id}/status`, { status }),
  remove: (id: number) => del(`/employees/${id}`),
  uploadImage: (id: number, file: File) => upload<string>(`/employees/${id}/image`, file),
  activity: (id: number) => get<ActivityItem[]>(`/employees/${id}/activity`),
  projects: (id: number) => get<EmployeeProject[]>(`/employees/${id}/projects`),
}

export const lookupsApi = {
  departments: () => get<DepartmentLookup[]>('/lookups/departments'),
  positions: (departmentId?: number) => get<PositionLookup[]>('/lookups/positions', { departmentId }),
  employees: (params?: { departmentId?: number; projectId?: number }) =>
    get<EmployeeLookup[]>('/lookups/employees', params),
  projects: () => get<ProjectLookup[]>('/lookups/projects'),
}

/* ----------------------------------- Work ---------------------------------- */

export interface ProjectPayload {
  name: string
  projectCode: string
  description?: string | null
  startDate: string
  endDate?: string | null
  status: ProjectStatus
  priority: Priority
  budget?: number | null
  progressPercentage: number
  projectManagerId?: number | null
  departmentId?: number | null
}

export type ProjectQuery = PagedQuery & {
  status?: ProjectStatus
  priority?: Priority
  departmentId?: number
  includeArchived?: boolean
}

export const projectsApi = {
  list: (query: ProjectQuery) => get<PagedResult<ProjectListItem>>('/projects', query),
  get: (id: number) => get<ProjectDetail>(`/projects/${id}`),
  create: (body: ProjectPayload) => post<ProjectDetail>('/projects', body),
  update: (id: number, body: ProjectPayload) => put<ProjectDetail>(`/projects/${id}`, body),
  archive: (id: number) => post<ProjectDetail>(`/projects/${id}/archive`),
  unarchive: (id: number) => post<ProjectDetail>(`/projects/${id}/unarchive`),
  addMember: (id: number, employeeId: number, role?: string) =>
    post<ProjectDetail>(`/projects/${id}/members`, { employeeId, role }),
  removeMember: (id: number, employeeId: number) => del(`/projects/${id}/members/${employeeId}`),
  activity: (id: number) => get<ActivityItem[]>(`/projects/${id}/activity`),
}

export type TaskQuery = PagedQuery & {
  projectId?: number
  assignedToId?: number
  status?: TaskStatus
  priority?: Priority
  dueFrom?: string
  dueTo?: string
  overdueOnly?: boolean
  mine?: boolean
}

export interface CreateTaskPayload {
  projectId: number
  title: string
  description?: string | null
  assignedToId?: number | null
  status: TaskStatus
  priority: Priority
  dueDate?: string | null
  estimatedHours?: number | null
}

export interface UpdateTaskPayload {
  title: string
  description?: string | null
  assignedToId?: number | null
  status: TaskStatus
  priority: Priority
  dueDate?: string | null
  estimatedHours?: number | null
  actualHours?: number | null
  progressPercentage: number
}

export const tasksApi = {
  list: (query: TaskQuery) => get<PagedResult<TaskListItem>>('/tasks', query),
  board: (query: TaskQuery) => get<TaskBoardColumn[]>('/tasks/board', query),
  get: (id: number) => get<TaskDetail>(`/tasks/${id}`),
  create: (body: CreateTaskPayload) => post<TaskDetail>('/tasks', body),
  update: (id: number, body: UpdateTaskPayload) => put<TaskDetail>(`/tasks/${id}`, body),
  updateStatus: (id: number, body: { status: TaskStatus; progressPercentage?: number; actualHours?: number | null }) =>
    patch<TaskDetail>(`/tasks/${id}/status`, body),
  remove: (id: number) => del(`/tasks/${id}`),
  addComment: (id: number, content: string) => post<TaskComment>(`/tasks/${id}/comments`, { content }),
  activity: (id: number) => get<ActivityItem[]>(`/tasks/${id}/activity`),
}

/* -------------------------------- Operations ------------------------------- */

export type LeaveQuery = PagedQuery & {
  scope?: RequestListScope
  employeeId?: number
  departmentId?: number
  status?: LeaveStatus
  leaveType?: LeaveType
  from?: string
  to?: string
}

export const leaveApi = {
  list: (query: LeaveQuery) => get<PagedResult<LeaveRequest>>('/leave-requests', query),
  get: (id: number) => get<LeaveRequest>(`/leave-requests/${id}`),
  create: (body: { leaveType: LeaveType; startDate: string; endDate: string; reason?: string | null }) =>
    post<LeaveRequest>('/leave-requests', body),
  approve: (id: number, note?: string) => post<LeaveRequest>(`/leave-requests/${id}/approve`, { note }),
  reject: (id: number, reason: string) => post<LeaveRequest>(`/leave-requests/${id}/reject`, { reason }),
  cancel: (id: number) => post<LeaveRequest>(`/leave-requests/${id}/cancel`),
  calendar: (from: string, to: string, departmentId?: number) =>
    get<LeaveCalendarEntry[]>('/leave-requests/calendar', { from, to, departmentId }),
  mySummary: (year?: number) => get<MyLeaveSummary>('/leave-balances/me', { year }),
  balances: (query: PagedQuery & { year?: number; departmentId?: number }) =>
    get<PagedResult<LeaveBalance>>('/leave-balances', query),
  updateBalance: (employeeId: number, year: number, totalDays: number) =>
    put<LeaveBalance>(`/leave-balances/${employeeId}/${year}`, { totalDays }),
}

export type ExpenseQuery = PagedQuery & {
  scope?: RequestListScope
  employeeId?: number
  departmentId?: number
  status?: ExpenseStatus
  category?: ExpenseCategory
  from?: string
  to?: string
}

export interface ExpensePayload {
  category: ExpenseCategory
  amount: number
  currency: string
  expenseDate: string
  description: string
}

export const expensesApi = {
  list: (query: ExpenseQuery) => get<PagedResult<Expense>>('/expenses', query),
  myTotals: () => get<ExpenseTotals>('/expenses/me/totals'),
  get: (id: number) => get<Expense>(`/expenses/${id}`),
  create: (body: ExpensePayload) => post<Expense>('/expenses', body),
  update: (id: number, body: ExpensePayload) => put<Expense>(`/expenses/${id}`, body),
  remove: (id: number) => del(`/expenses/${id}`),
  uploadReceipt: (id: number, file: File) => upload<Expense>(`/expenses/${id}/receipt`, file),
  downloadReceipt: (id: number) => downloadFile(`/expenses/${id}/receipt`, undefined, `receipt-${id}`),
  submit: (id: number) => post<Expense>(`/expenses/${id}/submit`),
  approve: (id: number, note?: string) => post<Expense>(`/expenses/${id}/approve`, { note }),
  reject: (id: number, reason: string) => post<Expense>(`/expenses/${id}/reject`, { reason }),
  markPaid: (id: number) => post<Expense>(`/expenses/${id}/mark-paid`),
}

/* --------------------------------- Content --------------------------------- */

export interface AnnouncementPayload {
  title: string
  content: string
  priority: AnnouncementPriority
  publishDate?: string | null
  expireDate?: string | null
  isPinned: boolean
  targetType: AnnouncementTarget
  departmentId?: number | null
}

export const announcementsApi = {
  list: (query: PagedQuery & { priority?: AnnouncementPriority; includeInactive?: boolean }) =>
    get<PagedResult<Announcement>>('/announcements', query),
  get: (id: number) => get<Announcement>(`/announcements/${id}`),
  create: (body: AnnouncementPayload) => post<Announcement>('/announcements', body),
  update: (id: number, body: AnnouncementPayload) => put<Announcement>(`/announcements/${id}`, body),
  pin: (id: number, isPinned: boolean) => patch<Announcement>(`/announcements/${id}/pin`, { isPinned }),
  remove: (id: number) => del(`/announcements/${id}`),
}

export interface DocumentMetadata {
  name: string
  description?: string | null
  category: DocumentCategory
  accessLevel: DocumentAccessLevel
  departmentId?: number | null
}

export const documentsApi = {
  list: (query: PagedQuery & { category?: DocumentCategory; departmentId?: number; accessLevel?: DocumentAccessLevel }) =>
    get<PagedResult<DocumentItem>>('/documents', query),
  upload: (file: File, meta: DocumentMetadata) =>
    upload<DocumentItem>('/documents/upload', file, {
      name: meta.name,
      description: meta.description,
      category: meta.category,
      accessLevel: meta.accessLevel,
      departmentId: meta.departmentId,
    }),
  update: (id: number, meta: DocumentMetadata) => put<DocumentItem>(`/documents/${id}`, meta),
  download: (doc: DocumentItem) => downloadFile(`/documents/${doc.id}/download`, undefined, doc.originalFileName),
  remove: (id: number) => del(`/documents/${id}`),
}

/* --------------------------------- Platform -------------------------------- */

export const notificationsApi = {
  list: (query: PagedQuery & { unreadOnly?: boolean }) => get<PagedResult<NotificationItem>>('/notifications', query),
  unreadCount: () => get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: number) => patch<null>(`/notifications/${id}/read`),
  markAllRead: () => patch<number>('/notifications/read-all'),
}

export const dashboardApi = {
  admin: () => get<AdminDashboard>('/dashboard/admin'),
  manager: () => get<ManagerDashboard>('/dashboard/manager'),
  employee: () => get<EmployeeDashboard>('/dashboard/employee'),
}

export const searchApi = {
  search: (q: string) => get<SearchResults>('/search', { q }),
}

export const settingsApi = {
  public: () => get<PublicSettings>('/settings/public'),
  all: () => get<Setting[]>('/admin/settings'),
  update: (values: Record<string, string>) => put<Setting[]>('/admin/settings', { values }),
  uploadLogo: (file: File) => upload<null>('/admin/settings/logo', file),
}

export type ReportFilters = {
  from?: string
  to?: string
  departmentId?: number
  employeeId?: number
  projectId?: number
  status?: string
  groupBy?: string
}

export const reportsApi = {
  run: (type: ReportType, filters: ReportFilters) => get<ReportResult>(`/reports/${type}`, filters),
  export: (type: ReportType, filters: ReportFilters, format: 'Csv' | 'Xlsx') =>
    downloadFile(`/reports/${type}`, { ...filters, format }, `${type}-report.${format.toLowerCase()}`),
}

/* ------------------------------ Administration ----------------------------- */

export type UserQuery = PagedQuery & { role?: Role; isActive?: boolean; isLocked?: boolean }

export const adminUsersApi = {
  list: (query: UserQuery) => get<PagedResult<AdminUser>>('/admin/users', query),
  activate: (id: string) => post<AdminUser>(`/admin/users/${id}/activate`),
  deactivate: (id: string) => post<AdminUser>(`/admin/users/${id}/deactivate`),
  lock: (id: string, minutes?: number) => post<AdminUser>(`/admin/users/${id}/lock`, { minutes }),
  unlock: (id: string) => post<AdminUser>(`/admin/users/${id}/unlock`),
  resetPassword: (id: string, newPassword: string) => post<null>(`/admin/users/${id}/reset-password`, { newPassword }),
  assignRoles: (id: string, roles: Role[]) => put<AdminUser>(`/admin/users/${id}/roles`, { roles }),
  activity: (id: string) => get<ActivityItem[]>(`/admin/users/${id}/activity`),
  roles: () => get<RolesOverview>('/admin/roles'),
}

export type AuditLogQuery = PagedQuery & {
  userId?: string
  action?: string
  entityName?: string
  from?: string
  to?: string
}

export const auditLogsApi = {
  list: (query: AuditLogQuery) => get<PagedResult<AuditLogEntry>>('/admin/audit-logs', query),
  filters: () => get<{ actions: string[]; entityNames: string[] }>('/admin/audit-logs/filters'),
  export: (query: AuditLogQuery) => downloadFile('/admin/audit-logs/export', query, 'audit-log.csv'),
}
