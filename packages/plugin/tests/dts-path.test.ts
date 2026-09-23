/**
 * WP5：dts 路径边界负向测试。
 *
 * 防线：dev manifest 的 fsRoot/exposes[].src 属远程可控输入——越界路径（../、绝对路径、
 * symlink 逃逸）必须被拒绝且目标内容不被读取（canary 不得出现在产物）、输出目录无半截文件。
 */
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateDevTypes } from '../src/dts'
import type { NormalizedOptions } from '../src/options'

function fakeOptions(root: string): NormalizedOptions {
  return {
    name: 'host',
    uniqueName: 'host',
    filename: 'fulgurjs-remoteEntry.js',
    exposes: [],
    remotes: [
      { key: 'evil', name: 'evil', shareScope: 'default', devEntry: 'http://localhost:1/@fulgurjs-entry.js', prodEntry: '' },
    ],
    shared: [],
    shareScope: 'default',
    remoteType: 'module',
    manifest: true,
    runtimePlugins: [],
    dts: { dir: 'types' },
    root,
    pluginVersion: 'test',
    pkgDependencies: {},
    warnings: [],
    devSharedSelf: false,
    devCorsOrigins: undefined,
    devFsRoot: true,
  }
}

function fakeServerWithManifest(manifest: unknown) {
  return {
    httpServer: {
      once: (_ev: string, cb: () => void) => cb(),
    },
    // fetchManifest 走 global fetch——本测试直接 stub
  } as never
}

async function runWithManifest(root: string, manifest: unknown) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => manifest }))
  const origFetch = globalThis.fetch
  globalThis.fetch = fetchMock as never
  try {
    await generateDevTypes(fakeOptions(root), fakeServerWithManifest(manifest))
  } finally {
    globalThis.fetch = origFetch
  }
  const outDir = path.join(root, 'types')
  const files = fs.existsSync(outDir) ? fs.readdirSync(outDir) : []
  const content = files.map((f) => fs.readFileSync(path.join(outDir, f), 'utf8')).join('\n')
  return { files, content }
}

describe('WP5: dts 路径边界', () => {
  it('正常相对路径：类型文件生成', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp5-ok-'))
    try {
      fs.mkdirSync(path.join(root, 'remote-src'), { recursive: true })
      fs.writeFileSync(path.join(root, 'remote-src/comp.ts'), 'export const ok = 1\n')
      const { files, content } = await runWithManifest(root, {
        schemaVersion: 1,
        name: 'evil',
        devServer: true,
        base: '/',
        entry: '/@fulgurjs-entry.js',
        fsRoot: root,
        exposes: [{ name: './Ok', src: './remote-src/comp.ts', file: '/remote-src/comp.ts' }],
        shared: [],
      })
      expect(files).toContain('evil.d.ts')
      expect(content).toContain('declare module "evil/Ok"')
      expect(content).toContain('export { ok }')
      expect(content).not.toContain('PWNED')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('../ 越界 src 被拒且目标内容不被读取（canary 不出现）', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp5-esc-'))
    try {
      fs.writeFileSync(path.join(root, 'canary.ts'), 'export const PWNED = 1\n')
      const warns: string[] = []
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => warns.push(String(a[0])))
      try {
        const { content } = await runWithManifest(root, {
          schemaVersion: 1,
          name: 'evil',
          devServer: true,
          base: '/',
          entry: '/@fulgurjs-entry.js',
          fsRoot: root,
          exposes: [{ name: './Esc', src: '../canary.ts', file: '/x' }],
          shared: [],
        })
        expect(content).not.toContain('PWNED')
        expect(warns.some((w) => w.includes('..'))).toBe(true)
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('绝对路径 src 被拒', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp5-abs-'))
    try {
      const canary = path.join(root, 'abs.ts')
      fs.writeFileSync(canary, 'export const PWNED_ABS = 1\n')
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const { content } = await runWithManifest(root, {
          schemaVersion: 1,
          name: 'evil',
          devServer: true,
          base: '/',
          entry: '/@fulgurjs-entry.js',
          fsRoot: root,
          exposes: [{ name: './Abs', src: canary, file: '/x' }],
          shared: [],
        })
        expect(content).not.toContain('PWNED_ABS')
        expect(content).not.toContain('declare module "evil/Abs"')
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('symlink 指向 root 外被拒（realpath 包含判定）', async () => {
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'wp5-outer-'))
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp5-sym-'))
    try {
      fs.writeFileSync(path.join(outer, 'outside.ts'), 'export const PWNED_SYM = 1\n')
      fs.mkdirSync(path.join(root, 'in'), { recursive: true })
      fs.symlinkSync(path.join(outer, 'outside.ts'), path.join(root, 'in/link.ts'))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const { content } = await runWithManifest(root, {
          schemaVersion: 1,
          name: 'evil',
          devServer: true,
          base: '/',
          entry: '/@fulgurjs-entry.js',
          fsRoot: root,
          exposes: [{ name: './Link', src: './in/link.ts', file: '/x' }],
          shared: [],
        })
        expect(content).not.toContain('PWNED_SYM')
        expect(content).not.toContain('declare module "evil/Link"')
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      fs.rmSync(outer, { recursive: true, force: true })
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('全部 expose 被拒时不落半截声明文件', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp5-none-'))
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const { files } = await runWithManifest(root, {
          schemaVersion: 1,
          name: 'evil',
          devServer: true,
          base: '/',
          entry: '/@fulgurjs-entry.js',
          fsRoot: root,
          exposes: [
            { name: './A', src: '../a.ts', file: '/x' },
            { name: './B', src: '/abs.ts', file: '/x' },
          ],
          shared: [],
        })
        expect(files).not.toContain('evil.d.ts')
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('manifest 缺 fsRoot（devFsRoot:false）给出明确降级提示', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp5-nofs-'))
    try {
      const warns: string[] = []
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => warns.push(String(a[0])))
      try {
        const { files } = await runWithManifest(root, {
          schemaVersion: 1,
          name: 'evil',
          devServer: true,
          base: '/',
          entry: '/@fulgurjs-entry.js',
          exposes: [{ name: './X', src: './x.ts', file: '/x' }],
          shared: [],
        })
        expect(files).not.toContain('evil.d.ts')
        expect(warns.some((w) => w.includes('fsRoot') && w.includes('any'))).toBe(true)
      } finally {
        warnSpy.mockRestore()
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
