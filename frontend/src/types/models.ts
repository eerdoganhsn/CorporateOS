import type { ActivityItem, ChartPoint, EmployeeSummary } from './api'
import type {
  AnnouncementPriority,
  AnnouncementState,
  AnnouncementTarget,
  DocumentAccessLevel,
  DocumentCategory,
  EmployeeStatus,
  EmploymentType,
  ExpenseCategory,
  ExpenseStatus,
  LeaveStatus,
  LeaveType,
  NotificationType,
  PositionLevel,
  Priority,
  ProjectStatus,
  RecordStatus,
  Role,
  SettingDataType,
  TaskStatus,
} from './enums'

/* ----------------------------------- Auth ---------------------------------- */

export interface AuthUser {
  id: string
  email: string
  displayName: string
  roles: Role[]
  primaryRole: Role
  employeeId: number | null
  departmentId: number | null
  departmentName: string | null
  positionTitle: string | null
  profileImageUrl: string | null
}

export interface AuthResponse {
  accessToken: string
  accessTokenExpiresAt: string
  user: AuthUser
}

/* ------------------------------- Organization ------------------------------ */

export interface DepartmentListItem {
  id: number
  name: string
  code: string
  description: string | null
  status: RecordStatus
  managerId: number | null
  managerName: string | null
  employeeCount: number
  activeProjectCount: number
}

export interface DepartmentDetail {
  id: number
  name: string
  code: string
  description: string | null
  status: RecordStatus
  manager: EmployeeSummary | null
  employeeCount: number
  employees: EmployeeSummary[]
  activeProjects: { id: number; name: string; projectCode: string; status: ProjectStatus; progressPercentage: number; endDate: string | null }[]
  tasks: { open: number; overdue: number; completedLast30Days: number }
  leave: { pending: number; approvedDaysThisYear: number; onLeaveToday: number }
  expenses: { pending: number; approvedThisMonth: number; approvedThisYear: number }
  createdAt: string
  updatedAt: string | null
}

export interface Position {
  id: number
  title: string
  description: string | null
  departmentId: number | null
  departmentName: string | null
  level: PositionLevel
  status: RecordStatus
  employeeCount: number
}

export interface EmployeeListItem {
  id: number
  employeeNumber: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  phone: string | null
  departmentId: number
  departmentName: string
  positionId: number
  positionTitle: string
  managerName: string | null
  hireDate: string
  employmentType: EmploymentType
  status: EmployeeStatus
  avatarUrl: string | null
  hasUserAccount: boolean
}

export interface EmployeeDetail {
  id: number
  employeeNumber: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  phone: string | null
  departmentId: number
  departmentName: string
  positionId: number
  positionTitle: string
  manager: EmployeeSummary | null
  hireDate: string
  employmentType: EmploymentType
  status: EmployeeStatus
  avatarUrl: string | null
  address: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  birthDate: string | null
  salary: number | null
  canViewSalary: boolean
  directReportCount: number
  account: { userId: string; roles: Role[]; isActive: boolean; isLocked: boolean; lastLoginAt: string | null } | null
  createdAt: string
  updatedAt: string | null
}

export interface EmployeeProject {
  projectId: number
  projectName: string
  projectCode: string
  status: ProjectStatus
  role: string
  isProjectManager: boolean
  joinedAt: string
}

export interface DepartmentLookup {
  id: number
  name: string
  code: string
}
export interface PositionLookup {
  id: number
  name: string
  departmentId: number | null
}
export interface EmployeeLookup {
  id: number
  name: string
  employeeNumber: string
  departmentId: number
  departmentName: string
}
export interface ProjectLookup {
  id: number
  name: string
  projectCode: string
}

/* ----------------------------------- Work ---------------------------------- */

export interface ProjectListItem {
  id: number
  name: string
  projectCode: string
  status: ProjectStatus
  priority: Priority
  startDate: string
  endDate: string | null
  progressPercentage: number
  projectManagerId: number | null
  projectManagerName: string | null
  departmentId: number | null
  departmentName: string | null
  memberCount: number
  openTaskCount: number
  budget: number | null
  isArchived: boolean
}

export interface ProjectMember {
  employeeId: number
  fullName: string
  employeeNumber: string
  positionTitle: string | null
  departmentName: string | null
  role: string
  joinedAt: string
  avatarUrl: string | null
}

