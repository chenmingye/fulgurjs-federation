/**
 * vite 6.4.3 本地补丁：修复 admin 全量生产构建在 vite:build-import-analysis 的栈溢出。
 *
 * 现象：jeecg admin（38.8MB entry chunk，内含 27MB 单行 base64 内联 sourcemap 注释）构建时
 *   dep-Dm0c1Wj2.js generateBundle 内 chunk.code.replace(convertSourceMap.mapFileCommentRegex, "")
 *   必现 RangeError: Maximum call stack size exceeded。
 * 证据链（2026-09-13，testbed/demo-app/demo-host 实测）：
 *   - lazy / greedy 两种正则形态均崩；split/join 平坦化后的字符串仍崩；
 *   - 离线（独立 node 进程）对同一 38MB 内容、同一正则：全部通过（含 --stack-size=200 阶梯）；
 *   - 构建进程内 JS 栈余量 63529 帧（未耗尽）。
 *   结论：构建进程态下 V8 irregexp 对超长单行的回溯栈耗尽，与正则写法、字符串表示、JS 栈深均无关，
 *   离线不可复现。绕开正则引擎是唯一可靠修复。
 * 修复：用无正则的行过滤剥离旧 inline sourcemap 注释。rollup 追加的该注释恒为整行形式，
 *   语义等价；行中段尾随形态（真实依赖未见）不再剥离，devtools 以最后一条注释为准，无功能影响。
 *
 * 用法：node scripts/patch-vite-643-ia-strip.mjs [admin目录]
 *   默认对 testbed/demo-app/demo-host 生效；pnpm install / node_modules 重装后需重跑。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const adminDir = process.argv[2] ?? resolve(import.meta.dirname, '../../../testbed/demo-app/demo-host')
const require = createRequire(resolve(adminDir, 'package.json'))
const vitePkg = require('vite/package.json')
if (vitePkg.version !== '6.4.3') {
  console.error(`[patch] 期望 vite 6.4.3，实际 ${vitePkg.version}，跳过（新版本请先验证是否仍存在此问题）`)
  process.exit(1)
}
const depFile = resolve(adminDir, 'node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js')
let code = readFileSync(depFile, 'utf8')

const ORIGINAL = `              if (buildSourcemap === "inline") {
                chunk.code = chunk.code.replace(
                  convertSourceMap.mapFileCommentRegex,
                  ""
                );`
const PATCHED = `              if (buildSourcemap === "inline") {
                // update-begin--vite-plugin-unifed---P1 修复（本地 patch，见 packages/plugin/scripts/patch-vite-643-ia-strip.mjs）
                // 原实现 convertSourceMap.mapFileCommentRegex 的 String.replace 在巨型 chunk（38.8MB entry，
                // 27MB 单行内联 sourcemap）上于构建进程内必现 RangeError: Maximum call stack size exceeded
                // （lazy/greedy、平坦化字符串均复现；离线正常；JS 栈余量 63529 帧）。改为无正则行过滤，
                // 仅剥离整行形式的旧 inline 注释（rollup 追加形态恒为整行），语义等价。
                chunk.code = chunk.code.split("\\n").filter(
                  (l) => !l.startsWith("//# sourceMappingURL=") && !l.startsWith("/*# sourceMappingURL=")
                ).join("\\n");
                // update-end--vite-plugin-unifed---`

if (code.includes('!l.startsWith("//# sourceMappingURL=")')) {
  console.log('[patch] 已应用过，跳过')
  process.exit(0)
}
if (!code.includes(ORIGINAL)) {
  console.error('[patch] 未找到目标代码段（vite 6.4.3 dep 文件内容不符），中止')
  process.exit(1)
}
writeFileSync(depFile, code.replace(ORIGINAL, PATCHED))
console.log('[patch] 已修复:', depFile)
