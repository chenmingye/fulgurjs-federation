/**
 * 容错专项与 HMR L3：
 * - B-15 容错：独立 remote（5199）kill → MFU-001 错误码 → 重启 → 自动恢复
 * - HMR L3：remote 编译报错 → 错误覆盖层 → 修复 → 自动恢复
 */
import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { shot } from './helpers'

const HOST = 'http://localhost:5100'
const PORT = 5199

async function startRemote(): Promise<ReturnType<typeof spawn>> {
  const child = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort', '--config', 'vite.config.standalone.ts'], {
    cwd: '../fixtures/remote-a',
    stdio: 'ignore',
    detached: true,
  })
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/@fulgur-manifest.json`, { signal: AbortSignal.timeout(500) })
      if (res.ok) return child
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('standalone remote failed to start')
}

function stopRemote(child: ReturnType<typeof spawn>) {
  try {
    if (child.pid) process.kill(-child.pid)
  } catch {}
}

test.describe('容错专项（B-15 完整链路）', () => {
  test('kill remote → MFU-001 → 重启 → 恢复', async ({ page }) => {
    let child = await startRemote()
    try {
      await page.goto(`${HOST}/#/`)
      // 运行时动态注册独立 remote 并加载成功（名称与容器自报名一致）
      await page.evaluate(async (port) => {
        const rt = (window as any).__FULGUR_RUNTIME__
        rt.registerRemote({ name: 'remote-a-sa', entry: `http://localhost:${port}/@fulgur-entry.js` })
      }, PORT)
      const ns1 = await page.evaluate(async () => {
        const m = await (window as any).__FULGUR_RUNTIME__.loadRemote('remote-a-sa/utils')
        return m.ANSWER
      })
      expect(ns1).toBe(42)
      await shot(page, 'dev-fault-standalone-loaded')

      // kill remote server → 加载一个未缓存的新模块 → 失败，错误码 MFU-001
      stopRemote(child)
      await page.waitForTimeout(500)
      const err = await page.evaluate(async () => {
        const rt = (window as any).__FULGUR_RUNTIME__
        try {
          await rt.loadRemote('remote-a-sa/Button')
          return 'NO ERROR (unexpected)'
        } catch (e: any) {
          return `${e.code ?? 'UNKNOWN'}: ${String(e.message).slice(0, 80)}`
        }
      })
      expect(err).toContain('MFU-001')
      await shot(page, 'dev-fault-remote-killed-mfu001')

      // 重启 remote → 恢复加载（5199 的 vite client 重连会触发页面重载，注册需重建）
      child = await startRemote()
      await page.waitForTimeout(1500)
      const ns2 = await page.evaluate(async (port) => {
        const rt = (window as any).__FULGUR_RUNTIME__
        rt.registerRemote({ name: 'remote-a-sa', entry: `http://localhost:${port}/@fulgur-entry.js` })
        const m = await rt.loadRemote('remote-a-sa/Button')
        return typeof m.default
      }, PORT)
      expect(ns2).toBe('object')
      await shot(page, 'dev-fault-recovered')
    } finally {
      stopRemote(child)
    }
  })
})

test.describe('HMR L3：编译报错 → 覆盖层 → 修复自动恢复', () => {
  test('remote 语法错误覆盖层出现并消失', async ({ page }) => {
    await page.goto(`${HOST}/#/`)
    await page.getByTestId('load-btn').click()
    await expect(page.getByTestId('remote-btn')).toBeVisible()

    const fs2 = fs
    const buttonSrc = '../fixtures/remote-a/src/exposes/Button.vue'
    const original = fs2.readFileSync(buttonSrc, 'utf8')
    try {
      // 注入模板语法错误
      fs2.writeFileSync(buttonSrc, original.replace('</button>', '</broken>'))
      // remote 的 vite client 在宿主页面内弹出错误覆盖层
      await expect(page.locator('vite-error-overlay')).toBeVisible({ timeout: 15000 })
      await shot(page, 'dev-hmr-l3-error-overlay')
      // 修复 → 覆盖层消失，组件恢复
      fs2.writeFileSync(buttonSrc, original)
      await expect(page.locator('vite-error-overlay')).toHaveCount(0, { timeout: 15000 })
      await expect(page.getByTestId('remote-btn')).toBeVisible()
      await shot(page, 'dev-hmr-l3-recovered')
    } finally {
      fs2.writeFileSync(buttonSrc, original)
    }
  })
})
