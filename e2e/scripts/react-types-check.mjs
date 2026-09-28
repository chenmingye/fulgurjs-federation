#!/usr/bin/env node
/**
 * R15：React 开发态类型直连的真实项目编译验证（任务书 §5.3）。
 *
 * 前置：remote-react(5103) 与 host-react(5104) dev server 运行中（host 启动时已生成
 * src/fulgurjs/types/remote-react.d.ts——fsRoot 直连源码）。
 *
 * 验证（全部用有效 tsconfig 项目检查，不拿 tsc 单文件冒充）：
 * 1. 生成声明内容：.tsx expose 的 props 类型直连（ButtonProps）、setup 内部键不泄漏；
 * 2. 合法消费者：Button 以 ButtonProps 使用 + utils 具名函数 + theme-context 类型 → tsc 通过；
 * 3. 故意错误：label={42}（错误 props）与 formatMoney('x')（错误参数）→ tsc 非零
 *    （证明类型没有退化为 any）；
 * 4. any 降级：devFsRoot:false 的远程 manifest → 生成 any 声明 → 合法导入编译通过（无精度）。
 *
 * 用法：node e2e/scripts/react-types-check.mjs
 */
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(SCRIPT_DIR, '../..')
const HOST = path.join(REPO, 'fixtures/host-react')
const TSC = path.join(REPO, 'packages/plugin/node_modules/.bin/tsc')

const log = (msg) => console.log(`[react-types] ${msg}`)
const fail = (msg) => {
  console.error(`[react-types] FAIL: ${msg}`)
  process.exit(1)
}

// 智能双轨：宿主 tsconfig.typecheck.json 已配 paths → 生成器跳过同名 ambient（防 shadow）
const typesFile = path.join(HOST, 'src/fulgurjs/types/remote-react.d.ts')
if (!fs.existsSync(path.join(HOST, 'src/fulgurjs/types/remote-react.d'))) {
  fail('dev 类型未生成（先启动 host-react dev server 一次）')
}
const typesText = fs.existsSync(typesFile) ? fs.readFileSync(typesFile, 'utf8') : ''

// 1. 双轨声明内容：
//    零配置轨（ambient）：paths 未配置时生成（带体 any 可解析）
//    精确轨（remote-react.d/ 转发模块）：props 直连 + 具名导出枚举 + paths 启用说明
if (typesText.includes('declare module "remote-react')) {
  fail('宿主已配 paths 时仍生成了同名 ambient（会 shadow 转发模块）')
}
if (typesText.includes('__fulgurjs_setup__')) fail('内部 setup expose 泄漏进公开类型声明')
const preciseBtn = path.join(HOST, 'src/fulgurjs/types/remote-react.d/Button.ts')
if (!fs.existsSync(preciseBtn)) fail('精确轨转发模块缺失（remote-react.d/Button.ts）')
const btnText = fs.readFileSync(preciseBtn, 'utf8')
if (!btnText.includes('export * from')) fail('精确轨未整体转发远程源码模块')
// props 精度由下方 tsc 编译断言（ButtonProps 泛型/错误参数）权威验证
const utilsText = fs.readFileSync(path.join(HOST, 'src/fulgurjs/types/remote-react.d/utils.ts'), 'utf8')
if (!utilsText.includes('export * from')) fail('精确轨 utils 未整体转发')
const pathsHint = fs.readFileSync(path.join(HOST, 'src/fulgurjs/types/remote-react.d/_paths.d.ts'), 'utf8')
if (!pathsHint.includes('"paths"')) fail('精确轨缺少 paths 启用说明')
log('双轨声明内容 OK（ambient 可解析 / 转发模块含 props 与具名导出 / paths 说明）')

// 2+3. 探针工程（typecheck/ 目录被 .gitignore；tsconfig.typecheck.json 已配 paths→精确轨）
// D06 §8.1：用例矩阵独立化——每个负向用例单独写盘、单独编译、断言预期错误码与位置，
// 不得把任意非零退出当通过；任何 as any/as unknown 断言遮蔽都禁止。
const probeDir = path.join(HOST, 'typecheck')
fs.mkdirSync(probeDir, { recursive: true })
const tscRun = () => spawnSync(TSC, ['-p', 'tsconfig.typecheck.json'], { cwd: HOST, encoding: 'utf8' })

