/**
 * doctor --config（离线接入预检 runSourceDoctor）单测。
 * 覆盖：缺 expose/setup 文件 FAIL、地址/history/glob/状态风险 WARN、业务模块不执行、
 * 别名/目录外/资源/动态路径/解析失败/256 上限的 complete 语义、自定义 bare 别名不冒充解析、
 * 人工检查项保留、index.html 入口跟随。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runSourceDoctor } from '../src/doctor-source'

let root = ''

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'fg-doctor-source-'))
})
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

function write(relative: string, content: string): string {
  const file = join(root, relative)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
  return file
}

function config(body: string): string {
  return write('fulgurjs.config.ts', `export default {\n  name: 'test-app',\n${body}\n}\n`)
}

async function doctorFor(body: string) {
  const { checks, failed, complete, manualChecks, integrationFiles, filesScanned } = await runSourceDoctor(config(body))
  return { checks, failed, complete, manualChecks, integrationFiles, filesScanned }
}

const levelOf = (checks: { item: string; level: string }[], item: string) =>
  checks.filter(c => c.item === item).map(c => c.level)

describe('doctor --config：确定错误与风险分级', () => {
  it('D1 expose 源文件缺失 → 配置加载 FAIL（预检不退化为用法错误）；文件存在 → PASS', async () => {
    const r = await doctorFor("  exposes: { './bridge': './src/nope.ts' },")
    expect(levelOf(r.checks, '配置加载')).toEqual(['FAIL'])
    expect(r.failed).toBe(true)
    expect(r.checks[0]!.fix, '三段式修法保留').toBeTruthy()

    write('src/real.ts', "import App from './App.vue'\nexport default App\n")
    write('src/App.vue', '<template><p>x</p></template>')
    const ok = await doctorFor("  exposes: { './bridge': './src/real.ts' },")
    expect(levelOf(ok.checks, "expose ./bridge")).toEqual(['PASS'])
    expect(ok.failed).toBe(false)
  })

  it('D1 setup 文件缺失 → 配置加载 FAIL', async () => {
    const r = await doctorFor("  exposes: {},\n  setup: './src/setup-missing.ts',")
    expect(levelOf(r.checks, '配置加载')).toEqual(['FAIL'])
    expect(r.failed).toBe(true)
  })

  it('D2 远程地址风险是 WARN，不是 FAIL', async () => {
    write('src/index.ts', 'console.log(1)\n')
    const r = await doctorFor(
      "  exposes: { './a': './src/index.ts' },\n" +
      "  remotes: {\n" +
      "    fnRemote: () => 'http://x/',\n" +
      "    localRemote: 'http://localhost:7001/remoteEntry.js',\n" +
      "    halfRemote: { dev: 'http://dev/' },\n" +
      "  },")
    expect(levelOf(r.checks, 'remotes.fnRemote')).toEqual(['WARN'])
    expect(levelOf(r.checks, 'remotes.localRemote')).toEqual(['WARN'])
    expect(levelOf(r.checks, 'remotes.halfRemote')).toEqual(['WARN'])
    expect(r.failed, '地址风险不冒充确定缺陷').toBe(false)
  })

  it('D2 setActivePinia+await 与扫描 .ts 的业务 glob 是 WARN', async () => {
    write('src/pinia-mix.ts', "import { setActivePinia } from 'pinia'\nexport async function f() { setActivePinia(x)\n await g() }\n")
    const r = await doctorFor("  exposes: { './b': './src/pinia-mix.ts' },")
    expect(r.checks.filter(c => c.item.includes('pinia-mix') && c.level === 'WARN').length).toBeGreaterThan(0)

    write('src/glob-user.ts', "const mods = import.meta.glob('./modules/**/*.ts')\nexport default mods\n")
    const g = await doctorFor("  exposes: { './c': './src/glob-user.ts' },")
    expect(g.checks.filter(c => c.item.includes('glob-user') && c.level === 'WARN').length).toBeGreaterThan(0)
    expect(g.complete, 'glob 不宣称完整展开').toBe(false)
  })

  it('D2 桥接装配 + createWebHistory（无 defineApplication）是 WARN', async () => {
    write('src/legacy-bridge.ts',
      "import { createWebHistory } from 'vue-router'\nimport { defineBridgeApp } from '@fulgurjs/federation/vue'\nexport default defineBridgeApp(() => ({ history: createWebHistory() }))\n")
    const r = await doctorFor("  exposes: { './d': './src/legacy-bridge.ts' },")
    expect(r.checks.filter(c => c.item.includes('legacy-bridge') && c.level === 'WARN').length).toBeGreaterThan(0)
  })
})

