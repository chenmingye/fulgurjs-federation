/**
 * runtime bundle gzip 门禁（build 末尾自动执行，CI 同步）。
 * 阈值 10752B（zlib level9）：中文运行时诊断需要保留可操作的原因与修法。
 * 历史基线：4.3.0 英文 7547B → 中文化 8649B → 共享协商屏障 10273B（阈值 10496B）。
 * 6.6.0：setup pageProviders 契约（数组校验+消费方交付）实测 10597B，阈值上调至 10752B（CHANGELOG 已说明）。
 * 6.13.0：P02 MFU-001 重包装保留 cause + P03 expose/setup 通知与全页去重实测 10845B，阈值上调至 10912B。
 * 超限 exit 1 —— runtime 体积是本插件核心卖点之一，防止无意膨胀。
 */
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LIMIT = 10912 // 6.13.0：P02 cause 保留 + P03 统一通知与全页去重；实测 10845B，保留硬门禁余量
const dist = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'dist')
const file = path.join(dist, 'runtime.js')
// React 适配器预算（5.1.0）：任务书建议 3072B，实测 3538B——差值全部来自两条中文三段式
// 诊断文案（与 runtime.js 同一「中文诊断保留可操作性」口径）+ timeout/retry/代次守卫状态机。
// 显式定档 4096B（zlib level9，external react 剔除后）；超限退出码 1，与 runtime 同级硬门禁。
const REACT_ADAPTER_LIMIT = 4360 // 6.13.0：P01/P03 渲染错误观测上报（MFU-020）；实测 4318B，保留硬门禁余量
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

// 路由适配入口预算（5.4.0 URL 同步）：路由同步模块（含通道内核打入），框架与路由库外置。
// 显式定档防止路由层无意膨胀。6.0.0 上调 4096→4352B：/react 统一入口要求 react-router-dom
// 成为可选依赖（react-router-dom 值导入改为模块级按需预热 + 未就绪惰性宿主 + 空 chunk 形状
// 校验），该合同增量实测 4143B（zlib level9）；CHANGELOG 记录同口径。
// 6.6.0 上调 4352→4736B：接线入口统一 MFU-034（宿主未提供路由通道，替代项目手写守卫）；
// react 侧 chunk 首次引入 bridge-errors 的该条错误文案，实测 4590B（vue 侧 3676B）。
const BRIDGE_ROUTER_LIMIT = 4736
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
