/**
 * rolldown（Vite 8）产物后处理：async 标记修复（V8-ASYNC-FIX，2026-10-03 重设计）。
 *
 * 缺陷（rolldown 1.1.5/1.2.x + vite 8.1.4/8.3.2 实测，JeecgBoot 大型应用）：当顶层 await
 * 沿静态依赖传播进用户代码/依赖库的循环依赖时（如 ant-design-vue 的 useConfigInflect ⇄
 * theme），rolldown 为循环一侧生成的惰性初始化包装（`var init = ACC((()=>{ await ... }))`
 * 形态）漏标 `async`——产物在非异步函数里出现 `await`，esbuild 转译/浏览器解析直接失败。
 *
 * 2026-10-03 重设计（接手轮）：
 * - 旧版阶段一为盲正则替换（可命中字符串/注释里的同形文本）、阶段二为 AST 兜底——但
 *   `this.parse`（oxc）与所有标准 parser 一样**无法解析**「await 位于非 async 函数」的
 *   破损代码（早期 SyntaxError），兜底从设计上不可达（旧实现另有一处 collectBrokenFunctions
 *   从不填充数组的缺陷，即便可达也返回空）。
 * - 新版由 esbuild 的**真实报错位置**驱动：esbuild 精确指向非法 await（含 line/column，
 *   且字符串/注释内容永不误报）；据此在「代码区」（轻量 lexer 掩码排除字符串/模板/注释/
 *   正则字面量）内回扫定位**最内层**包裹函数头，按函数形态（箭头/function 声明/表达式/
 *   方法简写）插入 `async`；每轮插入后立即用 esbuild 复验，直至通过或明确失败。
 * - 仅修复「await 位于非 async 函数」这一种确证形态；其他语法错误原样交给构建管线。
 *
 * 运行语义（与 rolldown 自身正确标记的包装一致）：访问器按返回值缓存（Promise 是其既有
 * 支持形态），补 `async` 只是把 rolldown 本应生成的标记补上，不改写任何调用点。
 *
 * 注：5.6.0 起 rolldown 构建的协商门面已改同步形态（V8-SYNC-FACADE，见 virtual.ts），
 * 插件自身不再向应用图注入 TLA——本修复保留为「用户自有 TLA 代码 × 循环依赖」触发的
 * rolldown codegen 缺陷的安全网。
 */
import { transformSync } from 'esbuild'

/** rolldown 产物的运行时助手 chunk 引用特征（含 TLA/包装的 chunk 必然导入它） */
const ROLLDOWN_RUNTIME_MARK = 'rolldown-runtime'

