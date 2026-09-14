/**
 * 截图与断言工具：每个功能验证落一张证据截图到 docs/screenshots/。
 * 命名：{环境}-{功能}-{说明}.png
 */
import type { Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const OUT_DIR = path.resolve(import.meta.dirname, '../..', 'docs/screenshots')

export async function shot(page: Page, name: string): Promise<string> {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log(`[shot] ${file}`)
  return file
}

export async function shotFull(page: Page, name: string): Promise<string> {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`[shot] ${file}`)
  return file
}

/** 统计匹配前缀的请求数（shared 单例断言用） */
export function trackRequests(page: Page, match: (url: string) => boolean) {
  const urls: string[] = []
  page.on('request', (req) => {
    if (match(req.url())) urls.push(req.url())
  })
  return urls
}
