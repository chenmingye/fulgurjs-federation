/**
 * WP1：真实插件链回归（unplugin-auto-import × federation × vue）。
 *
 * 缺陷史（D6-4，2026-09-23）：unplugin-auto-import 在本插件 pre.transform 之后向模块注入
 * `import { ref } from 'vue'`——pre 看到的文件还没有这行导入，注入因此绕过门面化、静态绑定
 * 本地 vue 副本，与协商实例形成双响应性系统（实测：同一 hook 内 A ref 赋值不触发渲染）。
 *
 * 本用例用 Vite 的 build() 真实执行三个插件的钩子（不直接调 transformModule 冒充集成），
 * 在 Rollup（fixtures vite 6.4.3）与 Rolldown（packages/plugin vite 8.3.0）两个引擎下断言：
 *   1. 注入确实发生在 pre 之后（pre 阶段看到的源码没有 vue 导入，产物却使用注入的 API）；
 *   2. 注入的 vue 导入经 shared 门面协商（页面 chunk 与 vue 本体 chunk 之间无直接静态边）；
 *   3. 同文件 runtime 静态导入 + 远程动态导入并存时远程导入仍被改写（c8c0ac1 回归类）；
 *   4. transformModule 幂等（重复经过 transform 不重复 prepend helper、不二次包装）。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { federation } from '../src/index'
import { transformModule } from '../src/transform'
import type { Plugin } from 'vite'

const HOST_VUE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/host-vue')

/** 依赖来源全部指向 fixtures/host-vue 的 node_modules（vue / plugin-vue / unplugin-auto-import） */
async function loadFixtureDeps() {
  const nm = (p: string) => pathToFileURL(path.join(HOST_VUE_ROOT, 'node_modules', p)).href
  const vuePluginMod = await import(nm('@vitejs/plugin-vue/dist/index.mjs'))
  const autoImportMod = await import(nm('unplugin-auto-import/dist/vite.js'))
  return {
    vuePlugin: vuePluginMod.default as () => Plugin,
    autoImport: autoImportMod.default as (opts: Record<string, unknown>) => Plugin,
  }
}

