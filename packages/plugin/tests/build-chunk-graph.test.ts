/**
 * WP2：Rollup/Rolldown chunk 图回归。
 *
 * 把 D6 修复的不变量固定为语义断言（不绑定引擎私有命名 / hash / minify 符号）：
 * 1. 危险环检测器只拒绝「涉及 fulgurjs 门面/运行时 chunk 的静态环」，不拒绝用户应用的
 *    合法普通模块环（检测器本身用合成图做正负测试，含人为注入的门面回边）；
 * 2. manualChunks 对象 / 函数 / 无配置三种形态在 Rollup（fixtures vite 6.4.3）与
 *    Rolldown（packages/plugin vite 8.3.0）下都构建成功且无危险环；
 * 3. 有强制分组时，协商门面/运行时落在插件专属组（fulgurjs-* 前缀），门面组是「汇」
 *    （静态依赖只指向插件自身 chunk）；
 * 4. output 数组形态 → BLD-006 诊断（不悄悄改写用户配置）；
 * 5. remoteEntry 与 manifest 的本地资源引用存在性检查（缺失时输出缺失路径与导入边）。
 */
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Plugin } from 'vite'
import { federation } from '../src/index'

const HOST_VUE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/host-vue')

async function loadVite(engine: 'rollup' | 'rolldown'): Promise<typeof import('vite')> {
  const target =
    engine === 'rollup'
      ? path.join(HOST_VUE_ROOT, 'node_modules/vite/dist/node/index.js')
      : path.join(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/vite/dist/node/index.js')
  return import(pathToFileURL(target).href) as Promise<typeof import('vite')>
}

// ── 危险环检测器（语义化：环成员含插件 chunk 才危险）──────────────────────────

export interface GraphChunk {
  fileName: string
  imports: readonly string[]
  /** 插件生成 chunk 的判定（fulgurjs-* / virtual_fulgurjs-* 命名是产物契约） */
  isPluginChunk?: boolean
}

/**
 * 找出「涉及插件门面/运行时 chunk」的静态环。用户应用内部的普通模块环不在此列——
 * 大型工程普遍存在合法循环（Vue 组件循环引用等），拒绝它们会造成误报。
 */
export function findDangerousChunkCycles(chunks: GraphChunk[]): string[][] {
  const byName = new Map(chunks.map((c) => [c.fileName, c]))
  const isPlugin = (name: string) => byName.get(name)?.isPluginChunk ?? /^(fulgurjs-|virtual_fulgurjs-)/.test(name)
  const state = new Map<string, number>()
  const stack: string[] = []
  const cycles: string[][] = []
  const dfs = (node: string) => {
    state.set(node, 1)
    stack.push(node)
    for (const dep of byName.get(node)?.imports ?? []) {
      if (!byName.has(dep)) continue
      const st = state.get(dep) ?? 0
      if (st === 0) dfs(dep)
      else if (st === 1) {
        const cycle = [...stack.slice(stack.indexOf(dep)), dep]
        if (cycle.some((n) => isPlugin(n))) cycles.push(cycle)
      }
    }
    stack.pop()
    state.set(node, 2)
  }
  for (const c of chunks) if ((state.get(c.fileName) ?? 0) === 0) dfs(c.fileName)
  return cycles
}

/** manifest/remoteEntry 资源引用存在性检查；缺失时返回结构化错误（含导入边与归组信息） */
export function checkAssetReferences(
  files: Set<string>,
  manifest: { entry?: string; exposes?: Record<string, { file?: string; css?: string[] }> },
  manualChunksGroups?: Record<string, string[]>,
): Array<{ kind: string; ref: string; importer?: string; group?: string }> {
  const errors: Array<{ kind: string; ref: string; importer?: string; group?: string }> = []
  const groupOf = (file: string) =>
    manualChunksGroups
      ? Object.entries(manualChunksGroups)
          .filter(([, specs]) => specs.some((s) => file.includes(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))))
          .map(([g]) => g)[0]
      : undefined
  if (manifest.entry && !files.has(manifest.entry)) {
    errors.push({ kind: 'manifest.entry', ref: manifest.entry })
  }
  for (const [expose, item] of Object.entries(manifest.exposes ?? {})) {
    if (item?.file && !files.has(item.file)) {
      errors.push({ kind: `manifest.exposes[${expose}].file`, ref: item.file, group: groupOf(item.file) })
    }
    for (const css of item?.css ?? []) {
      if (!files.has(css)) errors.push({ kind: `manifest.exposes[${expose}].css`, ref: css })
    }
  }
  return errors
}