export interface ProjectDetail {
  id: number
  name: string
  projectCode: string
  description: string | null
  status: ProjectStatus
  priority: Priority
  startDate: string
  endDate: string | null
  progressPercentage: number
  budget: number | null
  canViewBudget: boolean
  actualCost: number | null
  projectManager: EmployeeSummary | null
  departmentId: number | null
  departmentName: string | null
  isArchived: boolean
  members: ProjectMember[]
  taskStats: { total: number; todo: number; inProgress: number; review: number; completed: number; cancelled: number; overdue: number }
  canManage: boolean
  canManageTasks: boolean
  createdAt: string
  updatedAt: string | null
}

export interface TaskListItem {
  id: number
  title: string
  projectId: number
  projectName: string
  projectCode: string
  assignedToId: number | null
  assignedToName: string | null
  assignedToAvatarUrl: string | null
  status: TaskStatus
  priority: Priority
  dueDate: string | null
  progressPercentage: number
  estimatedHours: number | null
  actualHours: number | null
  isOverdue: boolean
  commentCount: number
  createdAt: string
}

export interface TaskBoardColumn {
  status: TaskStatus
  items: TaskListItem[]
}

export interface TaskComment {
  id: number
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  content: string
  createdAt: string
}

export interface TaskDetail {
  id: number
  title: string
  description: string | null
  projectId: number
  projectName: string
  projectCode: string
  assignedTo: EmployeeSummary | null
  assignedByName: string | null
  status: TaskStatus
  priority: Priority
  dueDate: string | null
  estimatedHours: number | null
  actualHours: number | null
  progressPercentage: number
  isOverdue: boolean
  completedAt: string | null
  comments: TaskComment[]
  canEdit: boolean
  canUpdateProgress: boolean
  createdAt: string
  updatedAt: string | null
}

/* -------------------------------- Operations ------------------------------- */

export interface LeaveRequest {
  id: number
  employeeId: number
  employeeName: string
  employeeNumber: string
  departmentName: string
  employeeAvatarUrl: string | null
  leaveType: LeaveType
  startDate: string
  endDate: string
  totalDays: number
  reason: string | null
  status: LeaveStatus
  approvedByName: string | null
  approvedAt: string | null
  approvalNote: string | null
  rejectionReason: string | null
  createdAt: string
  canApprove: boolean
  canCancel: boolean
}

export interface LeaveBalance {
  employeeId: number
  employeeName: string
  departmentName: string
  year: number
  totalDays: number
  usedDays: number
  pendingDays: number
  remainingDays: number
}

export interface MyLeaveSummary {
  balance: LeaveBalance
  usageByType: { leaveType: LeaveType; approvedDays: number; pendingDays: number }[]
}

export interface LeaveCalendarEntry {
  id: number
  employeeId: number
  employeeName: string
  departmentName: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  totalDays: number
  status: LeaveStatus
}

export interface Expense {
  id: number
  employeeId: number
  employeeName: string
  employeeNumber: string
  departmentName: string
  category: ExpenseCategory
  amount: number
  currency: string
  expenseDate: string
  description: string
  hasReceipt: boolean
  receiptFileName: string | null
  status: ExpenseStatus
  submittedAt: string | null
  approvedByName: string | null
  approvedAt: string | null
  approvalNote: string | null
  rejectionReason: string | null
  paidAt: string | null
  createdAt: string
  canEdit: boolean
  canApprove: boolean
  canMarkPaid: boolean
}

export interface ExpenseTotals {
  count: number
  draftAmount: number
  submittedAmount: number
  approvedAmount: number
  paidAmount: number
}

/* --------------------------------- Content --------------------------------- */

export interface Announcement {
  id: number
  title: string
  content: string
  priority: AnnouncementPriority
  publishDate: string
  expireDate: string | null
  isPinned: boolean
  targetType: AnnouncementTarget
  departmentId: number | null
  departmentName: string | null
  createdByName: string
  createdAt: string
  updatedAt: string | null
  state: AnnouncementState
}

export interface DocumentItem {
  id: number
  name: string
  description: string | null
  originalFileName: string
  fileType: string
  fileSize: number
  category: DocumentCategory
  departmentId: number | null
  departmentName: string | null
  accessLevel: DocumentAccessLevel
  uploadedByName: string
  createdAt: string
  updatedAt: string | null
}

/* --------------------------------- Platform -------------------------------- */

