/** CI先完成真实共享图预构建，避免首次按钮动作被Vite的依赖发现重载清掉。 */
import { chromium, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
const output = process.env.FULGURJS_CI_LOG_DIR || '/tmp/fulgurjs-ci-dev'
const browser = await chromium.launch({ args: ['--no-proxy-server'] })
const page = await browser.newPage()
const navigations = [], errors = [], steps = []
page.on('framenavigated', frame => {
  if (frame === page.mainFrame()) navigations.push({ at: Date.now(), url: frame.url() })
})
page.on('pageerror', error => errors.push(error.message))
let failure
try {
  // /multi为自动挂载页：冷预构建重载后会重新挂载，不靠重点击掩盖丢失的测试操作。
  await page.goto('http://localhost:5100/#/multi')
  await expect(page.getByTestId('slot-a').getByTestId('vue-check')).toContainText('isReactive:true', { timeout: 60_000 })
  await expect(page.getByTestId('slot-b').getByTestId('vue-check-b')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('remote-card')).toBeVisible()
  steps.push('真实双远程SFC及共享Vue就绪')
  await page.goto('http://localhost:5100/#/shared-state')
  await expect(page.getByTestId('host-count')).toHaveText('host sees: 8', { timeout: 60_000 })
  steps.push('真实Pinia共享图就绪')
  expect(errors).toEqual([])
} catch (error) {
  failure = String(error)
  throw error
} finally {
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, 'prewarm.json'), JSON.stringify({ phase: 'prewarm-not-test-round', steps, navigations, errors, failure }, null, 2))
  await browser.close()
}
