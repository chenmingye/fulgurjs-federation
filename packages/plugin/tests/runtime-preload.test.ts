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