const ASYNC_ERROR_SIGNATURE = /await["']?\s+(?:is only allowed within|can only be used inside an?)\s+["']?async/i

/** 单 chunk 修复轮数上限（防病态产物死循环；正常 rolldown 缺陷个数为个位数） */
const MAX_REPAIR_ROUNDS = 64

export interface AsyncMarkRepairResult {
  code: string
  repaired: number
}

interface ValidateOk {
  ok: true
}
interface ValidateBroken {
  ok: false
  /** 破损 await 的绝对偏移（-1 = 无法定位）；text 为空表示非 async 类语法错误 */
  offset: number
  text: string
}

function validate(code: string): ValidateOk | ValidateBroken {
  try {
    transformSync(code, { loader: 'js', format: 'esm' })
    return { ok: true }
  } catch (e) {
    const err = e as { errors?: Array<{ text?: string; location?: { line: number; column: number } }>; message?: string }
    const first = err.errors?.[0]
    const text = first?.text ?? err.message ?? ''
    if (!ASYNC_ERROR_SIGNATURE.test(text)) return { ok: false, offset: -1, text: '' }
    const loc = first?.location
    if (!loc) return { ok: false, offset: -1, text }
    let offset = -1
    if (loc.line >= 1) {
      let lineStart = 0
      for (let l = 1; l < loc.line; l++) {
        const nl = code.indexOf('\n', lineStart)
        if (nl === -1) { lineStart = -1; break }
        lineStart = nl + 1
      }
      if (lineStart >= 0) offset = lineStart + loc.column
    }
    return { ok: false, offset, text }
  }
}

/** 代码区掩码：非代码区（字符串/模板/注释/正则字面量）内的偏移返回 true */
function buildCodeMask(code: string): (offset: number) => boolean {
  const masked: Array<[number, number]> = []
  const n = code.length
  let i = 0
  // 前一个有意义字符（跳过空白）——正则/除号判别用
  let prevSignificant = ''
  const lastMeaningful = (from: number): string => {
    for (let j = from; j >= 0; j--) {
      const c = code[j]
      if (!/\s/.test(c)) return c
    }
    return ''
  }
  while (i < n) {
    const c = code[i]
    if (c === '"' || c === "'") {
      const start = i
      i++
      while (i < n) {
        if (code[i] === '\\') { i += 2; continue }
        if (code[i] === c || code[i] === '\n') { i++; break }
        i++
      }
      masked.push([start, Math.min(i, n)])
      prevSignificant = c
      continue
    }
    if (c === '`') {
      const start = i
      i++
      let depth = 0 // 模板内 ${} 嵌套深度
      while (i < n) {
        if (code[i] === '\\') { i += 2; continue }
        if (depth === 0 && code[i] === '`') { i++; break }
        if (depth === 0 && code[i] === '$' && code[i + 1] === '{') { depth = 1; i += 2; continue }
        if (depth > 0) {
          // 嵌套表达式里的字符串（简单处理：字符串字面量跳过）
          if (code[i] === '"' || code[i] === "'") {
            const q = code[i]
            i++
            while (i < n) { if (code[i] === '\\') { i += 2; continue }; if (code[i] === q) { i++; break }; i++ }
            continue
          }
          if (code[i] === '{') depth++
          if (code[i] === '}') depth--
        }
        i++
      }
      masked.push([start, Math.min(i, n)])
      prevSignificant = '`'
      continue
    }
    if (c === '/' && code[i + 1] === '/') {
      const start = i
      const nl = code.indexOf('\n', i)
      i = nl === -1 ? n : nl + 1
      masked.push([start, i])
      continue
    }
    if (c === '/' && code[i + 1] === '*') {
      const start = i
      const end = code.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      masked.push([start, i])
      continue
    }
    if (c === '/') {
      // 除号 vs 正则开头：前一有意义字符为标识符/右括号/右方括号/数字 → 除号
      const p = prevSignificant || lastMeaningful(i - 1)
      const isDivision = /[A-Za-z0-9_$)\]]/.test(p)
      if (!isDivision) {
        const start = i
        i++
        let inClass = false
        while (i < n) {
          const rc = code[i]
          if (rc === '\\') { i += 2; continue }
          if (rc === '\n') break
          if (rc === '[') inClass = true
          else if (rc === ']') inClass = false
          else if (rc === '/' && !inClass) { i++; break }
          i++
        }
        while (i < n && /[a-z]/i.test(code[i])) i++ // flags
        masked.push([start, Math.min(i, n)])
        prevSignificant = '/'
        continue
      }
    }
    if (!/\s/.test(c)) prevSignificant = c
    i++
  }
  // 排序 + 合并后二分查找
  masked.sort((a, b) => a[0] - b[0])
  return (offset: number): boolean => {
    let lo = 0, hi = masked.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const [s, e] = masked[mid]
      if (offset < s) hi = mid - 1
      else if (offset >= e) lo = mid + 1
      else return true
    }
    return false
  }
}

interface FunctionHead {
  /** async 插入偏移（param/function 关键字/方法名起点） */
  insertAt: number
  kind: 'arrow' | 'function' | 'method'
}

/**
 * 从非法 await 偏移回扫，定位最内层包裹函数头。
 * 逐字符回扫，跳过非代码区；`}` `)` `]` 深度递增并跳过其平衡内容；
 * 未配对的 `{` 判定是否为函数体（前驱为 `=>` 或 `function`）；
 * `=>` 直接命中表达式体箭头。
 */
