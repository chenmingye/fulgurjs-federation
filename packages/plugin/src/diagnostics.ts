/**
 * D.5 全链路错误诊断体系（node 侧：CFG/DEV/BLD 段 + 码表 + 文案生成器）
 *
 * 运行时段（MFU-0xx）定义在 runtime/errors.ts（浏览器 bundle，保持精简）；
 * 本模块服务配置期/开发期/构建期报错与手册 §8 的一致性校验
 * （scripts/check-manual-codes.mjs 消费 CODE_REGISTRY 防文档漂移）。
 *
 * 三段式强制：现象 → 根因 → 修法；ERROR 级文案必须 cause/fix 非空（单测断言）。
 */

export type FulgurjsStage = 'CFG' | 'DEV' | 'BLD' | 'MFU'

export interface FulgurjsCodeMeta {
  code: string
  stage: FulgurjsStage
  title: string
}

/** 全量错误码登记表（手册 §8 与之一一对应；新增报错必须先登记） */
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
  // ── DEV 开发启动/转换期 ──
  { code: 'DEV-001', stage: 'DEV', title: 'remote dev server 不可达（manifest 拉取失败）' },
  { code: 'DEV-002', stage: 'DEV', title: 'remote dev manifest 为空或格式不识别' },
  { code: 'DEV-003', stage: 'DEV', title: 'shared 键被 optimizeDeps.exclude（dev 裸 CJS 无 interop 风险）' },
  { code: 'DEV-004', stage: 'DEV', title: '已知 UMD-only 依赖不在 optimizeDeps.include（预构建内联本地 vue 风险）' },
  { code: 'DEV-005', stage: 'DEV', title: 'remotes dev URL 端口无监听（remote 未启动或端口错位）' },
  { code: 'DEV-006', stage: 'DEV', title: '宿主/远程插件版本不一致' },
  { code: 'DEV-008', stage: 'DEV', title: 'exposes 目标文件静态导入 virtual:fulgurjs-runtime（原 D.1 检测）' },
  { code: 'DEV-009', stage: 'DEV', title: '门面/虚拟模块 404（.vite 缓存漂移，需清缓存重启）' },
  { code: 'DEV-010', stage: 'DEV', title: 'dev 冷启动预构建窗口（首轮 30~60s 瞬态 504/\'ce\' 假错误）' },
  // ── BLD 构建期 ──
  { code: 'BLD-001', stage: 'BLD', title: 'expose 源文件解析失败' },
  { code: 'BLD-002', stage: 'BLD', title: '构建目标低于 es2022（TLA 需要）' },
  { code: 'BLD-003', stage: 'BLD', title: 'expose 目标组件含必填 props（联邦直挂无法传 props）' },
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
