// 功能实测：列表页真实路径进入（点按钮）→ 弹窗 → 搜索
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const BASE = 'http://localhost:8662'
const DIR = '/tmp/probe-func'; fs.mkdirSync(DIR, { recursive: true })
const browser = await chromium.launchPersistentContext(`/tmp/pfunc-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 } })
const page = browser.pages()[0]
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)))
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)

const measure = () =>
  page.evaluate(() => {
    const c = document.querySelector('.jeecg-layout-content')
    const form = document.querySelector('.jeecg-layout-content form, .jeecg-layout-content .el-form, .jeecg-layout-content .ant-form')
    const pane = document.querySelector('.jeecg-layout-content .el-tab-pane, .jeecg-layout-content .ant-tabs-tabpane')
    const rect = (el) => (el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null)
    return {
      contentLen: c ? c.innerText.trim().length : -1,
      inputs: document.querySelectorAll('.jeecg-layout-content input:not([type=hidden])').length,
      visibleInputs: [...document.querySelectorAll('.jeecg-layout-content input:not([type=hidden])')].filter((i) => i.getBoundingClientRect().height > 0).length,
      formRect: rect(form), paneRect: rect(pane),
      formDisplay: form ? getComputedStyle(form).display : null,
      paneHeight: pane ? getComputedStyle(pane).height : null,
    }
  })

// A. 流程模型列表 → 新建模型
await page.goto(`${BASE}/flowable/bpm/manager/model`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(14000)
await page.screenshot({ path: `${DIR}/A1-model-list.png` })
const r1 = await page.locator('button:has-text("新建模型"), span:has-text("新建模型")').first().click({ timeout: 8000 }).then(() => true).catch(() => false)
await page.waitForTimeout(12000)
console.log('A 新建模型 clicked:', r1, '| url:', page.url())
console.log('A measure:', JSON.stringify(await measure()))
await page.screenshot({ path: `${DIR}/A2-model-create-from-list.png` })

// B. 流程模型列表 → 首行"修改"
await page.goto(`${BASE}/flowable/bpm/manager/model`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(14000)
const r2 = await page.locator('.el-table__body tr.el-table__row').first().locator('a:has-text("修改"), span:has-text("修改"), button:has-text("修改")').first().click({ timeout: 8000 }).then(() => true).catch((e) => { console.log('修改 err', e.message.slice(0, 60)); return false })
await page.waitForTimeout(12000)
console.log('B 修改 clicked:', r2, '| url:', page.url())
console.log('B measure:', JSON.stringify(await measure()))
await page.screenshot({ path: `${DIR}/B2-model-update-from-list.png` })

// C. 流程分类列表 → 新增（页内弹窗）
await page.goto(`${BASE}/flowable/bpm/manager/category`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(13000)
const r3 = await page.locator('button:has-text("新增"), span:has-text("新增")').first().click({ timeout: 8000 }).then(() => true).catch(() => false)
await page.waitForTimeout(4000)
const modalInfo = await page.evaluate(() => {
  const m = document.querySelector('.ant-modal-wrap:not([style*="display: none"]), .el-dialog__wrapper:not([style*="display: none"]), .ant-modal, .el-dialog')
  return { modalVisible: !!m, modalText: m ? m.innerText.trim().slice(0, 120) : null, modalInputs: document.querySelectorAll('.ant-modal input, .el-dialog input').length }
})
console.log('C 新增 clicked:', r3, '| modal:', JSON.stringify(modalInfo))
await page.screenshot({ path: `${DIR}/C2-category-add-modal.png` })

// D. 待办任务搜索
await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(13000)
const before = await page.locator('.el-table__body tr.el-table__row').count()
const r4 = await page.locator('button:has-text("搜索")').first().click({ timeout: 8000 }).then(() => true).catch(() => false)
await page.waitForTimeout(5000)
const after = await page.locator('.el-table__body tr.el-table__row').count()
console.log('D 搜索 clicked:', r4, '| rows before/after:', before, after)
console.log('pageErrors:', [...new Set(errs)].slice(0, 4))
await browser.close()
