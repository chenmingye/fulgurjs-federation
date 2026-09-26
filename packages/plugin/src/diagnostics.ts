/**
 * D.5 全链路错误诊断体系（node 侧：CFG/DEV/BLD 段 + 码表 + 文案生成器）
 *
 * 码表分两处定义，本模块登记供文档一致性校验：
 * - 运行时段（MFU-0xx）定义在 runtime/errors.ts（浏览器 bundle，保持精简）；
 * - 跨应用上下文段（CC-0xx）定义在 context.ts（子路径独立 bundle，保持精简）。
 * CODE_REGISTRY 是二者的权威清单，scripts/check-manual-codes.mjs 消费它做
 * 「源码定义 ⊆ 登记表 = README 错误码总表」三方防漂移校验。
 *
 * 三段式强制：现象 → 根因 → 修法；ERROR 级文案必须 cause/fix 非空（单测断言）。
 */

import path from 'node:path'

export type FulgurjsStage = 'CFG' | 'DEV' | 'BLD' | 'MFU' | 'CC'

export interface FulgurjsCodeMeta {
  code: string
  stage: FulgurjsStage
  title: string
}

/** 全量错误码登记表（README 错误码总表与之一一对应；新增报错必须先登记） */
export const CODE_REGISTRY: FulgurjsCodeMeta[] = [
  // ── CFG 配置期（normalizeOptions）──
  { code: 'CFG-001', stage: 'CFG', title: 'name 缺失或非法' },
  { code: 'CFG-002', stage: 'CFG', title: 'exposes 配置形状错误' },
  { code: 'CFG-003', stage: 'CFG', title: 'remotes 配置形状错误 / 键含非法字符' },
  { code: 'CFG-004', stage: 'CFG', title: 'shared 配置形状错误' },
  { code: 'CFG-005', stage: 'CFG', title: 'remotes 键与 shared 键同名冲突' },
  { code: 'CFG-006', stage: 'CFG', title: '孤岛配置（既不提供也不消费）' },
  { code: 'CFG-007', stage: 'CFG', title: 'remotes 对象形式误用 name@ 前缀（整串当 URL 拼接）' },
  { code: 'CFG-008', stage: 'CFG', title: 'shared 非法组合（eager+import:false / shareKey 重复声明）' },
  { code: 'CFG-009', stage: 'CFG', title: 'remotes 运行参数非法（timeout/retries/breaker 非有限正数等）' },
  { code: 'CFG-010', stage: 'CFG', title: 'devCorsOrigins 形态非法（须为 "*" 或 http(s) 来源数组）' },
  { code: 'CFG-011', stage: 'CFG', title: '已删除的 webpack 兼容/无效选项（remoteType/library/automaticAsyncBoundary/dataPrefetch/usedExports/ignoreUnusedSharedExports——传入即报错并给出迁移写法）' },
  { code: 'CFG-012', stage: 'CFG', title: 'setup 配置非法（路径为空/非字符串，或 exposes 占用内部保留键）' },
  // ── DEV 开发启动/转换期 ──
  { code: 'DEV-001', stage: 'DEV', title: 'remote dev server 不可达（manifest 拉取失败）' },
  { code: 'DEV-002', stage: 'DEV', title: 'remote dev manifest 为空或格式不识别' },
  { code: 'DEV-004', stage: 'DEV', title: '已知 UMD-only 依赖不在 optimizeDeps.include（预构建内联本地 vue 风险）' },
  { code: 'DEV-005', stage: 'DEV', title: 'remotes dev URL 端口无监听（remote 未启动或端口错位）' },
  { code: 'DEV-006', stage: 'DEV', title: '宿主/远程插件版本不一致' },
  { code: 'DEV-009', stage: 'DEV', title: '门面/虚拟模块 404（.vite 缓存漂移，需清缓存重启）' },
  { code: 'DEV-010', stage: 'DEV', title: 'dev 冷启动预构建窗口（首轮 30~60s 瞬态 504/\'ce\' 假错误）' },
  { code: 'DEV-011', stage: 'DEV', title: '非 loopback host + 通配 dev CORS（暴露面扩大提醒）' },
  { code: 'DEV-012', stage: 'DEV', title: '非 loopback host + dev manifest 携带 fsRoot（本机路径外发提醒）' },
  // ── BLD 构建期 ──
  { code: 'BLD-001', stage: 'BLD', title: 'expose 源文件解析失败' },
  { code: 'BLD-002', stage: 'BLD', title: '构建目标低于 es2022（TLA 需要）' },
  { code: 'BLD-003', stage: 'BLD', title: 'expose 目标组件含必填 props（联邦直挂无法传 props）' },
  { code: 'BLD-006', stage: 'BLD', title: 'output 数组形态下无法自动注入协商门面 chunk 隔离（需手工加分支）' },
  // ── MFU 运行时（定义于 runtime/errors.ts，此处登记供手册一致性校验） ──
  { code: 'MFU-001', stage: 'MFU', title: '远程容器/模块加载失败（网络/超时/重试耗尽/熔断）' },
  { code: 'MFU-002', stage: 'MFU', title: 'remoteEntry 自报名与配置名不一致' },
  { code: 'MFU-003', stage: 'MFU', title: 'strictVersion 版本不满足' },
  { code: 'MFU-004', stage: 'MFU', title: '共享模块缺失且无本地 fallback' },
  { code: 'MFU-005', stage: 'MFU', title: '同一容器用不同 share scope 重复 init' },
  { code: 'MFU-006', stage: 'MFU', title: '请求的模块未被该远程 exposes' },
  { code: 'MFU-007', stage: 'MFU', title: '预加载失败' },
  { code: 'MFU-008', stage: 'MFU', title: '未知远程' },
  { code: 'MFU-009', stage: 'MFU', title: '加载到的模块没有任何导出' },
  { code: 'MFU-010', stage: 'MFU', title: 'singleton 共享版本漂移（使用作用域版本）' },
  { code: 'MFU-011', stage: 'MFU', title: 'setup 生命周期入口导出形态非法（默认导出/具名 onSession 不是函数）' },
  { code: 'MFU-012', stage: 'MFU', title: 'setup/onSession 执行抛错（仅清失败阶段缓存，可重试）' },
  { code: 'MFU-013', stage: 'MFU', title: '远程声明 onSession 但宿主 AppContext 缺 sessionKey（登录代次）' },
  { code: 'MFU-014', stage: 'MFU', title: 'setup/onSession 同步段内递归 loadRemote 同一远程（自等待死锁防线）' },
  // ── CC 跨应用上下文（定义于 context.ts，此处登记供手册一致性校验） ──
  { code: 'CC-001', stage: 'CC', title: 'AppContext 必需字段缺失（修法指向宿主桥 provideAppContext）' },
  { code: 'CC-002', stage: 'CC', title: '运行时单例不可用（独立直开远程页，须经宿主联邦加载）' },
]

