/**
 * runtime bundle gzip 门禁（build 末尾自动执行，CI 同步）。
 * 阈值 9216B（zlib level9）：中文运行时诊断需要保留可操作的原因与修法，
 * 4.3.0 英文诊断基线为 7547B，本轮中文化后实测 8649B；仍以 9KB 门禁约束增长。
 * 超限 exit 1 —— runtime 体积是本插件核心卖点之一，防止无意膨胀。
 */
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LIMIT = 9216
const file = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'dist', 'runtime.js')

if (!fs.existsSync(file)) {
  console.error('[check-gzip] dist/runtime.js 不存在——先 build')
  process.exit(1)
}

const raw = fs.readFileSync(file)
const gz = zlib.gzipSync(raw, { level: 9 })
const kb = (n) => (n / 1024).toFixed(2) + 'KB'

if (gz.length > LIMIT) {
  console.error(`[check-gzip] 超限：runtime.js gzip=${gz.length}B > 阈值 ${LIMIT}B（raw ${raw.length}B）`)
  console.error('修法：核查本次改动是否引入了 runtime 逻辑增量；确属必要增长时，同步上调本脚本与 version.ts 注释的阈值并在 CHANGELOG 说明')
  process.exit(1)
}
console.log(`[check-gzip] runtime.js gzip ${gz.length}B ≤ ${LIMIT}B ✓（raw ${raw.length}B）`)