const LEGAL = `import RemoteButton from 'remote-react/Button'\nimport type { ButtonProps } from 'remote-react/Button'\nimport type { Context } from 'react'\nimport { formatMoney, formatDate } from 'remote-react/utils'\nimport ThemeContext from 'remote-react/theme-context'\n\nconst props: ButtonProps = { label: '远程按钮', onClick: () => {} }\nexport const Ok = () => <RemoteButton label="合法" onClick={() => {}} />\nexport const money = formatMoney(12.5)\nexport const d = formatDate('2026-09-28T00:00:00Z')\nexport const ctx: Context<{ theme: 'light' | 'dark'; account: string }> = ThemeContext\n`

// 负向用例矩阵：[名称, 完整探针源码, 预期诊断片段]（D06 §8.1：独立用例+预期错误定位）
const NEGATIVE_CASES = [
  ['遗漏必填字段 label',
    `import RemoteButton from 'remote-react/Button'\nexport const Probe = () => <RemoteButton onClick={() => {}} />\n`, ['label']],
  ['错误字段类型 label={42}',
    `import RemoteButton from 'remote-react/Button'\nexport const Probe = () => <RemoteButton label={42} onClick={() => {}} />\n`, ['TS2322']],
  ['错误回调签名 onClick 接收数字',
    `import RemoteButton from 'remote-react/Button'\nexport const Probe = () => <RemoteButton label="x" onClick={(n: number) => void n} />\n`, ['TS2322']],
  ['普通函数错误参数',
    `import { formatMoney } from 'remote-react/utils'\nexport const call = () => formatMoney('definitely-not-a-number')\n`, ['TS2345']],
]

const writeProbe = (code) => {
  fs.writeFileSync(path.join(probeDir, 'probe.tsx'), code)
}

writeProbe(LEGAL)
let r = tscRun()
if (r.status !== 0) {
  console.error(r.stdout)
  fail('合法消费者类型检查失败（应通过）')
}
log('合法消费者 tsc 通过（JSX 合法 props / 具名函数 / Context 类型）')

for (const [name, probe, expectedTokens] of NEGATIVE_CASES) {
  writeProbe(probe)
  r = tscRun()
  if (r.status === 0) fail(`负向用例「${name}」仍编译通过——类型已退化为 any`)
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (!expectedTokens.some((tok) => out.includes(tok))) {
    console.error(out)
    fail(`负向用例「${name}」的诊断未命中预期标记 ${expectedTokens.join('/')}`)
  }
  log(`负向用例「${name}」被拒绝 ✓（诊断含 ${expectedTokens.join('/')}）`)
}

// 清理负向探针，避免混入后续编译
fs.rmSync(path.join(probeDir, 'probe.tsx'), { force: true })

// 4. any 降级：真实生成器路径由 packages/plugin/tests/dts-degrade.test.ts 权威覆盖
//（真实 manifest/fsRoot 配置 + generateDevTypes 输出 + 真实 TypeScript 程序编译，
// 含 精确→降级→恢复 三步不重建工程）。本脚本调用同一测试文件作为 e2e 门禁的一部分，
// 不再手写 declare module 冒充生成器输出（D06 §8.1）。
const unit = spawnSync('npx', ['vitest', 'run', 'tests/dts-degrade.test.ts', 'tests/dts-paths-covers.test.ts'], {
  cwd: path.join(REPO, 'packages/plugin'), encoding: 'utf8', stdio: 'inherit',
})
if (unit.status !== 0) fail('真实生成器 any 降级/双轨判定单测未通过（见上方输出）')
log('any 降级（真实生成器+真实编译）与双轨判定 单测通过 ✓')

fs.rmSync(probeDir, { recursive: true, force: true })
log('PASS: R15 类型直连 / 负向用例矩阵 / any 降级（真实生成器） 全部通过')
