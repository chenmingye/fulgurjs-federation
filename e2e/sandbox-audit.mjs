// 沙箱边界审计：CSS / 全局变量 / 公共依赖实例 三个维度的实测
// 用法：node sandbox-audit.mjs --base <url>
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:8773')

const browser = await chromium.launchPersistentContext(`/tmp/psbx-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]

// ========== 基线：仅登录页（未加载任何联邦子应用） ==========
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await robustLogin()
await page.waitForTimeout(3000)
// 打开一个纯宿主页（首页），采基线
await page.goto(`${BASE}/main/dashboard/analysis`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(8000)

const baseline = await page.evaluate(() => {
  const winKeys = Object.keys(window).filter((k) =>
    !['webkitStorageInfo', 'chrome', 'location', 'top', 'self', 'window', 'document', 'frames', 'parent', 'external', 'origin', 'closed', 'length', 'status', 'name', 'history', 'navigator', 'screen', 'visualViewport', 'styleMedia', 'onload', 'onbeforeunload', 'crypto', 'indexedDB', 'sessionStorage', 'localStorage', 'performance', 'console', 'devicePixelRatio', 'innerWidth', 'innerHeight', 'scrollX', 'pageXOffset', 'innerWidth'].includes(k))
  return {
    winKeys: winKeys.slice(0, 200),
    styleSheetCount: document.styleSheets.length,
    elPrimary: getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary').trim(),
    elFonts: getComputedStyle(document.documentElement).getPropertyValue('--el-font-size-base').trim(),
    vueVersion: null,
    unifedScope: !!window.__FULGUR_SCOPE__,
  }
})
console.log('基线(纯宿主): styleSheets=' + baseline.styleSheetCount, 'el-primary=' + baseline.elPrimary, 'window新增键=' + baseline.winKeys.length)

// ========== 加载联邦子应用页面（bpm 待办 + lowcode 表单设计） ==========
await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(15000)
await page.goto(`${BASE}/lowcode/lowdev/formDesign`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(18000)

const after = await page.evaluate(() => {
  return {
    styleSheetCount: document.styleSheets.length,
    elPrimary: getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary').trim(),
    // 页面上任取一个元素，看它实例所属的 vue 版本（联邦单例证明）
    unifedScopes: window.__FULGUR_SCOPE__ ? Object.keys(window.__FULGUR_SCOPE__) : [],
    unifedInfo: window.__FULGUR_INFO__ ? Object.keys(window.__FULGUR_INFO__) : [],
    // element-plus 的 CSS 规则来源统计（多版本共存证据）
    elCssFiles: [...document.styleSheets]
      .map((s) => (s.href || '').split('/').slice(-1)[0])
      .filter((h) => h && (h.includes('element-plus') || h.includes('el-')))
      .slice(0, 20),
  }
})

// window 新增键 diff（需要基线键列表传进去）
const winDiff = await page.evaluate((baseKeys) => {
  return Object.keys(window).filter((k) => !baseKeys.includes(k))
}, baseline.winKeys)
const winDiffClean = winDiff.filter((k) => !['0', '1', '2'].includes(k)).slice(0, 40)

console.log('\n===== 沙箱边界审计结果 =====')
console.log('1) CSS:', {
  加载样式表数: baseline.styleSheetCount + ' → ' + after.styleSheetCount,
  '新增样式表': after.styleSheetCount - baseline.styleSheetCount,
  ':root --el-color-primary': baseline.elPrimary + ' → ' + after.elPrimary,
  'element-plus CSS 文件(多版本共存证据)': after.elCssFiles.slice(0, 8),
})
console.log('2) window 全局:', {
  基线新增键: baseline.winKeys.length,
  '联邦加载后新增键(截取)': winDiffClean,
  __FULGUR_SCOPE__: after.unifedScopes,
})
console.log('3) 联邦注册面:', JSON.stringify(after.unifedInfo))
await browser.close()
