/**
 * Jason.chen — export the canonical architecture SVGs for Markdown viewers.
 * Uses the existing e2e Playwright installation; no separate rendering dependency.
 * Export light-theme PNGs at 2× resolution. SVG and HTML retain adaptive themes.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const directory = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(new URL('../../e2e/package.json', import.meta.url))
const { chromium } = require('@playwright/test')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'light' })
  for (const language of ['zh', 'en']) {
    for (const figure of ['overview', 'loading', 'lifecycle']) {
      const basename = `${figure}.${language}`
      const svg = await fs.readFile(path.join(directory, `${basename}.svg`), 'utf8')
      // An HTML wrapper avoids Chromium's standalone-SVG screenshot limitation.
      await page.setContent(`<style>body{margin:0}svg{display:block}</style>${svg}`)
      await page.locator('svg').screenshot({ path: path.join(directory, `${basename}.png`), timeout: 15000 })
      console.log(`Exported ${basename}.png`)
    }
  }
} finally {
  await browser.close()
}
