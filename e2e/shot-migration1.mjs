import { chromium } from '@playwright/test'
import fs from 'node:fs'

// 迁移阶段 1：27 页联邦模式批量截图验证（dev 8773；可导航页，12 个隐藏/带参页另行走列表动作补拍）
const OUT = '../docs/screenshots/migration1-dev'
fs.mkdirSync(OUT, { recursive: true })

const PAGES = [
  ['/flowable/bpm/task/todo', 'todo'],
  ['/flowable/bpm/task/done', 'done'],
  ['/flowable/bpm/task/my', 'my'],
  ['/flowable/bpm/task/copy', 'copy'],
  ['/flowable/bpm/task/create', 'create'],
  ['/flowable/bpm/manager/model', 'model'],
  ['/flowable/bpm/manager/form', 'form'],
  ['/flowable/bpm/manager/category', 'category'],
  ['/flowable/bpm/manager/user-group', 'user-group'],
  ['/flowable/bpm/manager/process-listener', 'process-listener'],
  ['/flowable/bpm/manager/process-expression', 'process-expression'],
  ['/flowable/bpm/manager/process-instance/manager', 'instance-manager'],
  ['/flowable/bpm/manager/definition', 'definition'],
  ['/flowable/bpm/manager/process-tasnk', 'process-tasnk'],
  ['/flowable/bpm/process-instance/report', 'report'],
  ['/lowcode/lowdev/formDesign', 'formDesign'],
  ['/lowcode/lowdev/reportDesign', 'reportDesign'],
  ['/lowcode/lowdev/graphReportDesign', 'graphReportDesign'],
  ['/lowcode/lowdev/moduleDesign', 'moduleDesign'],
]

const ctx = await chromium.launchPersistentContext('/tmp/8773-mig-profile', {
  headless: true, viewport: { width: 1440, height: 900 }, args: ['--no-proxy-server'],
})
const page = ctx.pages()[0] ?? (await ctx.newPage())

// 登录（profile 空时走一次）
await page.goto('http://localhost:8773/main/flowable/bpm/task/todo', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForTimeout(20000)
if (page.url().includes('login')) {
  await page.getByRole('textbox', { name: '账号' }).fill('admin')
  await page.getByRole('textbox', { name: '密码' }).fill('Demo@123456')
  await page.getByRole('button', { name: '登 录' }).click()
  await page.waitForTimeout(15000)
}
console.log('session ok:', page.url())

const results = []
for (const [route, name] of PAGES) {
  try {
    await page.goto(`http://localhost:8773/main${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(15000)
  } catch {}
  const rows = await page.evaluate(() => document.querySelectorAll('.el-table__body tr').length).catch(() => -1)
  const contentLen = await page.evaluate(() => (document.querySelector('[class*=layout-content]')?.innerText || '').length).catch(() => -1)
  const bodyHead = await page.evaluate(() => document.body.innerText.slice(0, 50).replace(/\n/g, ' | ')).catch(() => '')
  await page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {})
  const line = `${name} rows=${rows} contentLen=${contentLen} :: ${bodyHead}`
  results.push(line)
  console.log(line)
  fs.writeFileSync('/tmp/mig1-progress.txt', results.join('\n'))
}
console.log('ALL_MIG1_DONE')
await ctx.close()
