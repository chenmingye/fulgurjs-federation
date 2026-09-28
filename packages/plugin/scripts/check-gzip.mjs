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
const dist = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'dist')
const file = path.join(dist, 'runtime.js')
// React 适配器预算（5.1.0）：任务书建议 3072B，实测 3538B——差值全部来自两条中文三段式
// 诊断文案（与 runtime.js 同一「中文诊断保留可操作性」口径）+ timeout/retry/代次守卫状态机。
// 显式定档 4096B（zlib level9，external react 剔除后）；超限退出码 1，与 runtime 同级硬门禁。
const REACT_ADAPTER_LIMIT = 4096
const reactAdapter = path.join(dist, 'react-adapter.js')

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

if (fs.existsSync(reactAdapter)) {
  const raRaw = fs.readFileSync(reactAdapter)
  const raGz = zlib.gzipSync(raRaw, { level: 9 })
  if (raGz.length > REACT_ADAPTER_LIMIT) {
    console.error(`[check-gzip] 超限：react-adapter.js gzip=${raGz.length}B > 阈值 ${REACT_ADAPTER_LIMIT}B（raw ${raRaw.length}B）`)
    console.error('修法：核查是否引入了适配器逻辑增量；确属必要增长时，同步上调 REACT_ADAPTER_LIMIT 并在 CHANGELOG 说明测量口径')
    process.exit(1)
  }
  console.log(`[check-gzip] react-adapter.js gzip ${raGz.length}B ≤ ${REACT_ADAPTER_LIMIT}B ✓（raw ${raRaw.length}B）`)
}
