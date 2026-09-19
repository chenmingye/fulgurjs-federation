#!/usr/bin/env node
// D.5 防漂移校验：CODE_REGISTRY（src/diagnostics.ts）与 runtime ErrorCodes（src/runtime/errors.ts）
// 中的每个错误码必须在 docs/manual.html §8 有对应条目，缺失则非零退出。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(pluginRoot, '../..')
const diag = fs.readFileSync(path.join(pluginRoot, 'src/diagnostics.ts'), 'utf8')
const runtime = fs.readFileSync(path.join(pluginRoot, 'src/runtime/errors.ts'), 'utf8')
const manual = fs.readFileSync(path.join(root, 'docs/manual.html'), 'utf8')

const codes = new Set()
for (const m of diag.matchAll(/code: '(CFG-\d{3}|DEV-\d{3}|BLD-\d{3}|MFU-\d{3})'/g)) codes.add(m[1])
for (const m of runtime.matchAll(/'(MFU-\d{3})'/g)) codes.add(m[1])

const missing = [...codes].filter((c) => !manual.includes(c))
if (missing.length) {
  console.error(`[fulgurjs] 手册 §8 缺少以下错误码的条目：${missing.join('、')}`)
  process.exit(1)
}
console.log(`[fulgurjs] 手册 §8 码表一致（${codes.size} 个错误码全部有文档）`)