/** 按引擎取 vite：rollup = fixtures 6.4.3；rolldown = packages/plugin 8.3.0 */
async function loadVite(engine: 'rollup' | 'rolldown'): Promise<typeof import('vite')> {
  const target =
    engine === 'rollup'
      ? path.join(HOST_VUE_ROOT, 'node_modules/vite/dist/node/index.js')
      : path.join(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/vite/dist/node/index.js')
  return import(pathToFileURL(target).href) as Promise<typeof import('vite')>
}

interface BuildProbe {
  /** pre 阶段捕获的 SFC 原文（证明注入前源码没有 vue 导入） */
  preSeenPageCode: string | null
}

async function buildAutoImportApp(
  engine: 'rollup' | 'rolldown',
  order: 'auto-before-federation' | 'auto-after-federation',
): Promise<{ output: import('vite').RollupOutput; probe: BuildProbe }> {
  const vite = await loadVite(engine)
  const { vuePlugin, autoImport } = await loadFixtureDeps()
  const root = fs.mkdtempSync(path.join(HOST_VUE_ROOT, '.wp1-build-'))
  const probe: BuildProbe = { preSeenPageCode: null }
  try {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'wp1-app', private: true, type: 'module', dependencies: { vue: '^3.5.22' } }),
    )
    fs.writeFileSync(
      path.join(root, 'index.html'),
      '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
    )
    fs.mkdirSync(path.join(root, 'src/exposes'), { recursive: true })
    // 纯远程的 expose 页：ref/computed/isRef 全靠 auto-import 注入（源码零 vue 导入）
    fs.writeFileSync(
      path.join(root, 'src/exposes/Counter.vue'),
      [
        '<template><section><p>{{ refKind }}:{{ count }}:{{ double }}</p><button @click="count++">inc</button><button @click="loadOther">dyn</button><button @click="viaApi">api</button></section></template>',
        '<script setup lang="ts">',
        'const count = ref(0)',
        'const double = computed(() => count.value * 2)',
        'const refKind = isRef(count) ? "ref-ok" : "ref-bad"',
        // 同文件混用：runtime 显式导入 + 远程动态导入（c8c0ac1 回归类）
        'import { loadRemote } from "virtual:fulgurjs-runtime"',
        'async function loadOther() { return await import("wp1-other/Widget") }',
        'async function viaApi() { return await loadRemote("wp1-other/Widget") }',
        '</script>',
        '',
      ].join('\n'),
    )
    fs.writeFileSync(
      path.join(root, 'src/main.ts'),
      ['import Counter from "./exposes/Counter.vue"', 'console.log(Counter)', ''].join('\n'),
    )

    const fedPlugins = federation({
      name: 'wp1-app',
      filename: 'fulgurjs-remoteEntry.js',
      exposes: { './Counter': './src/exposes/Counter.vue' },
      remotes: { 'wp1-other': { dev: 'http://localhost:5999', prod: '/wp1-other' } },
      shared: { vue: { singleton: true, requiredVersion: '^3.4.0' } },
      // 本测试守护 WP1 静态形态（auto-import 注入 → 协商门面 + 页面 chunk 零 vue 本体静态边）。
      // 4.1.0 起双角色默认 devSharedSelf: true（门面动态化，产物形态不同，由
      // build-facade-chunk/build-chunk-graph 套件守护）——此处显式关回静态形态
      devSharedSelf: false,
    })
    const autoPlugin = autoImport({ imports: ['vue'], dts: false })
    const plugins: Plugin[] =
      order === 'auto-before-federation'
        ? [vuePlugin(), autoPlugin, ...fedPlugins]
        : [vuePlugin(), ...fedPlugins, autoPlugin]
    const output = (await vite.build({
      root,
      configFile: false,
      logLevel: 'warn',
      plugins: [
        // 探针：pre 阶段抢在一切转换前记录 SFC 原文
        {
          name: 'wp1-pre-probe',
          enforce: 'pre',
          transform(code, id) {
            if (id.endsWith('Counter.vue') && !id.includes('?')) probe.preSeenPageCode = code
            return null
          },
        },
        ...plugins,
      ],
      build: { outDir: path.join(root, 'dist'), emptyOutDir: true, target: 'es2022', minify: false },
    })) as import('vite').RollupOutput
    return { output, probe }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

