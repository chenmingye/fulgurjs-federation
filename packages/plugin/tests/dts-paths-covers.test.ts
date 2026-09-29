/**
 * D02 回归：hostPathsCovers 语义化判定（任务书 §4）。
 * 修复前：注释中的 paths、无关 tsconfig.node.json 的 paths、仅 exact 键都会误判启用精确轨。
 * 修复后：只有「实际生效的 tsconfig 上下文」中「语义解析出的 paths」覆盖 `<remote>/*` 才算启用。
 */
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { generateDevTypes, hostPathsCovers } from '../src/dts'

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'd02-paths-'))
}

function fakeServer(manifest: unknown) {
  return {
    config: { server: { origin: 'http://localhost:5199' } },
    resolvedUrls: { local: ['http://localhost:5199'] },
  } as never
}

const MANIFEST = {
  schemaVersion: 1,
  id: 'r',
  name: 'r',
  version: '5.1.0',
  devServer: true,
  base: '/',
  entry: '/@fulgurjs-entry.js',
  fsRoot: '/nonexistent-root-for-degradation',
  exposes: [{ name: './Button', src: './src/Button.tsx', file: '/src/Button.tsx' }],
  shared: [],
}

describe('hostPathsCovers 语义判定', () => {
  it('主 tsconfig 有效 wildcard paths → true', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { 'r/*': ['./types/r.d/*'] } },
    }))
    expect(hostPathsCovers(root, 'r')).toBe(true)
  })

  it('注释中的 paths 不误判（D02 复现用例）', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }))
    fs.writeFileSync(path.join(root, 'tsconfig.node.json'),
      '{ "compilerOptions": { /* "r/*": ["types/r.d/*"] */ } }')
    expect(hostPathsCovers(root, 'r')).toBe(false)
  })

  it('无关 tsconfig.node.json 的 paths 不影响主上下文', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }))
    fs.writeFileSync(path.join(root, 'tsconfig.node.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./types/r.d/*'] } },
    }))
    expect(hostPathsCovers(root, 'r')).toBe(false)
  })

  it('仅 exact 键（无 wildcard）不覆盖 r/Button（TS 语义：exact 只映射模块 r 本身）', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { paths: { 'r': ['./types/r.d/index'] } },
    }))
    expect(hostPathsCovers(root, 'r')).toBe(false)
  })

  it('extends 继承的 paths 按声明文件位置解析生效', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.base.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./shared-types/r.d/*'] } },
    }))
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      extends: './tsconfig.base.json',
      compilerOptions: {},
    }))
    expect(hostPathsCovers(root, 'r')).toBe(true)
  })

  it('目标指向别处：仍跳过 ambient（避免遮蔽用户自有映射），并给出诊断', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./vendor/r/*'] } },
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hit = hostPathsCovers(root, 'r', path.join(root, 'src/fulgurjs/types', 'r.d'))
    expect(hit).toBe(true) // 跳过 ambient（ambient 会遮蔽任何 paths 命中，实测行为）
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('未指向插件生成的精确目录'))
    warnSpy.mockRestore()
  })

  it('含注释/尾逗号的 JSONC 语义解析', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'),
      '{\n  // comment\n  "compilerOptions": {\n    "paths": { "r/*": ["./types/r.d/*"], }, // trailing\n  },\n}')
    expect(hostPathsCovers(root, 'r')).toBe(true)
  })

  it('无关 tsconfig.test.json 的真实 paths 不影响主上下文（5.1.2 主复现）', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }))
    fs.writeFileSync(path.join(root, 'tsconfig.test.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./unrelated-test-types/*'] } },
    }))
    expect(hostPathsCovers(root, 'r')).toBe(false)
  })

  it('solution references：app 子项目有 paths → true', () => {
    const root = tmpProject()
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.writeFileSync(path.join(root, 'tsconfig.app.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./types/r.d/*'] } },
      include: ['src/**/*'],
    }))
    fs.writeFileSync(path.join(root, 'tsconfig.node.json'), JSON.stringify({
      compilerOptions: {}, include: ['vite.config.ts'],
    }))
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      files: [], references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
    }))
    expect(hostPathsCovers(root, 'r')).toBe(true)
  })

  it('solution references：仅 node 子项目有 paths → false（node 上下文不影响应用导入）', () => {
    const root = tmpProject()
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.writeFileSync(path.join(root, 'tsconfig.app.json'), JSON.stringify({
      compilerOptions: {}, include: ['src/**/*'],
    }))
    fs.writeFileSync(path.join(root, 'tsconfig.node.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./types/r.d/*'] } },
      include: ['vite.config.ts'],
    }))
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      files: [], references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
    }))
    expect(hostPathsCovers(root, 'r')).toBe(false)
  })

  it('仅 tsconfig.typecheck.json（无主配置）→ 按有效检查入口判定', () => {
    const root = tmpProject()
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.writeFileSync(path.join(root, 'tsconfig.typecheck.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./types/r.d/*'] } },
      include: ['src/**/*'],
    }))
    expect(hostPathsCovers(root, 'r')).toBe(true)
  })

  it('无主配置且多候选无法唯一确定上下文 → 安全回退 false 并告警', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.typecheck.json'), JSON.stringify({
      compilerOptions: {}, include: ['src/**/*'],
    }))
    fs.writeFileSync(path.join(root, 'tsconfig.other.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./x/*'] } },
      include: ['other/**/*'],
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(hostPathsCovers(root, 'r')).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('无法唯一确定应用 tsconfig 上下文'))
    warnSpy.mockRestore()
  })

  it('继承自父目录配置的 paths 目标按声明配置目录解析（诊断不再按使用方目录误算）', () => {
    const root = tmpProject()
    const confDir = path.join(root, 'config')
    fs.mkdirSync(confDir, { recursive: true })
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    // 声明在 config/tsconfig.base.json，目标相对它解析 → root/types/r.d
    fs.writeFileSync(path.join(confDir, 'tsconfig.base.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['../types/r.d/*'] } },
    }))
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      extends: './config/tsconfig.base.json', compilerOptions: {},
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 目标按「声明配置目录 + ../types/r.d」= root/types/r.d：preciseDir 指向它 → 无告警
    expect(hostPathsCovers(root, 'r', path.join(root, 'types/r.d'))).toBe(true)
    expect(warnSpy).not.toHaveBeenCalled()
    // 若误按使用方（root）目录解析会得到 root/types/r.d 同值——换成会暴露差异的场景：
    // 目标 ./types2 只能从声明目录解析出 confDir/types2（不存在），必产生告警
    fs.writeFileSync(path.join(confDir, 'tsconfig.base.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./types2/r.d/*'] } },
    }))
    expect(hostPathsCovers(root, 'r', path.join(root, 'src/fulgurjs/types/r.d'))).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('未指向插件生成的精确目录'))
    warnSpy.mockRestore()
  })

  it('无效 tsconfig（坏 JSON）→ 安全回退 false', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), '{ not json')
    expect(hostPathsCovers(root, 'r')).toBe(false)
  })
})

describe('D02 端到端（真实 tsc）：无关测试配置不抑制 ambient，应用接管后精确轨生效', () => {
  /** 真实远程源码（fsRoot 指向），带可校验的 props 类型 */
  function makeRemoteSource(): string {
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'd02-remote-'))
    fs.mkdirSync(path.join(remote, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(remote, 'src/Button.tsx'),
      'export interface ButtonProps { label: string; count: number }\n' +
      'export default function Button(props: ButtonProps): string { return props.label }\n',
    )
    return remote
  }

  const MANIFEST_OF = (fsRoot: string) => ({
    schemaVersion: 1, id: 'r', name: 'r', version: '5.1.0', devServer: true, base: '/',
    entry: '/@fulgurjs-entry.js', fsRoot,
    exposes: [{ name: './Button', src: './src/Button.tsx', file: '/src/Button.tsx' }],
    shared: [],
  })

  const serverOf = () => ({
    config: { server: { origin: 'http://localhost:5199' } },
    resolvedUrls: { local: ['http://localhost:5199'] },
  } as never)

  const hostOpts = (root: string) => ({
    name: 'host', exposes: [], remotes: [{ key: 'r', name: 'r', shareScope: 'default', devEntry: 'http://localhost:5199/@fulgurjs-entry.js', prodEntry: '/r' }],
    shared: [], shareScope: 'default', filename: 'x.js', runtimePlugins: [], dts: true,
    root, pluginVersion: '5.1.2', pkgDependencies: {}, warnings: [], devSharedSelf: false,
    devCorsOrigins: undefined as never, devFsRoot: true,
  })

  /** 真实 TS 程序编译：withPaths=false 为应用零配置轨；true 为应用已接管 paths 的精确轨 */
  function compileApp(root: string, consumerCode: string, withPaths = false): { exitOk: boolean; diagnostics: string } {
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx',
        strict: true, skipLibCheck: true, noEmit: true, types: [],
        ...(withPaths ? { baseUrl: '.', paths: { 'r/*': ['./src/fulgurjs/types/r.d/*'] } } : {}),
      },
      include: ['src'],
    }))
    fs.writeFileSync(path.join(root, 'src/consumer.tsx'), consumerCode)
    const cfg = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root)
    const program = ts.createProgram(parsed.fileNames, parsed.options)
    const diags = ts.getPreEmitDiagnostics(program)
    const text = ts.formatDiagnostics(diags, { getCurrentDirectory: () => root, getNewLine: () => '\n', getCanonicalFileName: (f) => f })
    return { exitOk: diags.length === 0, diagnostics: text }
  }

  it('无关 tsconfig.test.json 有 paths：ambient 照常生成且应用编译可解析；接管后精确轨生效', async () => {
    const root = tmpProject()
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'd02-e2e', private: true }))
    // 应用主配置：存在且无远程 paths（生成阶段即在场，符合 D02 复现场景）
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }))
    // 无关测试上下文：真实（非注释）paths —— 修复前它会让生成器误判「已接管」并压掉 ambient
    fs.writeFileSync(path.join(root, 'tsconfig.test.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./unrelated-test-types/*'] } },
    }))
    const remote = makeRemoteSource()
    const origFetch = globalThis.fetch
    globalThis.fetch = (async () => ({ ok: true, json: async () => MANIFEST_OF(remote) })) as never
    try {
      await generateDevTypes(hostOpts(root) as never, serverOf())
    } finally {
      globalThis.fetch = origFetch
    }
    // 源码可达 + 精确轨文件照常生成，但 ambient 不得被无关配置抑制
    expect(fs.existsSync(path.join(root, 'src/fulgurjs/types/r.d/Button.ts'))).toBe(true)
    const ambient = path.join(root, 'src/fulgurjs/types/r.d.ts')
    expect(fs.existsSync(ambient), '无关 tsconfig.test.json 的 paths 不得抑制 ambient').toBe(true)
    expect(fs.readFileSync(ambient, 'utf8')).toContain('declare module "r/Button"')

    // 应用上下文真实编译：零配置轨导入可解析
    const ok = compileApp(root, "import Button from 'r/Button'\nexport const x = Button\n")
    expect(ok.exitOk, ok.diagnostics).toBe(true)

    // ── 对照：应用 tsconfig.json 自己接管 paths → 重新生成 → ambient 撤销、精确轨生效 ──
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx',
        strict: true, skipLibCheck: true, noEmit: true, types: [], baseUrl: '.',
        paths: { 'r/*': ['./src/fulgurjs/types/r.d/*'] },
      },
      include: ['src'],
    }))
    globalThis.fetch = (async () => ({ ok: true, json: async () => MANIFEST_OF(remote) })) as never
    try {
      await generateDevTypes(hostOpts(root) as never, serverOf())
    } finally {
      globalThis.fetch = origFetch
    }
    expect(fs.existsSync(ambient), '应用接管 paths 后 ambient 应被跳过').toBe(false)
    const good = compileApp(root,
      "import Button from 'r/Button'\nexport const x = Button({ label: 'a', count: 1 })\n", true)
    expect(good.exitOk, good.diagnostics).toBe(true)
    const bad = compileApp(root,
      "import Button from 'r/Button'\nexport const x = Button({ label: 42, count: 1 })\n", true)
    expect(bad.exitOk, '精确轨必须拒绝错误 props：\n' + bad.diagnostics).toBe(false)
    expect(bad.diagnostics).not.toContain('TS2307')
  })
})

