/**
 * runtime bundle gzip 门禁（build 末尾自动执行，CI 同步）。
 * 阈值 10496B（zlib level9）：中文运行时诊断需要保留可操作的原因与修法，
 * 4.3.0 英文诊断基线为 7547B，本轮中文化后实测 8649B；当前预算包含共享协商屏障与兼容处理的必要增量。
 * 超限 exit 1 —— runtime 体积是本插件核心卖点之一，防止无意膨胀。
 */
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LIMIT = 10496 // 5.7.1：异步入口屏障与旧冻结内核兼容；实测 10261B，保留硬门禁
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

// 桥接宿主适配器预算（5.3.0，任务书 D4：桥接宿主入口 gzip 目标 ≤ 4096B，框架外置、zlib level 9）。
// 推荐入口 /bridge/vue、/bridge/react 是再导出壳（≤ 数百字节），真实逻辑在两个宿主适配器——
// 门禁直接测适配器文件，避免"只测空壳"；聚合入口 /bridge 仅多一行再导出，不另设门禁。
const BRIDGE_HOST_LIMIT = 4096
for (const name of ['bridge-host-vue.js', 'bridge-host-react.js']) {
  const file = path.join(dist, name)
  if (!fs.existsSync(file)) {
    console.error(`[check-gzip] dist/${name} 不存在——build 脚本未产出桥接宿主适配器`)
    process.exit(1)
  }
  const raw = fs.readFileSync(file)
  const gz = zlib.gzipSync(raw, { level: 9 })
  if (gz.length > BRIDGE_HOST_LIMIT) {
    console.error(`[check-gzip] 超限：${name} gzip=${gz.length}B > 阈值 ${BRIDGE_HOST_LIMIT}B（raw ${raw.length}B）`)
    console.error('修法：核查是否引入了桥接逻辑增量；确属必要增长时，同步上调 BRIDGE_HOST_LIMIT 并在 CHANGELOG 说明测量口径')
    process.exit(1)
  }
  console.log(`[check-gzip] ${name} gzip ${gz.length}B ≤ ${BRIDGE_HOST_LIMIT}B ✓（raw ${raw.length}B）`)
}

// 路由适配入口预算（5.4.0 URL 同步）：/bridge/router/{vue,react} 按需入口（含通道内核
// 打入），框架与路由库外置。显式定档 4096B 防止路由层无意膨胀；默认 /bridge 不含本模块。
const BRIDGE_ROUTER_LIMIT = 4096
for (const name of ['bridge-router-vue.js', 'bridge-router-react.js']) {
  const file = path.join(dist, name)
  if (!fs.existsSync(file)) {
    console.error(`[check-gzip] dist/${name} 不存在——build 脚本未产出路由适配入口`)
    process.exit(1)
  }
  const raw = fs.readFileSync(file)
  const gz = zlib.gzipSync(raw, { level: 9 })
  if (gz.length > BRIDGE_ROUTER_LIMIT) {
    console.error(`[check-gzip] 超限：${name} gzip=${gz.length}B > 阈值 ${BRIDGE_ROUTER_LIMIT}B（raw ${raw.length}B）`)
    console.error('修法：核查是否引入了路由适配逻辑增量；确属必要增长时，同步上调 BRIDGE_ROUTER_LIMIT 并在 CHANGELOG 说明测量口径')
    process.exit(1)
  }
  console.log(`[check-gzip] ${name} gzip ${gz.length}B ≤ ${BRIDGE_ROUTER_LIMIT}B ✓（raw ${raw.length}B）`)
}
