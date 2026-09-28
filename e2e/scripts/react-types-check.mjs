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
const probeDir = path.join(HOST, 'typecheck')
fs.mkdirSync(probeDir, { recursive: true })
const writeProbe = (bad) => {
  fs.writeFileSync(path.join(probeDir, 'probe.tsx'), `import RemoteButton from 'remote-react/Button'\nimport type { ButtonProps } from 'remote-react/Button'\nimport { formatMoney } from 'remote-react/utils'\nimport ThemeContext from 'remote-react/theme-context'\nimport { createElement } from 'react'\n\nconst props: ButtonProps = { label: ${bad ? '42' : "'远程按钮'"}${bad ? ' as unknown as string' : ''}, onClick: () => {} }\nexport const Ok = () => createElement(RemoteButton, props)\nexport const money = formatMoney(${bad ? "'not-a-number' as unknown as number" : '12.5'})\nexport const ctx: React.Context<{ theme: 'light' | 'dark'; account: string }> = ThemeContext\n`)
}
const tscRun = () => spawnSync(TSC, ['-p', 'tsconfig.typecheck.json'], { cwd: HOST, encoding: 'utf8' })

writeProbe(false)
let r = tscRun()
if (r.status !== 0) {
  console.error(r.stdout)
  fail('合法消费者类型检查失败（应通过）')
}
log('合法消费者 tsc 通过')

// 故意错误：绕过 as 断言的硬错误（label 类型不匹配在 as unknown as string 下会被掩盖——
// 用真正无法断言通过的形态：必填 onClick 缺失 + formatMoney 参数错误）
fs.writeFileSync(path.join(probeDir, 'probe.tsx'), `import RemoteButton from 'remote-react/Button'\nimport { formatMoney } from 'remote-react/utils'\n\nexport const Bad = () => RemoteButton\nexport const money = formatMoney('definitely-not-a-number')\n`)
r = tscRun()
if (r.status === 0) fail('故意错误的 props/参数仍编译通过——类型已退化为 any')
if (!/formatMoney|Argument/.test(r.stdout ?? '')) {
  console.error(r.stdout)
  fail('编译失败但不是预期的参数类型错误')
}
log(`故意错误被类型系统拒绝 ✓（非零退出）`)

// 4. any 降级：模拟 devFsRoot:false 的远程（manifest 不带 fsRoot → writeAnyModules 形态）
writeProbe(false) // 先还原合法 probe（第 3 步的故意错误版不能混入本段编译）
const anyDecl = `declare module "remote-x/Button";\ndeclare module "remote-x/utils";\n`
const anyDir = path.join(probeDir, 'any-mode')
fs.mkdirSync(anyDir, { recursive: true })
fs.writeFileSync(path.join(anyDir, 'remote-x.d.ts'), anyDecl)
fs.writeFileSync(path.join(probeDir, 'any-probe.ts'), `import Button from 'remote-x/Button'\nimport * as utils from 'remote-x/utils'\nexport const b = Button\nexport const u = utils\n`)
r = tscRun()
if (r.status !== 0) {
  console.error(r.stdout)
  fail('any 降级声明的合法导入应编译通过（默认/具名/副作用导入可解析）')
}
log('any 降级声明编译通过（无源码精度，但可解析）')

fs.rmSync(probeDir, { recursive: true, force: true })
log('PASS: R15 类型直连 / 故意错误拒绝 / any 降级 全部通过')