describe.each(['rollup', 'rolldown'] as const)('WP1: 真实插件链 build（engine=%s）', (engine) => {
  it.each(['auto-before-federation', 'auto-after-federation'] as const)(
    'auto-import 注入被门面化协商：%s',
    { timeout: 120_000 },
    async (order) => {
      const { output, probe } = await buildAutoImportApp(engine, order)

      // 0. 注入确实发生且晚于 pre：pre 看到的 SFC 原文没有 vue 导入
      expect(probe.preSeenPageCode).toBeTruthy()
      expect(probe.preSeenPageCode).not.toMatch(/from\s+["']vue["']/)

      const chunks = output.output.filter((c): c is import('vite').RollupOutput['output'][number] & { type: 'chunk' } => c.type === 'chunk')
      // 1. 注入的 API 在产物中被真实使用（ref-ok 字符串来自 isRef 判定）。
      //    页面 chunk 按「包含注入 API 使用」识别（引擎无关：rollup 内联门面进脚本 chunk，
      //    rolldown 拆独立脚本 chunk，facadeModuleId 两种引擎形态不同）。
      const pageChunk = chunks.find((c) => c.code.includes('ref-ok'))
      expect(pageChunk, '包含注入 API 使用的页面 chunk 必须存在').toBeTruthy()

      // 2. 注入的 vue 导入经协商门面：页面 chunk 内存在对 vue 的 loadShare 协商调用
      //    （门面可能被内联进页面 chunk——rollup 常见；协商参数对象不被压缩，
      //    "vue", { shareKey: ... } 形态在两个引擎下一致）
      expect(pageChunk!.code).toMatch(/"vue",\s*\{[^}]*shareKey:/)

      // 3. 页面 chunk 不得直接静态依赖 vue 本体 chunk。本体 chunk 集合 = 命名空间门面
      //    chunk（facadeModuleId = virtual:fulgurjs-shared:vue）的静态依赖——引擎无关，
      //    且正是 loadShare fallback 最终落到的那份本地副本。
      const nsFacade = chunks.find((c) => c.facadeModuleId === 'virtual:fulgurjs-shared:vue')
      expect(nsFacade, 'vue 命名空间门面 chunk 必须存在').toBeTruthy()
      const vueCoreNames = new Set(nsFacade!.imports)
      expect(vueCoreNames.size).toBeGreaterThanOrEqual(1)
      const directVueEdges = pageChunk!.imports.filter((f) => vueCoreNames.has(f))
      expect(directVueEdges, `页面 chunk 不得直接静态依赖 vue 本体（实际依赖：${directVueEdges.join(',')}）`).toEqual([])

      // 4. 同文件 runtime 导入 + 远程动态导入并存：远程导入仍被改写（c8c0ac1）
      expect(pageChunk!.code).not.toMatch(/import\(\s*["']wp1-other\//)
      expect(pageChunk!.code).toMatch(/\(\s*["']wp1-other\/\.\/Widget["']/)
      // runtime 显式导入保留（loadRemote API 调用在产物中可用）
      expect(pageChunk!.code).toMatch(/["']wp1-other\/Widget["']/)
    },
  )
})

describe('WP1: transformModule 幂等（auto-import 兜底重复跑安全）', () => {
  it('同一文件重复 transform：helper 只 prepend 一次、导入不二次包装', async () => {
    const root = fs.mkdtempSync(path.join(HOST_VUE_ROOT, '.wp1-idem-'))
    try {
      const options = {
        name: 'wp1-idem',
        exposes: [],
        remotes: [{ key: 'r', name: 'r', shareScope: 'default', devEntry: '', prodEntry: '' }],
        shared: [
          {
            configKey: 'vue',
            shareKey: 'vue',
            import: 'vue',
            requiredVersion: '^3.4.0' as const,
            singleton: true,
            strictVersion: false,
            shareScope: 'default',
            eager: false,
            version: '3.5.22',
            aliases: ['vue'],
          },
        ],
        shareScope: 'default',
        remoteType: 'module' as const,
        manifest: true,
        runtimePlugins: [],
        dts: false,
        root,
        pluginVersion: 'test',
        pkgDependencies: {},
        warnings: [],
        devSharedSelf: true,
      }
      // 模拟 auto-import 已注入后的文件内容（pre 阶段没见过的形态）
      const injected = [
        "import { ref } from 'vue'",
        "import { loadRemote } from 'virtual:fulgurjs-runtime'",
        'export const x = ref(0)',
        'export const load = () => import("r/Widget")',
        '',
      ].join('\n')
      const ctx = { options, rewriteShared: true, allowNodeModules: true }
      const once = await transformModule(injected, '/src/a.ts', ctx)
      expect(once).toBeTruthy()
      const twice = await transformModule(once!.code, '/src/a.ts', ctx)
      // 幂等：第二次要么无改动（null），要么与第一次产物一致（helper 数不变）
      if (twice) {
        expect(twice.code).toBe(once!.code)
      }
      const helperCount = (once!.code.match(/loadShare as __fulgurjs_loadShare/g) ?? []).length
      expect(helperCount).toBe(1)
      // 注入的 vue 导入已被改写为门面（不再有裸 'vue' specifier 的 ref 导入）
      expect(once!.code).not.toMatch(/import\s*\{[^}]*ref[^}]*\}\s*from\s*["']vue["']/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