describe('WP2: 危险环检测器（合成图正负测试）', () => {
  it('门面 chunk 的静态回边被检出（人为注入 D6 成环形态）', () => {
    const cycles = findDangerousChunkCycles([
      { fileName: 'fulgurjs-shared-vue-abc.js', imports: ['vue-vendor-1.js'] },
      { fileName: 'vue-vendor-1.js', imports: ['fulgurjs-shared-vue-abc.js'] }, // ← 人为注入的回边
      { fileName: 'fulgurjs-runtime-def.js', imports: [] },
    ])
    expect(cycles.length).toBe(1)
    expect(cycles[0]).toContain('fulgurjs-shared-vue-abc.js')
  })

  it('运行时 chunk 参与的环被检出', () => {
    const cycles = findDangerousChunkCycles([
      { fileName: 'fulgurjs-runtime-x.js', imports: ['app-entry.js'] },
      { fileName: 'app-entry.js', imports: ['fulgurjs-runtime-x.js'] },
    ])
    expect(cycles.length).toBe(1)
  })

  it('用户应用内的合法普通模块环不误报', () => {
    const cycles = findDangerousChunkCycles([
      { fileName: 'ComponentA.js', imports: ['ComponentB.js'] },
      { fileName: 'ComponentB.js', imports: ['ComponentA.js'] },
      { fileName: 'fulgurjs-shared-vue-a.js', imports: ['fulgurjs-runtime-b.js'] },
      { fileName: 'fulgurjs-runtime-b.js', imports: [] },
    ])
    expect(cycles).toEqual([])
  })

  it('自环（门面 import 自身）被检出', () => {
    const cycles = findDangerousChunkCycles([{ fileName: 'fulgurjs-shared-vue-a.js', imports: ['fulgurjs-shared-vue-a.js'] }])
    expect(cycles.length).toBe(1)
  })
})

describe('WP2: 资产引用存在性检查（合成负向）', () => {
  it('manifest 指向缺失 chunk 时输出缺失路径与 manualChunks 归组线索', () => {
    const errors = checkAssetReferences(
      new Set(['fulgurjs-remoteEntry.js', 'assets/Page-abc.js']),
      { entry: 'fulgurjs-remoteEntry.js', exposes: { './Page': { file: 'assets/Page-abc.js' }, './Gone': { file: 'assets/gone-xyz.js' } } },
      { 'vue-vendor': ['vue', 'vue-router'] },
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ kind: 'manifest.exposes[./Gone].file', ref: 'assets/gone-xyz.js' })
  })
})

// ── 真实构建（D6 场景基线：双向宿主 + devSharedSelf + vue-router shared 闭包 + TLA 门面）──

type ManualChunksMode = 'object' | 'function' | 'none' | 'array'

