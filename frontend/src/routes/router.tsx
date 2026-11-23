import { lazy } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { AppLayout } from '@/layouts/app-layout'
import { AuthLayout } from '@/layouts/auth-layout'
import { ForbiddenPage, NotFoundPage, UnauthorizedPage } from '@/pages/errors/error-pages'
import { ADMIN_ROLES, MANAGER_ROLES } from '@/store/auth-store'
import { AuthBootstrap, RedirectIfAuthenticated, RequireAuth, RequireRole } from './guards'

// Route-level code splitting: each page is loaded on first visit.
const LoginPage = lazy(() => import('@/pages/auth/login-page'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/password-pages').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('@/pages/auth/password-pages').then((m) => ({ default: m.ResetPasswordPage })))
const DashboardPage = lazy(() => import('@/pages/dashboard/dashboard-page'))
const ProfilePage = lazy(() => import('@/pages/profile/profile-page'))
const SecurityPage = lazy(() => import('@/pages/profile/security-page'))
const EmployeesListPage = lazy(() => import('@/pages/employees/employees-list-page'))
const EmployeeFormPage = lazy(() => import('@/pages/employees/employee-form-page'))
const EmployeeDetailPage = lazy(() => import('@/pages/employees/employee-detail-page'))
const DepartmentsListPage = lazy(() => import('@/pages/departments/departments-list-page'))
const DepartmentDetailPage = lazy(() => import('@/pages/departments/department-detail-page'))
const PositionsPage = lazy(() => import('@/pages/positions/positions-page'))
const ProjectsListPage = lazy(() => import('@/pages/projects/projects-list-page'))
const ProjectFormPage = lazy(() => import('@/pages/projects/project-form-page'))
const ProjectDetailPage = lazy(() => import('@/pages/projects/project-detail-page'))
const TasksListPage = lazy(() => import('@/pages/tasks/tasks-list-page'))
const TaskBoardPage = lazy(() => import('@/pages/tasks/task-board-page'))
const TaskDetailPage = lazy(() => import('@/pages/tasks/task-detail-page'))
const MyLeavePage = lazy(() => import('@/pages/leave/my-leave-page'))
const NewLeavePage = lazy(() => import('@/pages/leave/new-leave-page'))
const LeaveApprovalsPage = lazy(() => import('@/pages/leave/leave-approvals-page'))
const MyExpensesPage = lazy(() => import('@/pages/expenses/my-expenses-page'))
const ExpenseFormPage = lazy(() => import('@/pages/expenses/expense-form-page'))
const ExpenseApprovalsPage = lazy(() => import('@/pages/expenses/expense-approvals-page'))
const AnnouncementsPage = lazy(() => import('@/pages/announcements/announcements-page'))
const AnnouncementDetailPage = lazy(() => import('@/pages/announcements/announcement-detail-page'))
const DocumentsPage = lazy(() => import('@/pages/documents/documents-page'))
const NotificationsPage = lazy(() => import('@/pages/notifications/notifications-page'))
const ReportsPage = lazy(() => import('@/pages/reports/reports-page'))
const UsersPage = lazy(() => import('@/pages/admin/users-page'))
const RolesPage = lazy(() => import('@/pages/admin/roles-page'))
const AuditLogsPage = lazy(() => import('@/pages/admin/audit-logs-page'))
const SettingsPage = lazy(() => import('@/pages/admin/settings-page'))

function Root() {
  return (
    <AuthBootstrap>
      <Outlet />
    </AuthBootstrap>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <RedirectIfAuthenticated />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: '/login', element: <LoginPage /> },
              { path: '/forgot-password', element: <ForgotPasswordPage /> },
              { path: '/reset-password', element: <ResetPasswordPage /> },
            ],
          },
        ],
      },
      { path: '/unauthorized', element: <UnauthorizedPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <Navigate to="/dashboard" replace /> },
              { path: '/dashboard', element: <DashboardPage /> },
              { path: '/profile', element: <ProfilePage /> },
              { path: '/profile/security', element: <SecurityPage /> },

              // Employee detail is reachable by the employee themself; the API scopes access.
              { path: '/employees/:id', element: <EmployeeDetailPage /> },

              { path: '/projects', element: <ProjectsListPage /> },
              { path: '/projects/:id', element: <ProjectDetailPage /> },
              { path: '/projects/:id/edit', element: <ProjectFormPage /> },
              { path: '/tasks', element: <TasksListPage /> },
              { path: '/tasks/board', element: <TaskBoardPage /> },
              { path: '/tasks/:id', element: <TaskDetailPage /> },

              { path: '/leave', element: <MyLeavePage /> },
              { path: '/leave/new', element: <NewLeavePage /> },
              { path: '/expenses', element: <MyExpensesPage /> },
              { path: '/expenses/new', element: <ExpenseFormPage /> },
              { path: '/expenses/:id/edit', element: <ExpenseFormPage /> },

              { path: '/announcements', element: <AnnouncementsPage /> },
              { path: '/announcements/:id', element: <AnnouncementDetailPage /> },
              { path: '/documents', element: <DocumentsPage /> },
              { path: '/notifications', element: <NotificationsPage /> },
              { path: '/forbidden', element: <ForbiddenPage /> },

              {
                element: <RequireRole roles={MANAGER_ROLES} />,
                children: [
                  { path: '/employees', element: <EmployeesListPage /> },
                  { path: '/departments', element: <DepartmentsListPage /> },
                  { path: '/departments/:id', element: <DepartmentDetailPage /> },
                  { path: '/positions', element: <PositionsPage /> },
                  { path: '/leave/approvals', element: <LeaveApprovalsPage /> },
                  { path: '/expenses/approvals', element: <ExpenseApprovalsPage /> },
                  { path: '/reports', element: <ReportsPage /> },
                ],
              },
              {
                element: <RequireRole roles={ADMIN_ROLES} />,
                children: [
                  { path: '/employees/new', element: <EmployeeFormPage /> },
                  { path: '/employees/:id/edit', element: <EmployeeFormPage /> },
                  { path: '/projects/new', element: <ProjectFormPage /> },
                  { path: '/admin', element: <Navigate to="/admin/users" replace /> },
                  { path: '/admin/users', element: <UsersPage /> },
                  { path: '/admin/roles', element: <RolesPage /> },
                  { path: '/admin/audit-logs', element: <AuditLogsPage /> },
                  { path: '/admin/settings', element: <SettingsPage /> },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
])
