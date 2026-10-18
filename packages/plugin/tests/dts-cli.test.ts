/**
 * `fulgurjs types` 命令测试：提供方生成验证退出码、旧配置拒绝、发现检查失败非零。
 * 宿主同步路径的核心逻辑由 dts-sync.test 覆盖，这里覆盖命令编排与退出码契约。
 */
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runTypesCommand } from '../src/dts-cli'
import * as sync from '../src/dts-sync'

const pluginRoot = path.resolve(__dirname, '..')
let tmp = ''
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-cli-'))
})
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function makeProject(name: string, files: Record<string, string>): string {
  const root = path.join(tmp, name)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  try { fs.symlinkSync(path.join(pluginRoot, 'node_modules', 'typescript'), path.join(root, 'node_modules', 'typescript'), 'dir') } catch { /* 已存在 */ }
  return root
}

describe('runTypesCommand（fulgurjs types）', () => {
  it('缺少虚拟模块类型时提示插件环境声明，实体依赖仍提示安装且严格失败', async () => {
    const root = makeProject('missing-externals', {
      'fulgurjs.config.ts': "export default { name: 'host', remotes: { remote: 'http://localhost:9999/remote' } }\n",
      'tsconfig.json': JSON.stringify({ include: ['src'] }),
      'src/index.ts': 'export {}\n',
      'package.json': JSON.stringify({ name: 'host', private: true, type: 'module' }),
    })
    const syncSpy = vi.spyOn(sync, 'syncRemoteTypes').mockResolvedValue({ status: 'synced', message: 'synced' })
    const metadataSpy = vi.spyOn(sync, 'readMetadata').mockReturnValue({
      externals: ['virtual:svg-icons-register', '\0virtual:internal', 'missing-component-library'],
    } as ReturnType<typeof sync.readMetadata>)
    try {
      const r = await runTypesCommand({ cwd: root })
      expect(r.exitCode).toBe(1)
      const output = r.lines.join('\n')
      expect(output).toContain('TYP-005')
      expect(output).toContain('Vite 虚拟模块，不能作为 npm 包安装')
      expect(output).toContain('client 类型声明')
      expect(output).not.toContain('npm i -D virtual:')
      expect(output).not.toContain('npm i -D \0')
      expect(output).toContain('npm i -D missing-component-library')
    } finally {
      syncSpy.mockRestore()
      metadataSpy.mockRestore()
    }
  })
  it('提供方生成成功 + 发现检查覆盖 → 退出码 0', async () => {
    const root = makeProject('ok', {
      'fulgurjs.config.ts': "export default { name: 'provider', exposes: { './a': './src/a.ts' } }\n",
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true }, include: ['src'] }),
      'src/a.ts': 'export const value: 42 = 42\n',
      'package.json': JSON.stringify({ name: 'p', private: true, type: 'module' }),
    })
    // defineConfig 是包根导出——软链本包供 esbuild 配置加载解析
    fs.mkdirSync(path.join(root, 'node_modules', '@fulgurjs'), { recursive: true })
    try { fs.symlinkSync(pluginRoot, path.join(root, 'node_modules', '@fulgurjs', 'federation'), 'dir') } catch { /* 已存在 */ }
    const r = await runTypesCommand({ cwd: root })
    expect(r.lines.join('\n')).toContain('声明 bundle 生成成功')
    expect(r.lines.join('\n')).toContain('[discovery] ✓')
    expect(r.exitCode).toBe(0)
  })

  it('提供方闭包编译错误 → 退出码非零（严格门禁）', async () => {
    const root = makeProject('bad', {
      'fulgurjs.config.ts': "export default { name: 'provider', exposes: { './a': './src/a.ts' } }\n",
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true }, include: ['src'] }),
      'src/a.ts': 'export const value: number = "not a number"\n',
      'package.json': JSON.stringify({ name: 'p', private: true, type: 'module' }),
    })
    const r = await runTypesCommand({ cwd: root })
    expect(r.exitCode).toBe(1)
    expect(r.lines.join('\n')).toContain('TYP-001')
  })

  it('无 exposes/remotes → 无类型工作，退出码 0', async () => {
    const root = makeProject('empty', {
      'fulgurjs.config.ts': "export default { name: 'app', shared: { vue: {} } }\n",
      'package.json': JSON.stringify({ name: 'p', private: true, type: 'module' }),
    })
    const r = await runTypesCommand({ cwd: root })
    expect(r.exitCode).toBe(0)
    expect(r.lines.join('\n')).toContain('没有类型工作可做')
  })
})