describe('D02 端到端：paths 误判不再抑制 ambient', () => {
  it('注释 paths 场景下 ambient 照常生成（用户导入可解析）', async () => {
    const root = tmpProject()
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }))
    fs.writeFileSync(path.join(root, 'tsconfig.node.json'),
      '{ "compilerOptions": { /* "r/*": ["types/r.d/*"] */ } }')
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'd02-e2e', private: true }))
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => MANIFEST }))
    const origFetch = globalThis.fetch
    globalThis.fetch = fetchMock as never
    const opts = {
      name: 'host', exposes: [], remotes: [{ key: 'r', name: 'r', shareScope: 'default', devEntry: 'http://localhost:5199/@fulgurjs-entry.js', prodEntry: '/r' }],
      shared: [], shareScope: 'default', filename: 'x.js', runtimePlugins: [], dts: true,
      root, pluginVersion: '5.1.0', pkgDependencies: {}, warnings: [], devSharedSelf: false,
      devCorsOrigins: undefined as never, devFsRoot: true,
    }
    try {
      await generateDevTypes(opts as never, fakeServer(MANIFEST))
    } finally {
      globalThis.fetch = origFetch
    }
    const ambient = path.join(root, 'src/fulgurjs/types/r.d.ts')
    // fsRoot 不可访问 → 降级 ambient（writeAnyModules）；不得因注释 paths 误跳过
    expect(fs.existsSync(ambient)).toBe(true)
    expect(fs.readFileSync(ambient, 'utf8')).toContain('declare module "r/Button";')
  })
})