function findEnclosingFunctionHead(code: string, awaitOffset: number, isMasked: (o: number) => boolean): FunctionHead | null {
  const isCode = (o: number): boolean => o >= 0 && o < code.length && !isMasked(o)
  let i = awaitOffset
  let depth = 0
  while (i > 0) {
    i--
    if (!isCode(i)) continue
    const c = code[i]
    if (c === '}' || c === ')' || c === ']') {
      depth++
      continue
    }
    if (c === '(' || c === '[') {
      // 未配对的组开始：await 在该组内，包裹函数在组外，跳过继续
      if (depth > 0) depth--
      continue
    }
    if (c === '{') {
      if (depth > 0) { depth--; continue }
      // 未配对的块：函数体则命中；普通块（if/for/对象字面量等）继续回扫
      const head = classifyBrace(code, i, isCode)
      if (head) return head
      continue
    }
    if (c === '>' && i > 0 && code[i - 1] === '=' && isCode(i - 1)) {
      // => 表达式体箭头
      const head = arrowHeadBefore(code, i - 1, isCode)
      if (head) return head
      continue
    }
  }
  return null
}

/** `=>` 前的参数列表起点：`)` 配对回 `(`；或裸标识符参数 */
function skipBackward(from: number, code: string, isCode: (o: number) => boolean): number {
  let i = from
  while (i >= 0 && (!isCode(i) || /\s/.test(code[i]))) i--
  return i
}

/** `=>` 前的参数列表起点：`)` 配对回 `(`；或裸标识符参数 */
function arrowHeadBefore(code: string, arrowEq: number, isCode: (o: number) => boolean): FunctionHead | null {
  const before = skipBackward(arrowEq - 1, code, isCode)
  if (before < 0) return null
  if (code[before] === ')') {
    let d = 0
    let i = before
    while (i >= 0) {
      if (!isCode(i)) { i--; continue }
      const c = code[i]
      if (c === ')') d++
      else if (c === '(') {
        d--
        if (d === 0) return { insertAt: i, kind: 'arrow' }
      }
      i--
    }
    return null
  }
  // 裸标识符参数（单参箭头）
  if (/[A-Za-z0-9_$]/.test(code[before])) {
    let i = before
    while (i >= 0 && /[A-Za-z0-9_$]/.test(code[i]) && isCode(i)) i--
    return { insertAt: i + 1, kind: 'arrow' }
  }
  return null
}

