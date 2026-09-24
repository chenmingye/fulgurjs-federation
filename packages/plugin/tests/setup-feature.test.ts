/**
 * 4.1.0 新增能力单测：
 * - options：setup 校验（CFG-012）/ 内部保留键冲突 / CFG-011 不支持选项硬报错 / devSharedSelf 角色推断（§12.4）
 * - virtual：dev/prod 容器 setup 元数据 + manifest setup 字段（内部 expose 进容器与预载面）
 * - context：clearAppContext 语义（清 context + 通知运行时清会话状态；无运行时静默幂等）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions, SETUP_EXPOSE_KEY, SETUP_CONTAINER_KEY, type FederationOptions } from '../src/options'
import { genDevRemoteEntry, genBuildRemoteEntry, genDevManifest, genProdManifest, genDevProvides } from '../src/virtual'
// 先 import 真运行时：模块求值即创建单例并挂 globalThis.__FULGURJS_RUNTIME__
import '../src/runtime/index'
import { clearAppContext, provideAppContext, getAppContext } from '../src/context'

const ROOT = process.cwd()

describe('options: setup 校验（CFG-012）', () => {
  it('合法 setup 归一化为内部保留 expose（内部标记 + 追加进 exposes）', () => {
    const n = normalizeOptions({ name: 'r', setup: './src/fulgurjs/setup.ts' } as FederationOptions, ROOT, 'build')
    expect(n.setup).toBeDefined()
    expect(n.setup!.name).toBe(SETUP_EXPOSE_KEY)
    expect(n.setup!.internal).toBe(true)
    expect(n.exposes.some((e) => e.internal)).toBe(true)
  })

  it('setup 空串 / 非字符串 → CFG-012', () => {
    expect(() => normalizeOptions({ name: 'r', setup: '' } as FederationOptions, ROOT, 'build')).toThrow('CFG-012')
    expect(() => normalizeOptions({ name: 'r', setup: 42 as unknown as string } as FederationOptions, ROOT, 'build')).toThrow('CFG-012')
  })

  it('用户 exposes 占用内部保留键 → CFG-012（含缺 ./ 前缀形态）', () => {
    expect(() =>
      normalizeOptions({ name: 'r', exposes: { './__fulgurjs_setup__': './src/x.ts' } } as FederationOptions, ROOT, 'build'),
    ).toThrow('CFG-012')
    expect(() =>
      normalizeOptions({ name: 'r', exposes: { './__fulgurjs_setup__': './src/x.ts' }, setup: './src/s.ts' } as FederationOptions, ROOT, 'build'),
    ).toThrow('CFG-012')
  })

  it('未配置 setup：NormalizedOptions.setup 为 undefined、exposes 无内部条目', () => {
    const n = normalizeOptions({ name: 'r', exposes: { './A': './src/a.vue' } } as FederationOptions, ROOT, 'build')
    expect(n.setup).toBeUndefined()
    expect(n.exposes.every((e) => !e.internal)).toBe(true)
  })
})

describe('options: CFG-011 不支持选项硬报错（§12.6，此前静默回落）', () => {
  it('remoteType 非 module → CFG-011', () => {
    expect(() => normalizeOptions({ name: 'r', remoteType: 'script' } as unknown as FederationOptions, ROOT, 'build')).toThrow('CFG-011')
  })

  it('library.type 非 module/esm → CFG-011', () => {
    expect(() =>
      normalizeOptions({ name: 'r', library: { type: 'var' } } as unknown as FederationOptions, ROOT, 'build'),
    ).toThrow('CFG-011')
  })

  it('automaticAsyncBoundary=false → CFG-011', () => {
    expect(() => normalizeOptions({ name: 'r', automaticAsyncBoundary: false } as FederationOptions, ROOT, 'build')).toThrow('CFG-011')
  })

  it('合法值（module/esm/缺省）照常通过', () => {
    expect(() => normalizeOptions({ name: 'r', remoteType: 'module', library: { type: 'esm' } } as unknown as FederationOptions, ROOT, 'build')).not.toThrow()
  })
})

describe('options: devSharedSelf 角色推断（§12.4，双向联邦不再依赖背诵）', () => {
  it('纯远程（只 exposes）→ true；纯宿主（只 remotes）→ false', () => {
    expect(normalizeOptions({ name: 'r', exposes: { './A': './a.vue' } } as FederationOptions, ROOT, 'build').devSharedSelf).toBe(true)
    expect(normalizeOptions({ name: 'h', remotes: { a: 'http://x' } } as FederationOptions, ROOT, 'build').devSharedSelf).toBe(false)
  })

  it('双角色（exposes + remotes）默认 true（4.1.0 起推断；此前默认 false 是已知错误配置来源）', () => {
    const n = normalizeOptions(
      { name: 'd', exposes: { './A': './a.vue' }, remotes: { b: 'http://x' } } as FederationOptions,
      ROOT,
      'build',
    )
    expect(n.devSharedSelf).toBe(true)
  })

  it('显式配置永远优先（双向宿主可显式关掉）', () => {
    const n = normalizeOptions(
      { name: 'd', exposes: { './A': './a.vue' }, remotes: { b: 'http://x' }, devSharedSelf: false } as FederationOptions,
      ROOT,
      'build',
    )
    expect(n.devSharedSelf).toBe(false)
  })

  it('仅 setup（无公开 exposes）的应用同样推断为 true（setup 模块被宿主消费）', () => {
    const n = normalizeOptions({ name: 'r', setup: './src/s.ts' } as FederationOptions, ROOT, 'build')
    expect(n.devSharedSelf).toBe(true)
  })
})

describe('virtual: dev/prod 容器 setup 元数据一致（§3.3.2）', () => {
  const withSetup = normalizeOptions(
    { name: 'remote-a', exposes: { './A': './src/a.vue' }, setup: './src/fulgurjs/setup.ts' } as FederationOptions,
    ROOT,
    'build',
  )
  const withoutSetup = normalizeOptions({ name: 'remote-a', exposes: { './A': './src/a.vue' } } as FederationOptions, ROOT, 'build')

  it('dev 容器入口：配置 setup 时导出元数据；未配置时不导出', () => {
    expect(genDevRemoteEntry(withSetup, '/remote-a/')).toContain(`export const ${SETUP_CONTAINER_KEY}`)
    expect(genDevRemoteEntry(withoutSetup, '/remote-a/')).not.toContain(SETUP_CONTAINER_KEY)
  })

  it('prod 容器入口：同款元数据 + 内部 expose 进模块映射（构建可解析）', () => {
    const code = genBuildRemoteEntry(withSetup, { './src/a.vue': '/abs/a.vue', './src/fulgurjs/setup.ts': '/abs/setup.ts' })
    expect(code).toContain(`export const ${SETUP_CONTAINER_KEY} = "${SETUP_EXPOSE_KEY}"`)
    expect(code).toContain(`"${SETUP_EXPOSE_KEY}": () => import("/abs/setup.ts")`)
    expect(genBuildRemoteEntry(withoutSetup, { './src/a.vue': '/abs/a.vue' })).not.toContain(SETUP_CONTAINER_KEY)
  })

  it('dev provides 虚拟模块包含内部 setup 的导入映射（dev 容器 get 可达）', () => {
    const provides = genDevProvides(withSetup)
    expect(provides).toContain(SETUP_EXPOSE_KEY)
    expect(provides).toContain('src/fulgurjs/setup.ts')
  })

  it('dev manifest：内部 expose 在 exposes 数组内（preload/CSS 通道复用）+ 顶层 setup 字段标识', () => {
    const m = genDevManifest(withSetup, '/remote-a/')
    expect(m.setup).toBe(SETUP_EXPOSE_KEY)
    expect(m.exposes.some((e) => e.name === SETUP_EXPOSE_KEY)).toBe(true)
    const plain = genDevManifest(withoutSetup, '/remote-a/')
    expect(plain.setup).toBeUndefined()
  })

  it('prod manifest：setup 字段仅在对应 expose 产物存在时写入', () => {
    const files = { [SETUP_EXPOSE_KEY]: { file: 'setup.js', css: ['setup.css'] }, './A': { file: 'a.js', css: [] } }
    const m = genProdManifest(withSetup, files, 'remoteEntry.js')
    expect(m.setup).toBe(SETUP_EXPOSE_KEY)
    const missing = genProdManifest(withSetup, { './A': { file: 'a.js', css: [] } }, 'remoteEntry.js')
    expect(missing.setup).toBeUndefined()
  })
})

describe('context: clearAppContext（§3.3 退出清理）', () => {
  beforeEach(() => {
    const ctx = ((globalThis as any).__FULGURJS_APP_CONFIG__ ?? {}) as Record<string, any>
    for (const k of Object.keys(ctx)) delete ctx[k]
  })

  it('清除整个 context 对象并通知运行时清会话状态', () => {
    const calls: number[] = []
    const prev = (globalThis as any).__FULGURJS_RUNTIME__
    // 单例已冻结不可 spyOn——用可观察桩替换
    ;(globalThis as any).__FULGURJS_RUNTIME__ = { loadRemote: () => {}, clearSessionState: () => { calls.push(1) } }
    provideAppContext({ user: { id: 'A' }, sessionKey: 's-1' })
    expect(getAppContext().user).toBeDefined()
    clearAppContext()
    expect(getAppContext()).toEqual({})
    expect(calls).toHaveLength(1)
    ;(globalThis as any).__FULGURJS_RUNTIME__ = prev
  })

  it('无运行时单例时静默幂等（退出动作不依赖联邦形态，不抛 CC-002）', () => {
    const prev = (globalThis as any).__FULGURJS_RUNTIME__
    delete (globalThis as any).__FULGURJS_RUNTIME__
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { user: { id: 'A' } }
    expect(() => clearAppContext()).not.toThrow()
    expect((globalThis as any).__FULGURJS_APP_CONFIG__).toBeUndefined()
    ;(globalThis as any).__FULGURJS_RUNTIME__ = prev
  })

  it('运行时缺 clearSessionState 方法（旧版本运行时）时不抛错', () => {
    const prev = (globalThis as any).__FULGURJS_RUNTIME__
    ;(globalThis as any).__FULGURJS_RUNTIME__ = { loadRemote: () => {} }
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { user: { id: 'A' } }
    expect(() => clearAppContext()).not.toThrow()
    expect((globalThis as any).__FULGURJS_APP_CONFIG__).toBeUndefined()
    ;(globalThis as any).__FULGURJS_RUNTIME__ = prev
  })
})
