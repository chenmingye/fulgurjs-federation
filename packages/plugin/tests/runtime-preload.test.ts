import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runtime: loadRemote exposes manifest CSS before resolving the module', () => {
  it('resolves a root-relative manifest and waits for only the requested expose stylesheet', async () => {
    vi.resetModules()
    ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined

    const links: Array<{
      rel: string
      href: string
      sheet: object | null
      listeners: Map<string, () => void>
      addEventListener: (type: string, listener: () => void) => void
      removeEventListener: (type: string, listener: () => void) => void
    }> = []
    const document = {
      baseURI: 'https://host.example.test/main/',
      querySelector(selector: string) {
        const href = selector.match(/^link\[href="(.*)"\]$/)?.[1]
        return links.find((link) => link.href === href) ?? null
      },
      createElement() {
        const listeners = new Map<string, () => void>()
        return {
          rel: '',
          href: '',
          sheet: null,
          listeners,
          addEventListener(type: string, listener: () => void) {
            listeners.set(type, listener)
          },
          removeEventListener(type: string, listener: () => void) {
            if (listeners.get(type) === listener) listeners.delete(type)
          },
        }
      },
      head: {
        appendChild(link: (typeof links)[number]) {
          links.push(link)
          if (link.rel === 'stylesheet') {
            queueMicrotask(() => {
              link.sheet = {}
              link.listeners.get('load')?.()
            })
          }
          return link
        },
      },
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        exposes: {
          './federatedBoot': { file: 'assets/boot.js', css: ['assets/global.css'] },
          './Other': { file: 'assets/other.js', css: ['assets/other.css'] },
        },
      }),
    }))
    vi.stubGlobal('document', document)
    vi.stubGlobal('fetch', fetchMock)

    const { registerRemote, loadRemote } = await import('../src/runtime/index')
    registerRemote({
      name: 'styled',
      entry: '/lowcode/fulgurjs-remoteEntry.js',
      manifestUrl: '/lowcode/fulgurjs-manifest.json',
      promise: async () => ({
        name: 'styled',
        init: async () => {},
        get: async (module: string) => {
          expect(module).toBe('./federatedBoot')
          return { default: 'loaded' }
        },
      }),
    })

    const namespace = await loadRemote('styled/federatedBoot')

    expect(namespace.default).toBe('loaded')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(links.map((link) => link.href)).toContain('https://host.example.test/lowcode/assets/global.css')
    expect(
      links.find((link) => link.href === 'https://host.example.test/lowcode/assets/global.css')?.sheet,
    ).toBeTruthy()
    expect(links.map((link) => link.href)).not.toContain('https://host.example.test/lowcode/assets/other.css')
  })
})

describe('runtime: preloadRemote manifest 契约（WP4/WP6 对齐）', () => {
  /** 与 runtime-preload 首个用例同款的最小 DOM/fetch 环境 */
  function setupEnv(manifestJson: () => unknown) {
    vi.resetModules()
    ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined
    const links: Array<{ rel: string; href: string; sheet: object | null }> = []
    const document = {
      baseURI: 'https://host.example.test/main/',
      querySelector() {
        return null
      },
      createElement() {
        return { rel: '', href: '', sheet: null }
      },
      head: {
        appendChild(link: (typeof links)[number]) {
          links.push(link)
          return link
        },
      },
    }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => manifestJson() }))
    vi.stubGlobal('document', document)
    vi.stubGlobal('fetch', fetchMock)
    return { links, fetchMock }
  }

  it('entry 为目录形态（/remote-a，根相对配置）时资产相对 entry 目录解析', async () => {
    const { links } = setupEnv(() => ({
      schemaVersion: 1,
      exposes: { './Boot': { file: 'assets/boot.js', css: ['assets/boot.css'] } },
    }))
    const { registerRemote, preloadRemote } = await import('../src/runtime/index')
    registerRemote({ name: 'dir-entry', entry: '/remote-a', manifestUrl: '/remote-a/fulgurjs-manifest.json' })
    await preloadRemote('dir-entry')
    const hrefs = links.map((l) => l.href)
    expect(hrefs).toContain('https://host.example.test/remote-a/assets/boot.js')
    expect(hrefs).toContain('https://host.example.test/remote-a/assets/boot.css')
    // 不得解析到站点根（修复前的缺陷形态）
    expect(hrefs).not.toContain('https://host.example.test/assets/boot.js')
  })

  it('manifest schemaVersion=2 拒绝消费：降级为仅预载 entry 并上报 MFU-007', async () => {
    const { links } = setupEnv(() => ({ schemaVersion: 2, exposes: { './Boot': { file: 'assets/boot.js' } } }))
    let reported: any
    const window = {
      dispatchEvent: (e: any) => {
        reported = e.detail
      },
    }
    vi.stubGlobal('window', window)
    const { registerRemote, preloadRemote } = await import('../src/runtime/index')
    registerRemote({ name: 'future', entry: '/remote-a/fulgurjs-remoteEntry.js', manifestUrl: '/remote-a/fulgurjs-manifest.json' })
    await preloadRemote('future')
    const hrefs = links.map((l) => l.href)
    // entry 本体按配置原样注入（根相对地址在页面同源下可直接请求）
    expect(hrefs).toContain('/remote-a/fulgurjs-remoteEntry.js')
    expect(hrefs).not.toContain('https://host.example.test/remote-a/assets/boot.js')
    expect(reported.error.code).toBe('MFU-007')
    expect(String(reported.error.message)).toContain('协议版本为 2')
  })

  it('manifest fetch 超时不再永久挂起（AbortSignal.timeout 语义）', async () => {
    vi.resetModules()
    ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined
    const links: Array<{ rel: string; href: string; sheet: object | null }> = []
    vi.stubGlobal('document', {
      baseURI: 'https://host.example.test/',
      querySelector: () => null,
      createElement: () => ({ rel: '', href: '', sheet: null }),
      head: { appendChild: (l: (typeof links)[number]) => (links.push(l), l) },
    })
    const fetchMock = vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
      expect(init?.signal).toBeTruthy()
      return { ok: false }
    })
    vi.stubGlobal('fetch', fetchMock)
    const { registerRemote, preloadRemote } = await import('../src/runtime/index')
    registerRemote({ name: 'hung', entry: '/x/fulgurjs-remoteEntry.js', manifestUrl: '/x/fulgurjs-manifest.json' })
    await preloadRemote('hung')
    expect(links.map((l) => l.href)).toContain('/x/fulgurjs-remoteEntry.js')
  })
})
