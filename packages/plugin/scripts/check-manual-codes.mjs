#!/usr/bin/env node
// D.5 防漂移校验：错误码三处必须一致——
//   ① 源码定义：runtime/errors.ts 的 MFU 段、context.ts 的 CC 段（各自码表字面量）
//   ② 登记表 CODE_REGISTRY（src/diagnostics.ts）：新增报错必须先登记
//   ③ README「错误码总表」：唯一权威文档
// 校验三向：源码定义 ⊆ 登记表 = README 码表（任一侧缺失即非零退出）。
// 由 build 调用（npm run build），CI 与 publish 流程据此守门。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(pluginRoot, '../..')
const read = (p) => fs.readFileSync(p, 'utf8')

const diag = read(path.join(pluginRoot, 'src/diagnostics.ts'))
const runtime = read(path.join(pluginRoot, 'src/runtime/errors.ts'))
const context = read(path.join(pluginRoot, 'src/context.ts'))
const readme = read(path.join(root, 'README.md'))

// ① 源码定义（只扫码表所在文件——散落在注释里的历史码提及不构成定义）
const defined = new Set()
for (const m of runtime.matchAll(/'([A-Z]{2,4}-\d{3})'/g)) defined.add(m[1])
for (const m of context.matchAll(/'([A-Z]{2,4}-\d{3})'/g)) defined.add(m[1])

// ② 登记表（权威清单；不写死段名，新增段自动纳入）
const registered = new Set([...diag.matchAll(/code: '([A-Z]{2,4}-\d{3})'/g)].map((m) => m[1]))

// ③ 文档（只取码表节内条目；节外散文提及不参与校验）
const section = readme.match(/###\s*6\.\s*错误码总表[\s\S]*?(?=\n###\s)/)
if (!section) {
  console.error('[fulgurjs] README 未找到「6. 错误码总表」节——节标题被改动或删除，防漂移校验无法进行')
  process.exit(1)
}
const documented = new Set(section[0].match(/[A-Z]{2,4}-\d{3}/g) ?? [])

const problems = []
for (const c of defined) {
  if (!registered.has(c)) problems.push(`${c} 源码已定义但未登记进 CODE_REGISTRY`)
}
for (const c of registered) {
  if (!documented.has(c)) problems.push(`${c} 已登记但 README 错误码总表缺条目`)
}
for (const c of documented) {
  if (!registered.has(c)) problems.push(`${c} README 错误码总表有条目但未登记进 CODE_REGISTRY`)
}
const declared = section[0].match(/错误码总表（(\d+)\s*个）/)
if (declared && Number(declared[1]) !== documented.size) {
  problems.push(`README 节标题声明「${declared[1]} 个」与实际条目数 ${documented.size} 不符`)
}

if (problems.length) {
  console.error('[fulgurjs] 错误码一致性校验失败：')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(
  `[fulgurjs] 错误码三方一致（登记 ${registered.size} = 文档 ${documented.size}；源码定义 ${defined.size} 个全部已登记）`,
)
