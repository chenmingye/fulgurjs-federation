/**
 * dev 类型生成的启动时机：配置解析阶段（config 钩子）就创建类型服务，
 * 让编译子进程尽早与 Vite 其余启动工作并行；build 模式不得创建。
 */
import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer, type Plugin } from 'vite'

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
      dispose: vi.fn(),
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
  const prepare = plugins.find(plugin => plugin.name === 'fulgurjs:types-prepare')!
  const env = { command, mode: command === 'build' ? 'production' : 'development', isPreview }
  try {
    ;(prepare.config as { handler(config: unknown, env: unknown): void }).handler({ root }, env)
    await (core.config as (config: unknown, env: unknown) => Promise<unknown>)({ root }, env)
  } finally { (prepare.closeBundle as Function)() }
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

it('类型准备优先于其他pre配置钩子，core复用；middleware关闭及同插件重启均正确释放', async () => {
  const root = project()
  mocks.create.mockClear()
  const group = federation({ name: 'probe', exposes: { './Entry': './src/Entry.vue' } })
  const blocker: Plugin = { name: 'slow-other-config', enforce: 'pre', config() {
    expect(mocks.create.mock.calls.length).toBeGreaterThan(0)
  } }
  const config = { root, configFile: false as const, plugins: [blocker, ...group], server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true } }
  let server: Awaited<ReturnType<typeof createServer>> | undefined
  try {
    server = await createServer(config)
    expect(mocks.create).toHaveBeenCalledTimes(1)
    const first = mocks.create.mock.results[0]!.value
    await server.close(); server = undefined
    expect(first.dispose).toHaveBeenCalledTimes(1)
    server = await createServer(config)
    expect(mocks.create).toHaveBeenCalledTimes(2)
  } finally { await server?.close(); fs.rmSync(root, { recursive: true, force: true }) }
})

it('准备之后root改变会取消旧任务，配置失败未接管的预取到期后释放且可重新创建', async () => {
  const firstRoot = project(), secondRoot = project()
  mocks.create.mockClear()
  vi.useFakeTimers()
  try {
    const options = { name: 'probe', exposes: { './Entry': './src/Entry.vue' } as Record<string, string> }
    const group = federation(options)
    const prep = group.find(plugin => plugin.name === 'fulgurjs:types-prepare')!
    const core = group.find(plugin => plugin.name === 'fulgurjs:core')!
    const hook = prep.config as { order: string; handler(config: unknown, env: unknown): void }
    expect(hook.order).toBe('pre')
    hook.handler({ root: firstRoot }, { command: 'serve', mode: 'development' })
    const first = mocks.create.mock.results[0]!.value
    await (core.config as Function)({ root: secondRoot }, { command: 'serve', mode: 'development' })
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(mocks.create.mock.calls[1]![0].root).toBe(secondRoot)
    const second = mocks.create.mock.results[1]!.value
    options.exposes['./Other'] = './src/Entry.vue'
    await (core.config as Function)({ root: secondRoot }, { command: 'serve', mode: 'development' })
    expect(second.dispose).toHaveBeenCalledTimes(1)
    const third = mocks.create.mock.results[2]!.value
    expect(mocks.create.mock.calls[2]![0].exposes).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(60000)
    expect(third.dispose).toHaveBeenCalledTimes(1)
    hook.handler({ root: secondRoot }, { command: 'serve', mode: 'development' })
    expect(mocks.create).toHaveBeenCalledTimes(4)
    ;(prep.closeBundle as Function)()
  } finally { vi.useRealTimers(); fs.rmSync(firstRoot, { recursive: true, force: true }); fs.rmSync(secondRoot, { recursive: true, force: true }) }
})
