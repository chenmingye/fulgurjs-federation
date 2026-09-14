import { chromium } from '@playwright/test'
import fs from 'node:fs'

const ctx = await chromium.launchPersistentContext('/tmp/8661-profile', {
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: ['--no-proxy-server'],
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto('http://localhost:8661/main/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
console.log('url:', page.url())
console.log('title:', await page.title())

// 找验证码图
const captcha = page.locator('img[src^="data:image"]').first()
const hasCaptcha = await captcha.count()
console.log('captcha img found:', hasCaptcha)

// 填账密（试多个选择器）
const user = page.locator('input').nth(0)
const pass = page.locator('input[type="password"]').first()
await user.fill('admin')
await pass.fill('Demo@123456')
console.log('credentials filled')

// 截验证码给识别
if (hasCaptcha) {
  await captcha.screenshot({ path: '/tmp/login-captcha.png' })
  console.log('CAPTCHA_CAPTURED')
  // 等待识别结果文件
  for (let i = 0; i < 60; i++) {
    if (fs.existsSync('/tmp/captcha-code.txt')) break
    await page.waitForTimeout(2000)
  }
  const code = fs.readFileSync('/tmp/captcha-code.txt', 'utf8').trim()
  console.log('captcha code from file:', code)
  await page.locator('input').nth(2).fill(code).catch(async () => {
    // 找未填的文本输入框
    const inputs = page.locator('input:visible')
    const n = await inputs.count()
    for (let i = 0; i < n; i++) {
      const el = inputs.nth(i)
      const type = await el.getAttribute('type')
      const val = await el.inputValue()
      if (type !== 'password' && !val) { await el.fill(code); break }
    }
  })
}
// 提交
await page.locator('button:has-text("登")').first().click()
await page.waitForTimeout(8000)
console.log('after login url:', page.url())
fs.writeFileSync('/tmp/8661-login-result.txt', page.url())
await ctx.close()
