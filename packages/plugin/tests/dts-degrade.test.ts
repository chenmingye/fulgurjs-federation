/**
 * D03 回归：精确轨→降级→恢复 不留失效转发文件（任务书 §5）。
 * 修复前：writeAnyModules 不清理 `<remote>.d/` 精确目录，降级后宿主 paths 仍命中
 * 失效转发文件 → 消费者 TS2307。
 * 修复后：降级清插件自有精确目录；宿主 paths 目标缺失时回退到 ambient（可解析 any）；
 * 恢复源码后精确轨重建且错误 props 仍被拒绝。全程真实 TypeScript 程序编译。
 */
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { generateDevTypes } from '../src/dts'

function tmpProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'd03-degrade-'))
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'd03', private: true }))
  return root
}

/** 真实远程源码工程（fsRoot 指向它） */
function makeRemoteSource(root: string): string {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'd03-remote-'))
  fs.mkdirSync(path.join(remote, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(remote, 'src/Button.tsx'),
    'export interface ButtonProps { label: string; count: number }\nexport default function Button(props: ButtonProps): string { return props.label }\n',
  )
  void root
  return remote
}

const serverOf = () => ({
  config: { server: { origin: 'http://localhost:5199' } },
  resolvedUrls: { local: ['http://localhost:5199'] },
} as never)

function manifestOf(fsRoot: string | undefined) {
  return {
    schemaVersion: 1,
    id: 'r',
    name: 'r',
    version: '5.1.0',
    devServer: true,
    base: '/',
    entry: '/@fulgurjs-entry.js',
    ...(fsRoot ? { fsRoot } : {}),
    exposes: [{ name: './Button', src: './src/Button.tsx', file: '/src/Button.tsx' }],
    shared: [],
  }
}

function hostOpts(root: string) {
  return {
    name: 'host', exposes: [], remotes: [{ key: 'r', name: 'r', shareScope: 'default', devEntry: 'http://localhost:5199/@fulgurjs-entry.js', prodEntry: '/r' }],
    shared: [], shareScope: 'default', filename: 'x.js', runtimePlugins: [], dts: true,
    root, pluginVersion: '5.1.1', pkgDependencies: {}, warnings: [], devSharedSelf: false,
    devCorsOrigins: undefined as never, devFsRoot: true,
  }
}

/** 消费者工程：paths 指向精确目录 + 一个导入 r/Button 的文件；返回真实编译诊断文本 */
function compileConsumer(root: string, consumerCode: string): { exitOk: boolean; diagnostics: string } {
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx',
      strict: true, skipLibCheck: true, noEmit: true, types: [], baseUrl: '.',
      paths: { 'r/*': ['./src/fulgurjs/types/r.d/*'] },
    },
    include: ['src/fulgurjs/types', 'consumer.ts'],
  }))
  fs.writeFileSync(path.join(root, 'consumer.ts'), consumerCode)
  const cfg = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root)
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const diags = ts.getPreEmitDiagnostics(program)
  const text = ts.formatDiagnostics(diags, { getCurrentDirectory: () => root, getNewLine: () => '\n', getCanonicalFileName: (f) => f })
  return { exitOk: diags.length === 0, diagnostics: text }
}

describe('D03: 精确→降级→恢复（同一工程，不重建）', () => {
  it('降级后清理失效转发；paths 命中缺失目标回退 ambient；恢复源码重建精确轨', async () => {
    const root = tmpProject()
    const remote = makeRemoteSource(root)
    let currentRemote = remote // 动态引用：第 3 步恢复用新目录
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => manifestOf(currentRemote) }))
    const origFetch = globalThis.fetch

    // ── 第 1 步：源码可达 → 精确轨（转发文件含源码类型）──
    globalThis.fetch = fetchMock as never
    try {
      await generateDevTypes(hostOpts(root) as never, serverOf())
    } finally {
      globalThis.fetch = origFetch
    }
    const preciseDir = path.join(root, 'src/fulgurjs/types/r.d')
    expect(fs.existsSync(path.join(preciseDir, 'Button.ts'))).toBe(true)
    const ok = compileConsumer(root,
      "import Button from 'r/Button'\nexport const x = Button\n")
    expect(ok.exitOk, ok.diagnostics).toBe(true)

    // ── 第 2 步：撤源码（fsRoot 指向已删目录）→ 降级 any ──
    fs.rmSync(remote, { recursive: true, force: true })
    globalThis.fetch = fetchMock as never
    try {
      await generateDevTypes(hostOpts(root) as never, serverOf())
    } finally {
      globalThis.fetch = origFetch
    }
    // 失效转发必须被清理（修复前残留 → TS2307）
    expect(fs.existsSync(path.join(preciseDir, 'Button.ts')), '降级后失效转发文件应被清理').toBe(false)
    const ambient = path.join(root, 'src/fulgurjs/types/r.d.ts')
    expect(fs.existsSync(ambient)).toBe(true)
    expect(fs.readFileSync(ambient, 'utf8')).toContain('declare module "r/Button"')
    // paths 命中缺失目标 → 回退 ambient：消费者编译通过（可解析 any）
    const degraded = compileConsumer(root,
      "import Button from 'r/Button'\nexport const x = Button\n")
    expect(degraded.exitOk, degraded.diagnostics).toBe(true)

    // ── 第 3 步：恢复源码 → 精确轨重建，错误 props 仍被拒绝 ──
    const remote2 = makeRemoteSource(root)
    currentRemote = remote2
    globalThis.fetch = fetchMock as never
    try {
      await generateDevTypes(hostOpts(root) as never, serverOf())
    } finally {
      globalThis.fetch = origFetch
    }
    expect(fs.existsSync(path.join(preciseDir, 'Button.ts'))).toBe(true)
    const bad = compileConsumer(root,
      "import Button from 'r/Button'\nexport const x = Button({ label: 42, count: 1 })\n")
        expect(bad.exitOk, '恢复精确轨后错误 props 必须被拒绝：\n' + bad.diagnostics).toBe(false)
    // TS2307（找不到转发目标）不算 props 校验失败——必须是真实的类型不匹配诊断
    expect(bad.diagnostics).not.toContain('TS2307')
    expect(/label|Argument|not assignable| assignable/i.test(bad.diagnostics)).toBe(true)
    void remote2
  })

  it('dts:false：不生成且不删除既有输出（停止策略：只停不删）', async () => {
    const root = tmpProject()
    const ambient = path.join(root, 'src/fulgurjs/types/r.d.ts')
    fs.mkdirSync(path.join(root, 'src/fulgurjs/types'), { recursive: true })
    fs.writeFileSync(ambient, '// pre-existing\n')
    const o = hostOpts(root) as never
    ;(o as any).dts = false
    await generateDevTypes(o, serverOf())
    // 既有输出原样保留（插件不越权删除）；本轮不生成新内容
    expect(fs.readFileSync(ambient, 'utf8')).toBe('// pre-existing\n')
    expect(fs.existsSync(path.join(root, 'src/fulgurjs/types/r.d'))).toBe(false)
  })
})
