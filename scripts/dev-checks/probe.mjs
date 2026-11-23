import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage()
page.on('console', (m) => console.log(`[console.${m.type()}] ${m.text().slice(0, 400)}`))
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`))
page.on('requestfailed', (r) => console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`))
page.on('response', (r) => { if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`) })
await page.goto('http://localhost:5173/login')
await page.waitForTimeout(4000)
console.log('URL:', page.url())
console.log('BODY:', (await page.locator('body').innerText()).slice(0, 300))
await page.screenshot({ path: 'shots/probe-login.png' })
await browser.close()
