/**
 * WP8：受控诊断（DEBUG=fulgurjs:*）。
 * 默认零输出；开启后有阶段线索（结构化 JSON 到 stderr）且敏感值脱敏
 * （本机绝对路径不出现在输出中、不含源码文本）。
 */
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { debugEnabled, debugLog, redactModulePath } from '../src/diagnostics'

describe('WP8: debugEnabled / debugLog', () => {
  it('默认（无环境变量）全部分类关闭、零输出', () => {
    const prevFulgurjs = process.env.FULGURJS_DEBUG
    const prevDebug = process.env.DEBUG
    delete process.env.FULGURJS_DEBUG
    delete process.env.DEBUG
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(debugEnabled('transform')).toBe(false)
      expect(debugEnabled('facade')).toBe(false)
      debugLog('transform', { module: 'x.ts' })
      debugLog('facade', { stage: 'config' })
      expect(errSpy).not.toHaveBeenCalled()
    } finally {
      errSpy.mockRestore()
      if (prevFulgurjs !== undefined) process.env.FULGURJS_DEBUG = prevFulgurjs
      if (prevDebug !== undefined) process.env.DEBUG = prevDebug
    }
  })

  it('FULGURJS_DEBUG=fulgurjs / fulgurjs:* 全开；fulgurjs:transform 只开对应分类', () => {
    const prev = process.env.FULGURJS_DEBUG
    try {
      process.env.FULGURJS_DEBUG = 'fulgurjs'
      expect(debugEnabled('transform')).toBe(true)
      expect(debugEnabled('facade')).toBe(true)
      process.env.FULGURJS_DEBUG = 'fulgurjs:*'
      expect(debugEnabled('manifest')).toBe(true)
      process.env.FULGURJS_DEBUG = 'fulgurjs:transform'
      expect(debugEnabled('transform')).toBe(true)
      expect(debugEnabled('facade')).toBe(false)
      // DEBUG= 也支持（与常见 debug 库习惯一致）；FULGURJS_DEBUG 优先
      delete process.env.FULGURJS_DEBUG
      process.env.DEBUG = 'vite:*,fulgurjs:facade'
      expect(debugEnabled('facade')).toBe(true)
      expect(debugEnabled('transform')).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.FULGURJS_DEBUG
      else process.env.FULGURJS_DEBUG = prev
      delete process.env.DEBUG
    }
  })

  it('开启时输出结构化行到 stderr（JSON 载荷）', () => {
    const prev = process.env.FULGURJS_DEBUG
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      process.env.FULGURJS_DEBUG = 'fulgurjs:*'
      debugLog('transform', { stage: 'pre', module: 'src/a.ts' })
      expect(errSpy).toHaveBeenCalledTimes(1)
      const line = String(errSpy.mock.calls[0]![0])
      expect(line).toContain('[fulgurjs:debug:transform]')
      expect(JSON.parse(line.replace(/^\[fulgurjs:debug:\w+\]\s*/, ''))).toMatchObject({ stage: 'pre', module: 'src/a.ts' })
    } finally {
      errSpy.mockRestore()
      if (prev === undefined) delete process.env.FULGURJS_DEBUG
      else process.env.FULGURJS_DEBUG = prev
    }
  })
})

describe('WP8: redactModulePath 脱敏', () => {
  it('root 内显示相对路径；root 外只留 basename（绝对路径布局不外泄）', () => {
    expect(redactModulePath('/work/app/src/a.ts', '/work/app')).toBe(path.join('src', 'a.ts'))
    expect(redactModulePath('/elsewhere/node_modules/vue/index.mjs', '/work/app')).toBe('index.mjs')
    expect(redactModulePath('/work/app/src/a.vue?vue&type=script', '/work/app')).toBe(path.join('src', 'a.vue'))
    // 输出不含任何绝对路径形态
    expect(redactModulePath('/Users/secret-name/project/src/x.ts', '/work/app')).not.toContain('/Users/secret-name')
  })
})

describe('WP8: 真实构建的诊断输出（默认关 / 开启后含阶段线索且脱敏）', () => {
  const HOST_VUE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/host-vue')

  async function buildTinyApp() {
    const vite = (await import(
      // 插件自带 vite（ Rolldown ）——纯 TS 工程无需 vue 插件
      await (async () => {
        const { pathToFileURL } = await import('node:url')
        return pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/vite/dist/node/index.js')).href
      })()
    )) as typeof import('vite')
    const { federation } = await import('../src/index')
    const root = fs.mkdtempSync(path.join(HOST_VUE_ROOT, '.wp8-build-'))
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'wp8', private: true, type: 'module', dependencies: { vue: '^3.5.22' } }))
      fs.writeFileSync(path.join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>')
      fs.mkdirSync(path.join(root, 'src'), { recursive: true })
      fs.writeFileSync(path.join(root, 'src/main.ts'), "import { ref } from 'vue'\nexport const x = ref(0)\nconst SECRET_SOURCE_TOKEN = 'src-text-should-not-leak'\nvoid SECRET_SOURCE_TOKEN\n")
      await vite.build({
        root,
        configFile: false,
        logLevel: 'warn',
        plugins: [
          ...federation({
            name: 'wp8-app',
            exposes: { './X': './src/main.ts' },
            remotes: { 'wp8-r': { dev: 'http://localhost:5199', prod: '/wp8-r' } },
            shared: { vue: { singleton: true } },
          }),
        ],
        build: { outDir: path.join(root, 'dist'), emptyOutDir: true, target: 'es2022', minify: false },
      })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }

  it('默认关闭：真实 build 全程零 debug 输出', { timeout: 120_000 }, async () => {
    delete process.env.FULGURJS_DEBUG
    delete process.env.DEBUG
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await buildTinyApp()
      const debugLines = errSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('[fulgurjs:debug:'))
      expect(debugLines).toEqual([])
    } finally {
      errSpy.mockRestore()
    }
  })

  it('开启：输出含 transform/manifest 阶段线索，模块为相对路径，无源码文本', { timeout: 120_000 }, async () => {
    process.env.FULGURJS_DEBUG = 'fulgurjs:*'
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await buildTinyApp()
      const lines = errSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('[fulgurjs:debug:'))
      expect(lines.some((l) => l.includes('debug:transform'))).toBe(true)
      expect(lines.some((l) => l.includes('debug:manifest'))).toBe(true)
      const joined = lines.join('\n')
      expect(joined).not.toContain('src-text-should-not-leak')
      expect(joined).not.toMatch(/\/Users\/|\/private\/|\/home\//)
    } finally {
      errSpy.mockRestore()
      delete process.env.FULGURJS_DEBUG
    }
  })
})
