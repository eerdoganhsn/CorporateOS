import { chromium } from 'playwright-core'
import path from 'node:path'

const BASE = 'http://localhost:5173'
const SHOTS = path.resolve('shots')

const COMMON = ['/dashboard', '/profile', '/profile/security', '/projects', '/projects/1', '/tasks', '/tasks/board', '/tasks/2',
  '/leave', '/leave/new', '/expenses', '/expenses/new', '/announcements', '/announcements/1', '/documents', '/notifications']
const MANAGER = ['/employees', '/employees/4', '/departments', '/departments/1', '/positions', '/leave/approvals',
  '/leave/approvals?tab=calendar', '/leave/approvals?tab=balances', '/expenses/approvals', '/reports', '/reports?type=expenses']
const ADMIN = ['/employees/new', '/employees/4/edit', '/projects/new', '/projects/1/edit', '/admin/users', '/admin/roles', '/admin/audit-logs', '/admin/settings',
  '/dashboard?view=company']

// The UI runs in its default language (Turkish); demo-account buttons show the translated role names.
const ROLES = {
  SuperAdmin: { button: 'Süper Admin', allowed: [...COMMON, ...MANAGER, ...ADMIN], forbidden: [] },
  Admin: { button: 'Admin', allowed: [...COMMON, ...MANAGER, ...ADMIN], forbidden: [] },
  Manager: { button: 'Yönetici', allowed: [...COMMON, ...MANAGER, '/dashboard?view=team'], forbidden: ['/admin/users', '/admin/settings', '/employees/new'] },
  Employee: { button: 'Çalışan', allowed: [...COMMON, '/employees/4'], forbidden: ['/employees', '/reports', '/admin/audit-logs', '/leave/approvals'] },
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
let failures = 0

const BUTTONS = Object.fromEntries(Object.entries(ROLES).map(([role, cfg]) => [role, cfg.button]))

// A translation key rendered as text (e.g. "leave.mine.title") means a missing catalog entry.
const RAW_KEY = /\b(account|admin|audit|common|content|dashboard|employees|enums|expenses|leave|organization|projects|reports|tasks)\.[a-z][A-Za-z]*\.[A-Za-z]/

async function login(page, role) {
  await page.goto(`${BASE}/login`)
  await page.getByRole('button', { name: BUTTONS[role], exact: true }).click()
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

for (const [role, cfg] of Object.entries(ROLES)) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const problems = []
  // Browsers log every failed request as a console error without the URL, so HTTP errors are judged
  // from the response events instead: 403 is expected on forbidden routes, and the anonymous
  // /api/auth/refresh probe on the login page returns 401 by design (no session cookie yet).
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/status of (401|403)/.test(msg.text())) problems.push(`console: ${msg.text().slice(0, 200)}`)
  })
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message.slice(0, 200)}`))
  page.on('response', (res) => {
    if (res.status() >= 500) problems.push(`HTTP ${res.status()} ${res.url()}`)
    if (res.status() === 401 && !res.url().endsWith('/api/auth/refresh')) problems.push(`HTTP 401 ${res.url()}`)
  })

  await login(page, role)

  for (const route of cfg.allowed) {
    await page.goto(`${BASE}${route}`)
    await page.waitForLoadState('networkidle')
    const url = new URL(page.url())
    if (url.pathname === '/forbidden' || url.pathname === '/login' || url.pathname === '/unauthorized') problems.push(`unexpected redirect ${route} -> ${url.pathname}`)
    const errorBox = await page.getByText(/Veriler yüklenemedi|Bir şeyler ters gitti/).count()
    if (errorBox > 0) problems.push(`error state rendered on ${route}`)
    const rawKey = RAW_KEY.exec(await page.locator('body').innerText())
    if (rawKey) problems.push(`untranslated key "${rawKey[0]}" on ${route}`)
    if (role === 'Admin' || (role === 'Employee' && ['/dashboard', '/leave', '/tasks/board'].includes(route)) || (role === 'Manager' && route === '/dashboard?view=team')) {
      await page.waitForTimeout(1600) // let chart entry animations finish
      await page.screenshot({ path: path.join(SHOTS, `${role}-${route.replace(/[/?=&]/g, '_') || 'root'}.png`), fullPage: false })
    }
  }

  for (const route of cfg.forbidden) {
    await page.goto(`${BASE}${route}`)
    await page.waitForLoadState('networkidle')
    if (new URL(page.url()).pathname !== '/forbidden') problems.push(`expected /forbidden for ${route}, got ${new URL(page.url()).pathname}`)
  }

  // Session survives a full reload (refresh-token cookie -> new access token).
  await page.goto(`${BASE}/dashboard`)
  await page.reload()
  await page.waitForLoadState('networkidle')
  if (new URL(page.url()).pathname !== '/dashboard') problems.push(`session not restored after reload (${page.url()})`)

  failures += problems.length
  console.log(`${role.padEnd(10)} visited=${cfg.allowed.length + cfg.forbidden.length} problems=${problems.length}`)
  for (const p of [...new Set(problems)]) console.log(`   - ${p}`)
  await context.close()
}

/* ------------- Workflow through the UI: employee requests leave, manager approves ------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page, 'Employee')
  // Repeated runs accumulate requests, so pick a random future weekday and retry on overlap (409).
  for (let attempt = 0; attempt < 8 && !page.url().endsWith('/leave'); attempt++) {
    await page.goto(`${BASE}/leave/new`)
    const start = new Date()
    start.setDate(start.getDate() + 30 + Math.floor(Math.random() * 300))
    while (start.getDay() === 0 || start.getDay() === 6) start.setDate(start.getDate() + 1)
    const iso = start.toISOString().slice(0, 10)
    await page.selectOption('#leaveType', 'SickLeave')
    await page.fill('#startDate', iso)
    await page.fill('#endDate', iso)
    await page.fill('#reason', 'UI end-to-end check')
    await page.getByRole('button', { name: 'Talebi gönder' }).click()
    await page.waitForURL('**/leave', { timeout: 5000 }).catch(() => {})
  }
  // The list is sorted by start date, so a far-future request may not be on page 1: rely on redirect + toast.
  const submitted = page.url().endsWith('/leave') && (await page.getByText('İzin talebi gönderildi').count()) > 0
  console.log(`Workflow  employee submitted leave via UI: ${submitted ? 'OK' : 'FAIL'}`)
  if (!submitted) failures++
  await ctx.close()

  const mctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const mpage = await mctx.newPage()
  await login(mpage, 'Manager')
  await mpage.goto(`${BASE}/leave/approvals`)
  await mpage.waitForLoadState('networkidle')
  const rows = mpage.getByRole('row', { name: /UI end-to-end check/ })
  const before = await rows.count()
  let approved = false
  if (before > 0) {
    await rows.first().getByRole('button', { name: 'Onayla' }).click()
    await mpage.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click()
    await mpage.waitForTimeout(1500)
    approved = (await rows.count()) === before - 1
  }
  console.log(`Workflow  manager approved leave via UI: ${approved ? 'OK' : 'FAIL'}`)
  if (!approved) failures++
  await mpage.screenshot({ path: path.join(SHOTS, 'Manager-approvals-after.png') })
  await mctx.close()
}

/* -------- Language switch: saved to the profile, survives a reload, translates the UI -------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page, 'Employee')
  const pick = async (name) => {
    await page.getByRole('button', { name: /^(Dil|Language|Sprache)$/ }).first().click()
    await page.getByRole('menuitem', { name }).click()
  }
  const shows = (lang, navLabel) =>
    page
      .waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 5000 })
      .then(() => page.getByRole('link', { name: navLabel, exact: true }).first().waitFor({ timeout: 5000 }))
      .then(() => true, () => false)
  await pick('Deutsch')
  await page.waitForResponse((r) => r.url().endsWith('/api/profile/language'))
  await page.reload()
  const german = await shows('de', 'Aufgaben')
  await pick('English')
  const english = await shows('en', 'Tasks')
  await pick('Türkçe')
  const turkish = await shows('tr', 'Görevler')
  await page.waitForLoadState('networkidle')
  const ok = german && english && turkish
  console.log(`Language  de after reload=${german} en=${english} tr=${turkish}: ${ok ? 'OK' : 'FAIL'}`)
  if (!ok) failures++
  await ctx.close()
}

/* ------------------------- Mobile layout smoke check ------------------------- */
// Wide content (tables, task board) scrolls inside its own container; the page itself must never scroll sideways.
const MOBILE = {
  Employee: ['/dashboard', '/tasks', '/tasks/board', '/leave', '/leave/new', '/expenses', '/announcements', '/profile'],
  Admin: ['/dashboard', '/employees', '/employees/4', '/projects/1', '/leave/approvals?tab=calendar', '/reports', '/admin/settings'],
}
for (const [role, routes] of Object.entries(MOBILE)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await login(page, role)
  const overflowing = []
  for (const route of routes) {
    await page.goto(`${BASE}${route}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) overflowing.push(route)
    if (route === '/dashboard') await page.screenshot({ path: path.join(SHOTS, `Mobile-${role}-dashboard.png`) })
  }
  console.log(`Mobile    ${role.padEnd(10)} pages=${routes.length} horizontal overflow: ${overflowing.length ? overflowing.join(', ') : 'none'}`)
  failures += overflowing.length
  await ctx.close()
}

await browser.close()
console.log(`TOTAL PROBLEMS: ${failures}`)
process.exit(failures ? 1 : 0)