describe('doctor --config：执行边界与扫描范围', () => {
  it('D3 只执行配置文件：业务模块（含 remote 地址回调）不执行', async () => {
    write('src/touched.ts', ';(globalThis as Record<string, unknown>).__fgTouched = true\nexport default 1\n')
    delete (globalThis as Record<string, unknown>).__fgTouched
    let callbackRan = false
    ;(globalThis as Record<string, unknown>).__fgCb = () => { callbackRan = true }
    await runSourceDoctor(write('fulgurjs.config.ts',
      "export default {\n  name: 't',\n  exposes: { './x': './src/touched.ts' },\n  remotes: { r: () => 'http://127.0.0.1:1/' },\n}\n"))
    expect((globalThis as Record<string, unknown>).__fgTouched, '业务模块不被执行').toBeUndefined()
    expect(callbackRan, 'remote 地址回调不执行').toBe(false)
    delete (globalThis as Record<string, unknown>).__fgCb
  })

  it('D6 相对导入与 @/ ~/ 别名被跟随；资源跳过；目录外源码 WARN', async () => {
    write('src/alias-entry.ts', "import './nested/dep.vue'\nimport '@/lib/at-dep.ts'\nimport '~/lib/tilde-dep.ts'\nimport logo from './logo.png'\nexport default 1\n")
    write('src/nested/dep.vue', '<template><p>d</p></template>')
    write('src/lib/at-dep.ts', 'export const a = 1\n')
    write('src/lib/tilde-dep.ts', 'export const b = 2\n')
    const r = await doctorFor("  exposes: { './e': './src/alias-entry.ts' },")
    expect(r.complete, '@/ 与 ~/ 已解析，无目录外/动态路径').toBe(true)
    expect(r.filesScanned, '入口+3个真实依赖；png 资源跳过').toBe(4)

    // 目录外文件必须真实存在：不存在时走"无法跟随"WARN，存在但在 appRoot 外才是目录外形态。
    // mkdtemp 的 root 是父目录下的一级目录：从 src/outside-ref.ts 看，../../ 即 root 的父目录
    writeFileSync(join(root, '..', 'fg-doctor-external-peer.ts'), 'export const peer = 1\n')
    write('src/outside-ref.ts', "import '../../fg-doctor-external-peer.ts'\nexport default 1\n")
    const out = await doctorFor("  exposes: { './f': './src/outside-ref.ts' },")
    expect(out.checks.some(c => c.item === '目录外源码' && c.level === 'WARN')).toBe(true)
    expect(out.complete).toBe(false)
  })

  it('D7 自定义 bare 别名不冒充已解析：跳过且不产生 PASS/WARN 声明', async () => {
    write('src/bare-alias.ts', "import { x } from 'my-ui/components'\nexport default x\n")
    const r = await doctorFor("  exposes: { './g': './src/bare-alias.ts' },")
    // bare specifier 静态上无法与 npm 包区分：不跟随、不 WARN、不在清单里宣称已扫描。
    // 扫描范围检查项如实说明这一边界（人工核实自定义别名见 manualChecks 之外的文档指引）。
    expect(r.checks.some(c => c.item.includes('bare-alias'))).toBe(false)
    expect(r.checks.find(c => c.item === '源码扫描范围')!.level).toBe('PASS')
  })

  it('D6 动态 import 路径与解析失败 → complete=false；失败文件 WARN', async () => {
    write('src/dynamic-path.ts', "const m = await import(`./mods/${name}.ts`)\nexport default m\n")
    const d = await doctorFor("  exposes: { './h': './src/dynamic-path.ts' },")
    expect(d.complete, '动态路径不宣称完整').toBe(false)

    write('src/unparseable.ts', 'this is not valid (( typescript ]]\n')
    const u = await doctorFor("  exposes: { './i': './src/unparseable.ts' },")
    expect(u.complete).toBe(false)
    expect(u.checks.some(c => c.item.includes('unparseable') && c.level === 'WARN')).toBe(true)
  })

  it('D6 超过 256 文件上限 → complete=false', async () => {
    mkdirSync(join(root, 'src/many'), { recursive: true })
    const chain: string[] = []
    for (let i = 0; i < 260; i++) {
      write(`src/many/f${i}.ts`, `import './f${i + 1}.ts'\nexport default ${i}\n`)
      chain.push(`src/many/f${i}.ts`)
    }
    const r = await doctorFor("  exposes: { './j': './src/many/f0.ts' },")
    expect(r.complete, '超过 256 文件依赖图停止').toBe(false)
  }, 30000)

  it('D6/D8 index.html 的 module 入口被跟随；无入口且有 remotes → complete=false', async () => {
    write('index.html', '<script type="module" src="/src/main.ts"></script>')
    write('src/main.ts', "import './from-html.ts'\nconsole.log('main')\n")
    write('src/from-html.ts', 'export default 1\n')
    const r = await doctorFor("  exposes: {} ,")
    expect(r.filesScanned, 'html 入口指向的 main.ts 及其依赖计入').toBe(2)

    // 独立 appRoot：共享根目录里已有前序用例写入的 index.html，会掩盖"无入口"形态
    const isolated = join(root, 'no-entry-app')
    mkdirSync(isolated, { recursive: true })
    writeFileSync(join(isolated, 'fulgurjs.config.ts'),
      "export default { name: 'no-entry', exposes: {}, remotes: { r: 'http://localhost:1/e.js' } }\n")
    const noEntry = await runSourceDoctor(join(isolated, 'fulgurjs.config.ts'))
    expect(noEntry.complete, '有 remotes 但没有 html 入口').toBe(false)
  })

  it('D9 人工检查项与文件清单保留', async () => {
    const r = await doctorFor("  exposes: {},")
    expect(r.manualChecks.length).toBeGreaterThan(0)
    expect(r.integrationFiles.required.length).toBeGreaterThan(0)
    expect(r.integrationFiles.optional.length).toBeGreaterThan(0)
    expect(r.integrationFiles.existing.length).toBeGreaterThan(0)
    const scan = r.checks.find(c => c.item === '源码扫描范围')!
    expect(scan.level).toBe('PASS')
    expect(r.complete).toBe(true)
  })
})

