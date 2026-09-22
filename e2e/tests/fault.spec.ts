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
  // unref：不引用计数，子进程不得吊住 worker 事件循环——否则启动失败时 CI 步骤会永久挂起
  // （2026-09-22 CI 实测：detached 子进程未回收 → 步骤 40 分钟不退出）
  child.unref()
  child.on('error', () => {})
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/@fulgurjs-manifest.json`, { signal: AbortSignal.timeout(500) })
      if (res.ok) return child
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  stopRemote(child) // 起不来也要收回，避免留一个占住 5199 的孤儿进程
  throw new Error('standalone remote failed to start')
}

function stopRemote(child: ReturnType<typeof spawn>) {
  try {
    if (child.pid) process.kill(-child.pid)
  } catch {}
}

/** 等 standalone remote 真正停止监听：SIGTERM 到端口释放有延迟，固定等待会偶发"仍在响应" */
async function waitRemoteDown(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://localhost:${PORT}/@fulgurjs-manifest.json`, { signal: AbortSignal.timeout(300) })
    } catch {
      return // 连不上了 = 已停
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('standalone remote did not stop listening')
}

test.describe('容错专项（B-15 完整链路）', () => {
  test('kill remote → MFU-001 → 重启 → 恢复', async ({ page }) => {
    // child 的取得放在 try 内：startRemote 抛错时不至于漏掉回收路径
    let child: ReturnType<typeof spawn> | undefined
    try {
      child = await startRemote()
      await page.goto(`${HOST}/#/`)
      // 运行时动态注册独立 remote 并加载成功（名称与容器自报名一致）
      await page.evaluate(async (port) => {
        const rt = (window as any).__FULGURJS_RUNTIME__
        rt.registerRemote({ name: 'remote-a-sa', entry: `http://localhost:${port}/@fulgurjs-entry.js` })
      }, PORT)
      const ns1 = await page.evaluate(async () => {
        const m = await (window as any).__FULGURJS_RUNTIME__.loadRemote('remote-a-sa/utils')
        return m.ANSWER
      })
      expect(ns1).toBe(42)
      await shot(page, 'dev-fault-standalone-loaded')

      // kill remote server → 加载一个未缓存的新模块 → 失败，错误码 MFU-001
      stopRemote(child)
      await waitRemoteDown()
      // 掉线/重连会让宿主页内 5199 的 vite client 触发整页重载，运行时随页重建、注册丢失
      // （实测不处理会命中 MFU-008 未注册，而非本用例要验的 MFU-001 加载失败）。
      // 故：等 remote 停稳后重开页面拿到确定状态，注册与加载放在同一次 evaluate 内，消除重载窗口。
      await page.goto(`${HOST}/#/`)
      const err = await page.evaluate(async (port) => {
        const rt = (window as any).__FULGURJS_RUNTIME__
        rt.registerRemote({ name: 'remote-a-sa', entry: `http://localhost:${port}/@fulgurjs-entry.js` })
        try {
          await rt.loadRemote('remote-a-sa/Button')
          return 'NO ERROR (unexpected)'
        } catch (e: any) {
          return `${e.code ?? 'UNKNOWN'}: ${String(e.message).slice(0, 80)}`
        }
      }, PORT)
      expect(err).toContain('MFU-001')
      await shot(page, 'dev-fault-remote-killed-mfu001')

      // 重启 remote → 恢复加载（5199 的 vite client 重连会触发页面重载，注册需重建）
      child = await startRemote()
      // 重开页面再断言：上面刻意制造的加载失败会在浏览器侧留下失败痕迹（同页重试会秒失败，
      // 实测服务端 500ms 即可服务）——重开页面拿干净状态，恢复路径才是真的在验"remote 回来后能加载"。
      await page.goto(`${HOST}/#/`)
      const net: string[] = []
      page.on('response', (r) => {
        if (r.url().includes(`:${PORT}`)) net.push(`RESP ${r.status()}`)
      })
      page.on('requestfailed', (r) => {
        if (r.url().includes(`:${PORT}`)) net.push(`FAIL ${r.failure()?.errorText}`)
      })
      let ns2 = ''
      const diag: string[] = []
      for (let i = 0; i < 10 && ns2 !== 'object'; i++) {
        try {
          ns2 = await page.evaluate(async (port) => {
            const rt = (window as any).__FULGURJS_RUNTIME__
            rt.registerRemote({ name: 'remote-a-sa', entry: `http://localhost:${port}/@fulgurjs-entry.js` })
            const m = await rt.loadRemote('remote-a-sa/Button')
            return typeof m.default
          }, PORT)
          diag.push(`#${i} ok=${ns2}`)
        } catch (e: any) {
          ns2 = ''
          diag.push(`#${i} ${String(e?.message ?? e).slice(0, 120)}`)
        }
        if (ns2 !== 'object') await page.waitForTimeout(1000)
      }
      // 仅失败时输出：重启时序偶发（见上），留证便于下次排障
      if (ns2 !== 'object') {
        console.log(`[fault-diag] ${diag.join(' | ')}`)
        console.log(`[fault-net] ${net.slice(-12).join(' | ')}`)
      }
      expect(ns2).toBe('object')
      await shot(page, 'dev-fault-recovered')
    } finally {
      if (child) stopRemote(child)
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