/** 未配对 `{` 的函数体判定：前驱 `=>`（箭头）/`function`（声明或表达式）/方法简写 */
function classifyBrace(code: string, brace: number, isCode: (o: number) => boolean): FunctionHead | null {
  let i = skipBackward(brace - 1, code, isCode)
  if (i < 0) return null
  if (code[i] === '>' && i > 0 && code[i - 1] === '=') {
    return arrowHeadBefore(code, i - 1, isCode)
  }
  if (code[i] !== ')') return null // 普通块（if/for/try 等）
  // 参数组：回配到 `(`，再判前驱
  let d = 0
  let j = i
  while (j >= 0) {
    if (!isCode(j)) { j--; continue }
    const c = code[j]
    if (c === ')') d++
    else if (c === '(') {
      d--
      if (d === 0) break
    }
    j--
  }
  if (j < 0) return null
  const beforeParen = skipBackward(j - 1, code, isCode)
  if (beforeParen < 0) return null
  if (code[beforeParen] === '*') return null // 生成器方法：不支持（明确失败）
  if (!/[A-Za-z0-9_$"']/.test(code[beforeParen])) return null // 非函数头（调用等）：普通块语义
  const word = readWordBackward(code, beforeParen, isCode)
  if (word.word === 'function') return { insertAt: word.start, kind: 'function' }
  // 具名函数 function foo( → 再向前取一词判 function
  const beforeWordPos = skipBackward(word.start - 1, code, isCode)
  if (beforeWordPos >= 0 && /[A-Za-z0-9_$]/.test(code[beforeWordPos])) {
    const beforeWord = readWordBackward(code, beforeWordPos, isCode)
    if (beforeWord.word === 'function') return { insertAt: beforeWord.start, kind: 'function' }
  }
  // 方法简写：obj.foo() {} / class foo() {}（标识符/字符串键支持；get/set/async 前缀不支持）
  const key = readMethodKeyBackward(code, beforeParen, isCode)
  return key ? { insertAt: key.start, kind: 'method' } : null
}

/** 从 wordEnd 向前读一个标识符 */
function readWordBackward(code: string, wordEnd: number, isCode: (o: number) => boolean): { word: string; start: number } {
  let i = wordEnd
  while (i >= 0 && /[A-Za-z0-9_$]/.test(code[i]) && isCode(i)) i--
  return { word: code.slice(i + 1, wordEnd + 1), start: i + 1 }
}

/** 方法键起点：支持标识符与字符串键；get/set/星号/async 前缀与计算键 `[...]` 不支持（明确失败） */
function readMethodKeyBackward(code: string, keyEnd: number, isCode: (o: number) => boolean): { start: number } | null {
  const i = keyEnd
  if (i < 0) return null
  let keyStart: number
  if (code[i] === '"' || code[i] === "'") {
    const q = code[i]
    let j = i - 1
    while (j >= 0) { if (code[j] === '\\') { j -= 2; continue }; if (code[j] === q) break; j-- }
    if (j < 0) return null
    keyStart = j
  } else if (/[A-Za-z0-9_$]/.test(code[i])) {
    keyStart = readWordBackward(code, i, isCode).start
  } else {
    return null // 计算键 `[expr]()` 等不支持
  }
  const before = skipBackward(keyStart - 1, code, isCode)
  if (before >= 0) {
    if (code[before] === '*') return null // 生成器方法
    if (/[A-Za-z0-9_$]/.test(code[before])) {
      const w = readWordBackward(code, before, isCode)
      if (w.word === 'get' || w.word === 'set' || w.word === 'async') return null // 存取器/已 async：不支持或不应发生
    }
  }
  return { start: keyStart }
}

/**
 * 检测并修复产物中的「await 位于非 async 函数」破损。
 * 返回 null = 无需修复（含非 async 语法错误的情形——交由构建管线原样报错）；
 * 修复不可达（无法定位可安全补标的函数头）时抛带上下文的错误。
 * 每轮插入后重建掩码与校验（插入会改变偏移，必须对当前串工作）。
 */
export function repairRolldownAsyncMarks(code: string, sourceName: string): AsyncMarkRepairResult | null {
  if (!code.includes(ROLLDOWN_RUNTIME_MARK) || !code.includes('await')) return null
  const first = validate(code)
  if (first.ok) return null
  if (!first.text) return null // 其他语法错误原样交给构建管线报错

  let current = code
  let repaired = 0
  let lastText = first.text
  for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
    const v = validate(current)
    if (v.ok) return { code: current, repaired }
    if (!v.text) {
      throw new Error(
        `[fulgurjs] async 标记修复过程中出现非目标语法错误（rolldown codegen 缺陷，V8-ASYNC-FIX，${sourceName}）。` +
          `已完成补标 ${repaired} 处。请把该 chunk 与构建配置反馈给 fulgurjs。`,
      )
    }
    lastText = v.text
    const isMasked = buildCodeMask(current)
    if (v.offset < 0 || isMasked(v.offset)) {
      throw new Error(
        `[fulgurjs] 检测到「await 位于非 async 函数」（rolldown codegen 缺陷，V8-ASYNC-FIX），但无法定位破损 await 的代码位置（${sourceName}）：${v.text}。`,
      )
    }
    const head = findEnclosingFunctionHead(current, v.offset, isMasked)
    if (!head) {
      const ctx = current.slice(Math.max(0, v.offset - 100), v.offset + 100)
      throw new Error(
        `[fulgurjs] 检测到「await 位于非 async 函数」（rolldown codegen 缺陷，V8-ASYNC-FIX），` +
          `但无法安全定位包裹函数头（可能为 getter/setter/计算键方法等不支持形态，${sourceName}）。` +
          `上下文：${JSON.stringify(ctx)}`,
      )
    }
    current = current.slice(0, head.insertAt) + 'async ' + current.slice(head.insertAt)
    repaired++
  }
  throw new Error(
    `[fulgurjs] async 标记修复超过 ${MAX_REPAIR_ROUNDS} 轮仍未通过（${sourceName}）：${lastText}。疑似非 rolldown 已知缺陷形态，请反馈给 fulgurjs。`,
  )
}