export interface NotificationItem {
  id: number
  title: string
  message: string
  type: NotificationType
  isRead: boolean
  relatedEntityId: string | null
  relatedEntityType: string | null
  createdAt: string
}

export interface AuditLogEntry {
  id: number
  userId: string | null
  userEmail: string | null
  userName: string | null
  action: string
  entityName: string
  entityId: string | null
  oldValues: string | null
  newValues: string | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

export interface Setting {
  key: string
  value: string
  category: string
  dataType: SettingDataType
  label: string
  description: string
  isAdvanced: boolean
  canEdit: boolean
  minValue: number | null
  maxValue: number | null
  updatedAt: string | null
}

export interface PublicSettings {
  companyName: string
  hasLogo: boolean
  companyEmail: string | null
  phone: string | null
  address: string | null
  timezone: string
  defaultCurrency: string
  maxUploadSizeMb: number
  allowedExtensions: string[]
}

export interface AdminUser {
  id: string
  email: string
  displayName: string
  roles: Role[]
  primaryRole: Role
  isActive: boolean
  isLocked: boolean
  lockoutEnd: string | null
  lastLoginAt: string | null
  createdAt: string
  employeeId: number | null
  employeeNumber: string | null
  departmentName: string | null
}

export interface RolesOverview {
  roles: { name: Role; description: string; userCount: number; activeUserCount: number }[]
  permissions: { area: string; permission: string; roles: Role[] }[]
}

export interface Profile {
  account: AuthUser
  lastLoginAt: string | null
  employee: EmployeeDetail | null
}

export interface SearchResults {
  query: string
  items: { type: string; id: number; title: string; subtitle: string | null; url: string }[]
}

/* --------------------------------- Reports --------------------------------- */

export type ReportType = 'employees' | 'departments' | 'projects' | 'tasks' | 'leave' | 'expenses'
export type ReportColumnType = 'Text' | 'Number' | 'Currency' | 'Date' | 'Percent' | 'Status'

export interface ReportResult {
  title: string
  description: string
  columns: { key: string; label: string; type: ReportColumnType }[]
  rows: (string | number | boolean | null)[][]
  summary: { label: string; value: string }[]
  chartTitle: string | null
  chart: ChartPoint[]
  generatedAt: string
  scope: string | null
}

/* -------------------------------- Dashboard -------------------------------- */

export interface PendingApproval {
  type: 'Leave' | 'Expense'
  id: number
  employeeName: string
  summary: string
  submittedAt: string
}

export interface Deadline {
  type: 'Task' | 'Project'
  id: number
  title: string
  context: string | null
  dueDate: string
  isOverdue: boolean
}

export interface AdminDashboard {
  stats: {
    totalEmployees: number
    activeEmployees: number
    departments: number
    activeProjects: number
    pendingLeaveRequests: number
    pendingExpenses: number
    openTasks: number
    overdueTasks: number
  }
  employeesByDepartment: ChartPoint[]
  projectsByStatus: ChartPoint[]
  tasksByStatus: ChartPoint[]
  monthlyExpenses: ChartPoint[]
  leaveUsageTrend: ChartPoint[]
  recentActivity: ActivityItem[]
  recentAnnouncements: Announcement[]
  pendingApprovals: PendingApproval[]
  upcomingDeadlines: Deadline[]
}

export interface ManagerDashboard {
  departmentId: number
  departmentName: string
  employeeCount: number
  activeProjects: number
  openTasks: number
  overdueTasks: number
  pendingLeaveApprovals: number
  pendingExpenseApprovals: number
  tasksByStatus: ChartPoint[]
  teamPerformance: {
    employeeId: number
    name: string
    positionTitle: string | null
    openTasks: number
    completedLast30Days: number
    overdueTasks: number
  }[]
  pendingApprovals: PendingApproval[]
  upcomingDeadlines: Deadline[]
  onLeaveThisWeek: LeaveCalendarEntry[]
}

export interface EmployeeDashboard {
  openTasks: number
  overdueTasks: number
  completedTasksLast30Days: number
  leaveBalance: LeaveBalance | null
  myTasks: TaskListItem[]
  recentLeaveRequests: LeaveRequest[]
  recentExpenses: Expense[]
  announcements: Announcement[]
  notifications: NotificationItem[]
  upcomingDeadlines: Deadline[]
}
