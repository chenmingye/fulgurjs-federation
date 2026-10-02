/**
 * rolldown（Vite 8）产物后处理：async 标记修复（V8-ASYNC-FIX）。
 *
 * 缺陷（rolldown 1.1.5 / vite 8.1.4 实测，JeecgBoot 大型应用）：插件 TLA 协商门面使
 * 消费方模块的 chunk 内惰性初始化包装变为异步；当这类模块与用户代码既有的循环依赖相遇
 * 时（如 Jeecg electron 工具模块 ⇄ 路由模块），rolldown 为循环另一侧生成的包装漏标
 * `async` —— 产物在非异步函数里出现 `await`（两种形态同根源）：
 *   - 模块包装：`e((()=>{ await other_init(), ... }))`
 *   - CJS 互操作包装：`__esmMin((() => { await init_x(); ... })())`
 * esbuild 转译/浏览器解析直接失败（"Unexpected reserved word"/"await can only be used
 * inside an async function"）。同 chunk 被正确标记的包装形如 `__esmMin((async () => {`，
 * 运行时助手按返回值缓存（Promise 是其既有支持形态），故补上 `async` 即是 rolldown
 * 本应生成的代码；不改写任何调用点。rollup（vite 5/6/7）无此缺陷，本通道零触发。
 *
 * 流程：便宜门禁（仅 rolldown 产物引用 rolldown-runtime）→ esbuild 语法校验（原生、
 * 快）→ 确证破损才修复：先按包装签名做正则补标（破损代码无法 AST 解析），复验仍失败
 * 再走 AST（this.parse）定位补标；最终复验必须通过，否则报带上下文的构建错误。
 * 正常产物零改动、零 AST 解析成本。
 */
import MagicString from 'magic-string'
import { transformSync } from 'esbuild'

/** rolldown 产物的运行时助手 chunk 引用特征（含 TLA/包装的 chunk 必然导入它） */
const ROLLDOWN_RUNTIME_MARK = 'rolldown-runtime'

const ASYNC_ERROR_SIGNATURE = /await["']?\s+(?:is only allowed within|can only be used inside an?)\s+["']?async/i

export interface AsyncMarkRepairResult {
  code: string
  repaired: number
}

function validate(code: string): { ok: true } | { ok: false; text: string } {
  try {
    transformSync(code, { loader: 'js', format: 'esm' })
    return { ok: true }
  } catch (e) {
    const err = e as { errors?: Array<{ text?: string }>; message?: string }
    const text = err.errors?.[0]?.text ?? err.message ?? ''
    return ASYNC_ERROR_SIGNATURE.test(text) ? { ok: false, text } : { ok: false, text: '' }
  }
}

/**
 * 阶段一：按 rolldown 初始化包装签名补标 async。
 * 只命中「零参箭头函数体以 await 开头」的形态——合法产物中箭头体首 token 是 await
 * 只可能是 async 包装（lookbehind 排除已带 async 的），否则即为本次修复的破损形态。
 */
function repairBySignature(code: string): { code: string; repaired: number } {
  const re = /(?<!async\s*)\(\s*\)\s*=>\s*\{\s*await\b/g
  let repaired = 0
  const out = code.replace(re, (m) => {
    repaired++
    return `async ${m}`
  })
  return { code: out, repaired }
}

/** 通用 AST 遍历：找出「包含 await 但自身非 async」的函数节点 */
function collectBrokenFunctions(ast: unknown): Array<Record<string, unknown>> {
  const broken: Array<Record<string, unknown>> = []
  const fnTypes = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
  const visit = (node: unknown, fn: Record<string, unknown> | null): void => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (typeof n.type !== 'string') return
    let current = fn
    if (fnTypes.has(n.type)) current = n
    if (n.type === 'AwaitExpression' || (n.type === 'ForOfStatement' && n.await === true)) {
      if (current && current.async !== true) (current as { __fgBroken?: boolean }).__fgBroken = true
    }
    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      const v = n[key]
      if (Array.isArray(v)) {
        for (const item of v) if (item && typeof item === 'object') visit(item, current)
      } else if (v && typeof v === 'object') {
        visit(v, current)
      }
    }
  }
  visit(ast, null)
  return broken.filter((n) => n.__fgBroken === true)
}

/** 阶段二：AST 定位补标（正则修不掉的形态，如带参箭头/function 声明） */
function repairByAst(code: string, parse: (input: string) => unknown, sourceName: string): { code: string; repaired: number } {
  let ast: unknown
  try {
    ast = parse(code)
  } catch (e) {
    throw new Error(
      `[fulgurjs] 检测到产物存在「await 位于非 async 函数」（rolldown codegen 缺陷，V8-ASYNC-FIX），` +
        `签名修复后 AST 解析仍失败无法兜底（${sourceName}）：${e instanceof Error ? e.message : String(e)}`,
    )
  }
  const broken = collectBrokenFunctions(ast)
  if (broken.length === 0) {
    throw new Error(
      `[fulgurjs] 检测到「await 位于非 async 函数」（rolldown codegen 缺陷，V8-ASYNC-FIX），` +
        `但未能定位到可修复的函数节点（${sourceName}）。`,
    )
  }
  const s = new MagicString(code)
  let repaired = 0
  for (const fn of broken) {
    const start = typeof fn.start === 'number' ? fn.start : -1
    const type = String(fn.type)
    const repairable = start >= 0 && (type === 'ArrowFunctionExpression' || code.slice(start, start + 8) === 'function')
    if (!repairable) {
      const ctx = start >= 0 ? code.slice(Math.max(0, start - 80), start + 80) : code.slice(0, 160)
      throw new Error(
        `[fulgurjs] 检测到「await 位于非 async 函数」（rolldown codegen 缺陷，V8-ASYNC-FIX），` +
          `但节点类型 ${type} 无法安全补标 async（${sourceName}）。上下文：${JSON.stringify(ctx)}`,
      )
    }
    s.appendLeft(start, 'async ')
    repaired++
  }
  return { code: s.toString(), repaired }
}

/**
 * 检测并修复产物中的「await 位于非 async 函数」破损。
 * 返回 null = 无需修复（含非 async 语法错误的情形——交由构建管线原样报错）。
 */
export function repairRolldownAsyncMarks(
  code: string,
  parse: (input: string) => unknown,
  sourceName: string,
): AsyncMarkRepairResult | null {
  if (!code.includes(ROLLDOWN_RUNTIME_MARK) || !code.includes('await')) return null
  const first = validate(code)
  if (first.ok) return null
  if (!first.text) return null // 其他语法错误原样交给构建管线报错

  let current = code
  let repaired = 0
  const sig = repairBySignature(current)
  if (sig.repaired > 0) {
    current = sig.code
    repaired += sig.repaired
  }
  const afterSig = validate(current)
  if (!afterSig.ok) {
    if (!afterSig.text) return null // 混入其他语法错误，原样交给构建管线
    const ast = repairByAst(current, parse, sourceName)
    current = ast.code
    repaired += ast.repaired
  }
  const final = validate(current)
  if (!final.ok) {
    throw new Error(
      `[fulgurjs] async 标记修复后复验仍未通过（${sourceName}）：${final.text || '未知语法错误'}`,
    )
  }
  return { code: current, repaired }
}