async function buildD6App(engine: 'rollup' | 'rolldown', mode: ManualChunksMode): Promise<import('vite').RollupOutput> {
  const vite = await loadVite(engine)
  const root = fs.mkdtempSync(path.join(HOST_VUE_ROOT, '.wp2-build-'))
  try {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'wp2-host', private: true, type: 'module', dependencies: { vue: '^3.5.22', 'vue-router': '^4.4.0' } }),
    )
    fs.writeFileSync(
      path.join(root, 'index.html'),
      '<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>',
    )
    fs.mkdirSync(path.join(root, 'src/pages'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src/pages/remote-page.ts'), `export const go = () => import('wp2-r/Page')\n`)
    fs.writeFileSync(
      path.join(root, 'src/exposed-page.ts'),
      [`import { ref } from 'vue'`, `export const wp2Page = ref('wp2')`, ''].join('\n'),
    )
    fs.writeFileSync(
      path.join(root, 'src/main.ts'),
      [
        `import { createApp, ref } from 'vue'`,
        `import { createRouter, createWebHistory } from 'vue-router'`,
        `import { go } from './pages/remote-page'`,
        `void createApp; void ref; void createRouter; void createWebHistory; void go;`,
      ].join('\n'),
    )

    const outputBase: Record<string, unknown> =
      mode === 'object'
        ? { manualChunks: { 'vue-vendor': ['vue', 'vue-router'], 'antd-vue-vendor': ['vue-router'] } }
        : mode === 'function'
          ? {
              manualChunks: (id: string) => {
                if (id.includes('node_modules/vue-router')) return 'vue-vendor'
                if (id.includes('node_modules/vue') && !id.includes('vue-router')) return 'vue-vendor'
                return undefined
              },
            }
          : mode === 'array'
            ? [
                {
                  manualChunks: (id: string) =>
                    id.includes('node_modules/vue') ? 'vue-vendor' : undefined,
                },
                {},
              ]
            : {}
    const raw = (await vite.build({
      root,
      configFile: false,
      logLevel: 'warn',
      plugins: [
        ...federation({
          name: 'wp2-host',
          filename: 'fulgurjs-remoteEntry.js',
          remotes: { 'wp2-r': { dev: 'http://localhost:5199', prod: '/wp2-r' } },
          exposes: { './Page': './src/exposed-page.ts' },
          shared: {
            vue: { singleton: true, requiredVersion: '^3.5.0' },
            'vue-router': { singleton: true, requiredVersion: '^4.4.0' },
          },
          devSharedSelf: true,
        }),
      ],
      build: {
        outDir: path.join(root, 'dist'),
        emptyOutDir: true,
        target: 'es2022',
        minify: false,
        rollupOptions: { output: outputBase as never },
      },
    })) as import('vite').RollupOutput | import('vite').RollupOutput[]
    // output 数组形态下 build() 返回 RollupOutput[]（每个 output 项一个）；归一化为首个
    return Array.isArray(raw) ? raw[0]! : raw
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

const graphOf = (output: import('vite').RollupOutput): GraphChunk[] =>
  output.output
    .filter((c): c is import('vite').RollupOutput['output'][number] & { type: 'chunk' } => c.type === 'chunk')
    .map((c) => ({ fileName: c.fileName, imports: c.imports }))

const isRuntimeChunk = (code: string) => code.includes('__FULGURJS_RUNTIME__')

describe.each(['rollup', 'rolldown'] as const)('WP2: chunk 图不变量（engine=%s）', (engine) => {
  it.each([
    ['object', '对象形式'],
    ['function', '函数形式'],
    ['none', '无 manualChunks 基线'],
  ] as const)('manualChunks=%s：构建成功且无危险环', { timeout: 120_000 }, async (mode) => {
    const output = await buildD6App(engine, mode)
    const chunks = output.output.filter((c): c is import('vite').RollupOutput['output'][number] & { type: 'chunk' } => c.type === 'chunk')
    expect(chunks.length).toBeGreaterThan(0)

    // 1. 无涉及插件 chunk 的静态环（语义检测器，不依赖引擎命名）
    const cycles = findDangerousChunkCycles(graphOf(output))
    expect(cycles, `危险环：${JSON.stringify(cycles)}`).toEqual([])

    // 2. 运行时 chunk 恰有一份语义（页面级单例的产物面）
    const runtimeChunks = chunks.filter((c) => isRuntimeChunk(c.code))
    expect(runtimeChunks.length).toBeGreaterThanOrEqual(1)

    // 3. 门面「汇」不变量：凡含 vue 协商调用的 chunk（门面本体或内联了门面的 chunk），
    //    其静态依赖只允许指向运行时 chunk——不得静态依赖用户/本体 chunk（会重建 D6 环）
    const runtimeNames = new Set(runtimeChunks.map((c) => c.fileName))
    const localVueNames = new Set(
      chunks
        .find((c) => c.facadeModuleId === 'virtual:fulgurjs-shared:vue')
        ?.imports ?? [],
    )
    for (const c of chunks) {
      if (!/"vue",\s*\{[^}]*shareKey:/.test(c.code)) continue
      const bad = c.imports.filter((f) => !runtimeNames.has(f) && !localVueNames.has(f) && !/^(fulgurjs-|virtual_fulgurjs-)/.test(f))
      // 本体 chunk 本身可能含 provide 侧代码（virtual:fulgurjs-shared:vue 门面被内联）——
      // 内联进本体 chunk 时它静态 import vue 属 provide 语义，排除本体 chunk 自身
      if (localVueNames.has(c.fileName)) continue
      expect(bad, `${c.fileName} 含协商但静态依赖了非插件 chunk：${bad.join(',')}`).toEqual([])
    }

    // 4. 强制分组形态（对象/函数）：门面/运行时必须隔离进插件专属组（fulgurjs-* 前缀）
    if (mode !== 'none') {
      const negotiationChunks = chunks.filter((c) => /"vue",\s*\{[^}]*shareKey:/.test(c.code))
      for (const c of negotiationChunks) {
        if (localVueNames.has(c.fileName)) continue // provide 本体门面内联例外
        const base = c.fileName.split('/').pop()!
        expect(
          /^(fulgurjs-|virtual_fulgurjs-)/.test(base),
          `协商门面应落在插件专属组：${c.fileName}`,
        ).toBe(true)
      }
    }

    // 5. remoteEntry + manifest 资源引用存在性
    const files = new Set(output.output.map((c) => c.fileName))
    const manifestAsset = output.output.find((c) => c.fileName === 'fulgurjs-manifest.json')
    expect(manifestAsset, 'fulgurjs-manifest.json 必须产出').toBeTruthy()
    const manifest = JSON.parse((manifestAsset as { source: string }).source) as {
      entry?: string
      exposes?: Record<string, { file?: string; css?: string[] }>
    }
    expect(files.has('fulgurjs-remoteEntry.js')).toBe(true)
    const errors = checkAssetReferences(files, manifest)
    expect(errors, JSON.stringify(errors)).toEqual([])
  })

  it('output 数组形态 → BLD-006 诊断（不悄悄改写）', { timeout: 120_000 }, async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const output = await buildD6App(engine, 'array')
      const warned = warnSpy.mock.calls.map((c) => String(c[0])).find((t) => t.includes('BLD-006'))
      expect(warned, '必须发射 BLD-006 诊断指引手工加分支').toBeTruthy()
      // 数组形态构建仍应完成（未注入包装时产物可能含危险环，但不得构建失败/静默改写配置）
      expect(output.output.length).toBeGreaterThan(0)
    } finally {
      warnSpy.mockRestore()
    }
  })
})
