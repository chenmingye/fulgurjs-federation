#!/usr/bin/env node
// W1 init 模板常量提取器：从「已验证最终形态」的参考工程（testbed 或 --stash 指定的
// 集成文件目录）程序化提取模板，杜绝手抄漂移。占位符 TOKENS 在 init.ts 运行时按
// fulgur.config.ts 的实际值替换；参考值与 config 一致时产物逐字节一致。
// 用法：node scripts/gen-init-templates.cjs [--stash /tmp/fulgur-stash] [--out src/init-templates.ts]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d }
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STASH = arg('--stash', '/tmp/fulgur-stash')
const OUT = path.join(pluginRoot, arg('--out', 'src/init-templates.ts'))

// token 化：模板中的项目侧标识 → __占位符__（init.ts 按 config 替换）
const TOKENS = [
  [/demo-host/g, '__ADMIN_NAME__'],
  [/mes-bpm/g, '__BPM_NAME__'],
  [/mes-lowcode/g, '__LOWCODE_NAME__'],
  [/localhost:8773/g, '__ADMIN_HOSTPORT__'],
  [/localhost:4529/g, '__BPM_HOSTPORT__'],
  [/localhost:4669/g, '__LOWCODE_HOSTPORT__'],
  [/localhost:8085/g, '__BACKEND_HOSTPORT__'],
]

const FILES = [
  ['demo-host/src/qiankun/fulgurPages.ts', 'T_FULGUR_PAGES'],
  ['demo-host/src/qiankun/fulgurBridge.ts', 'T_FULGUR_BRIDGE'],
  ['demo-host/src/views/fulgur/FulgurDemo.vue', 'T_FULGUR_DEMO'],
  ['demo-bpm/src/fulgur-exposes/federatedBoot.ts', 'T_BPM_BOOT'],
  ['demo-bpm/src/fulgur-exposes/TaskCard.vue', 'T_BPM_TASKCARD'],
  ['demo-lowcode/src/fulgur-exposes/federatedBoot.ts', 'T_LOWCODE_BOOT'],
  ['demo-lowcode/src/fulgur-exposes/InfoCard.vue', 'T_LOWCODE_INFOCARD'],
  ['demo-bpm/build/vite/optimize.ts', 'T_BPM_OPTIMIZE'],
  ['demo-lowcode/build/vite/optimize.ts', 'T_LOWCODE_OPTIMIZE'],
  ['demo-lowcode/src/views/lowdesign/moduleDesign/index.vue', 'T_MODULE_DESIGN'],
]

let out = `/**
 * W1 init 模板常量——由 scripts/gen-init-templates.cjs 从已验证最终形态程序化提取（勿手改）。
 * 占位符在运行时由 init.ts 按 fulgur.config.ts 的 apps/env/deploy 值替换。
 */
`
for (const [rel, name] of FILES) {
  const abs = path.join(STASH, rel)
  if (!fs.existsSync(abs)) {
    console.error(`[gen-init-templates] 缺少参考文件：${abs}`)
    process.exit(1)
  }
  let body = fs.readFileSync(abs, 'utf8')
  for (const [re, tok] of TOKENS) body = body.replace(re, tok)
  out += `\nexport const ${name} = ${JSON.stringify(body)};\n`
}
fs.writeFileSync(OUT, out)
console.log(`[gen-init-templates] ${OUT} (${out.length} bytes, ${FILES.length} templates)`)
