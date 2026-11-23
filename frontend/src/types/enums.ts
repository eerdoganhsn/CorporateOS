/* String unions mirror the backend enums (serialized as strings). */

export const ROLES = ['SuperAdmin', 'Admin', 'Manager', 'Employee'] as const
export type Role = (typeof ROLES)[number]

export const RECORD_STATUSES = ['Active', 'Inactive'] as const
export type RecordStatus = (typeof RECORD_STATUSES)[number]

export const EMPLOYMENT_TYPES = ['FullTime', 'PartTime', 'Contractor', 'Intern'] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

export const EMPLOYEE_STATUSES = ['Active', 'Inactive', 'OnLeave', 'Terminated'] as const
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number]

export const POSITION_LEVELS = ['Intern', 'Junior', 'Mid', 'Senior', 'Lead', 'Manager', 'Director', 'Executive'] as const
export type PositionLevel = (typeof POSITION_LEVELS)[number]

export const PROJECT_STATUSES = ['Planning', 'Active', 'OnHold', 'Completed', 'Cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const
export type Priority = (typeof PRIORITIES)[number]

export const TASK_STATUSES = ['Todo', 'InProgress', 'Review', 'Completed', 'Cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const LEAVE_TYPES = [
  'AnnualLeave',
  'SickLeave',
  'UnpaidLeave',
  'MaternityLeave',
  'PaternityLeave',
  'Other',
] as const
export type LeaveType = (typeof LEAVE_TYPES)[number]

export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'] as const
export type LeaveStatus = (typeof LEAVE_STATUSES)[number]

export const EXPENSE_CATEGORIES = [
  'Travel',
  'Meal',
  'Accommodation',
  'Transportation',
  'Office',
  'Equipment',
  'Other',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const EXPENSE_STATUSES = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Paid'] as const
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number]

export const ANNOUNCEMENT_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number]

export const ANNOUNCEMENT_TARGETS = ['AllEmployees', 'SpecificDepartment', 'ManagersOnly'] as const
export type AnnouncementTarget = (typeof ANNOUNCEMENT_TARGETS)[number]

export type AnnouncementState = 'Scheduled' | 'Active' | 'Expired'

export const DOCUMENT_CATEGORIES = ['HR', 'Policy', 'Procedure', 'Finance', 'Project', 'General'] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export const DOCUMENT_ACCESS_LEVELS = ['AllEmployees', 'Managers', 'DepartmentOnly', 'AdminOnly'] as const
export type DocumentAccessLevel = (typeof DOCUMENT_ACCESS_LEVELS)[number]

export type NotificationType =
  | 'System'
  | 'TaskAssigned'
  | 'TaskDueSoon'
  | 'TaskStatusChanged'
  | 'TaskComment'
  | 'LeaveSubmitted'
  | 'LeaveApproved'
  | 'LeaveRejected'
  | 'ExpenseSubmitted'
  | 'ExpenseApproved'
  | 'ExpenseRejected'
  | 'ExpensePaid'
  | 'AnnouncementPublished'
  | 'ProjectAssignment'
  | 'DocumentShared'

export type RequestListScope = 'Mine' | 'Approvals' | 'All'

export type SettingDataType = 'String' | 'Integer' | 'Boolean'