describe('接入前一次暴露接线问题', () => {
  it('HTML 确定缺失入口与中断记录是 FAIL', async () => {
    write('index.html', '<script type="module" src="/src/no-entry.ts"></script>')
    let r = await doctorFor('')
    expect(r.checks.some(c => c.item === 'index.html 入口' && c.level === 'FAIL')).toBe(true)
    write('index.html', '')
    write('.fulgurjs-init-pending.json', '{}')
    r = await doctorFor('')
    expect(r.checks.some(c => c.item === '接入写入恢复' && c.level === 'FAIL')).toBe(true)
    rmSync(join(root, '.fulgurjs-init-pending.json'))
  })
  it('运行时声明导入不能冒充普通业务源码，类型提示需正负验证', async () => {
    write('src/runtime-types.ts', "import './bad.d.ts'\nexport const x=1")
    write('src/bad.d.ts', 'export {}')
    const r = await doctorFor("  exposes: {'./types': './src/runtime-types.ts'}, remotes: {a: {dev:'http://localhost:5174',prod:'/a'}}")
    expect(r.checks.some(c => c.level === 'FAIL' && c.symptom.includes('运行时代码导入了类型声明'))).toBe(true)
    expect(r.checks.some(c => c.item === '远程类型接线' && c.level === 'WARN')).toBe(true)
  })
})
