// Regenerates the README screenshots in docs/screenshots.
// Needs the API on :5000 (fresh demo seed) and the frontend on :5173 (`vite preview` or dev).
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:5173'
const OUT = path.resolve(import.meta.dirname, '../../docs/screenshots')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--lang=en-US'] })

async function session(role, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`)
  if (role) {
    await page.getByRole('button', { name: role, exact: true }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL('**/dashboard')
  }
  return { context, page }
}

async function shot(page, route, file) {
  if (route) await page.goto(`${BASE}${route}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1800) // chart animations
  await page.screenshot({ path: path.join(OUT, file) })
  console.log('saved', file)
}

{
  const { context, page } = await session(null)
  await shot(page, null, 'login.png')
  await context.close()
}
{
  const { context, page } = await session('Admin')
  await shot(page, '/dashboard', 'admin-dashboard.png')
  await shot(page, '/employees', 'employees.png')
  await shot(page, '/employees/4', 'employee-detail.png')
  await shot(page, '/projects/1', 'project-detail.png')
  await shot(page, '/tasks/board', 'task-board.png')
  await shot(page, '/leave/approvals?tab=calendar', 'leave-calendar.png')
  await shot(page, '/expenses/approvals', 'expense-approvals.png')
  await shot(page, '/reports?type=expenses', 'reports.png')
  await shot(page, '/admin/audit-logs', 'audit-logs.png')
  await shot(page, '/admin/settings', 'settings.png')
  await context.close()
}
{
  const { context, page } = await session('Manager')
  await shot(page, '/dashboard?view=team', 'manager-dashboard.png')
  await context.close()
}
{
  const { context, page } = await session('Employee')
  await shot(page, '/dashboard', 'employee-dashboard.png')
  // Filled in but not submitted, to show the live working-day preview.
  await page.goto(`${BASE}/leave/new`)
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + ((8 - start.getUTCDay()) % 7 || 7) + 14) // a Monday a few weeks ahead
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 4)
  await page.fill('#startDate', start.toISOString().slice(0, 10))
  await page.fill('#endDate', end.toISOString().slice(0, 10))
  await page.fill('#reason', 'Family holiday')
  await shot(page, null, 'leave-request.png')
  await context.close()
}
{
  const { context, page } = await session('Employee', { width: 390, height: 844 })
  await shot(page, '/dashboard', 'mobile-dashboard.png')
  await context.close()
}

await browser.close()
