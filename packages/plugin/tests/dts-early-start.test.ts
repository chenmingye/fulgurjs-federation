/**
 * dev 类型生成的启动时机：配置解析阶段（config 钩子）就创建类型服务，
 * 让编译子进程尽早与 Vite 其余启动工作并行；build 模式不得创建。
 */
import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../src/dts-serve', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/dts-serve')>()
  return {
    ...actual,
    createDevTypesServer: mocks.create.mockImplementation(() => ({
      revision: () => null,
      servePath: () => null,
      invalidate: () => {},
      markInputChanged: () => {},
      isGenerating: () => false,
      dispose: () => {},
    })),
  }
})
import { federation } from '../src/index'

function project(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-early-types-'))
  fs.mkdirSync(path.join(root, 'src'))
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"probe","private":true}')
  fs.writeFileSync(path.join(root, 'src/Entry.vue'), '<template><div /></template>')
  return root
}

async function runConfig(root: string, command: 'serve' | 'build', options: Record<string, unknown> = {}, isPreview = false): Promise<void> {
  const plugins = federation({ name: 'probe', exposes: { './Entry': './src/Entry.vue' }, ...options } as never)
  const core = plugins.find((plugin) => plugin.name === 'fulgurjs:core')!
  await (core.config as (config: unknown, env: { command: 'serve' | 'build'; mode: string; isPreview?: boolean }) => Promise<unknown>)({ root }, { command, mode: command === 'build' ? 'production' : 'development', isPreview })
}

it('serve 配置解析阶段创建类型服务，build 不创建', async () => {
  const root = project()
  try {
    mocks.create.mockClear()
    await runConfig(root, 'serve')
    expect(mocks.create).toHaveBeenCalledTimes(1)
    mocks.create.mockClear()
    await runConfig(root, 'build')
    expect(mocks.create).not.toHaveBeenCalled()
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('vite preview 不创建类型服务', async () => {
  const root = project()
  try {
    mocks.create.mockClear()
    await runConfig(root, 'serve', {}, true)
    expect(mocks.create).not.toHaveBeenCalled()
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('dts:false 不创建类型服务', async () => {
  const root = project()
  try {
    mocks.create.mockClear()
    await runConfig(root, 'serve', { dts: false })
    expect(mocks.create).not.toHaveBeenCalled()
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