export interface FulgurjsDiagnosticInput {
  code: string
  /** 现象：什么操作、什么对象、什么结果 */
  symptom: string
  /** 根因：机制解释 + 关键证据值 */
  cause: string
  /** 修法：具体到配置键 / 文件 / 命令 */
  fix: string
  details?: Record<string, unknown>
}

/** 三段式格式化（现象 → 根因 → 修法，附上下文快照） */
export function formatFulgurjsDiagnostic(input: FulgurjsDiagnosticInput): string {
  const ctx = input.details ? `\n上下文：${JSON.stringify(input.details)}` : ''
  return (
    `[fulgurjs:${input.code}] ${input.symptom}\n` +
    `根因：${input.cause}\n` +
    `修法：${input.fix}` +
    ctx
  )
}

/** DEV-005：探测 remote dev URL 的端口是否有进程监听（单次快连，不阻塞启动） */
export async function isPortReachable(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  const net = await import('node:net')
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host)
  })
}

/**
 * BLD-003 启发式：扫描 expose 目标源码里的「必填 props」。
 * 背景（07 审批操作页事故）：expose 挂了需要父页传 props 的子组件，联邦直挂无法传 props
 * → Vue 层渲染崩溃而插件此前无感。启发式识别两种声明形态：
 * - 运行时：defineProps({ foo: { type: X, required: true } })
 * - 类型：defineProps<{ foo: string }>()（无 ? 视为必填；嵌套对象字面量类型的键可能误报，
 *   属可容忍噪音——告警指向核对而非报错）
 * 返回必填 props 名列表（空 = 未检出）。
 */
export function scanExposeRequiredProps(source: string): string[] {
  const required = new Set<string>()
  for (const m of source.matchAll(/(\w+)\s*:\s*\{[^{}]*required\s*:\s*true/g)) {
    required.add(m[1])
  }
  const typeBlock = source.match(/defineProps\s*<\s*\{([\s\S]*?)\}>/)
  if (typeBlock) {
    for (const m of typeBlock[1].matchAll(/(?:^|[;,{\n])\s*([A-Za-z_$][\w$]*)\s*(\?)?\s*:/g)) {
      if (!m[2]) required.add(m[1])
    }
  }
  return [...required]
}


// ── WP8：受控诊断（DEBUG=fulgurjs:* / FULGURJS_DEBUG，默认关闭）─────────────────
//
// 分类记录阶段、模块类型、命中的导入、改写结果、门面/shareKey 归组与构建器版本。
// 约束：不输出源码文本、URL query/凭证或未脱敏绝对路径；写 stderr（console.error），
// 不写固定公共文件。默认零输出（环境变量未开时只有一次 env 读取 + 缓存查表）。

let __debugEnvCache = ''
let __debugEnabledCache: Record<string, boolean> = {}

/** 诊断分类是否开启（FULGURJS_DEBUG 优先于 DEBUG；fulgurjs / fulgurjs:\* / fulgurjs:<分类> 三态） */
export function debugEnabled(category: string): boolean {
  const spec = process.env.FULGURJS_DEBUG ?? process.env.DEBUG ?? ''
  if (spec !== __debugEnvCache) {
    __debugEnvCache = spec
    __debugEnabledCache = {}
  }
  if (category in __debugEnabledCache) return __debugEnabledCache[category]
  const patterns = spec.split(',').map((x) => x.trim()).filter(Boolean)
  const enabled = patterns.some((p) => p === 'fulgurjs' || p === 'fulgurjs:*' || p === `fulgurjs:${category}`)
  __debugEnabledCache[category] = enabled
  return enabled
}

/** 输出一条结构化诊断（JSON 到 stderr）；默认关闭时零输出 */
export function debugLog(category: string, data: Record<string, unknown>): void {
  if (!debugEnabled(category)) return
  console.error(`[fulgurjs:debug:${category}] ${JSON.stringify(data)}`)
}

/** 模块路径脱敏：root 内显示相对路径；root 外只留 basename（不泄露本机绝对路径布局） */
export function redactModulePath(id: string, root: string): string {
  const clean = id.split('?')[0]
  try {
    const rel = path.relative(root, clean)
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel
  } catch {
    /* fallthrough */
  }
  return clean.split('/').pop() ?? clean
}
