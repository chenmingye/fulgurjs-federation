/**
 * D6（2026-09-22）构建产物形态回归防线。
 *
 * 缺陷：双向宿主（host + exposes，devSharedSelf: true）在用户配置 manualChunks 强制
 * 分组时，node_modules 门面化产物与强制分组互锁成 chunk 循环依赖——实测 mes-zc admin
 * （vue-vendor/antd-vue-vendor 对象分组）出现 vue-vendor ⇄ antd-vue-vendor 静态环，
 * 门面 TLA 求值顺序错位 → TypeError: _e is not a function（协商函数未初始化），页面白屏。
 *
 * 本用例用真实 vite build 覆盖「宿主 + allowNodeModules（devSharedSelf）+ manualChunks
 * 对象形式」这条此前零覆盖的路径，断言三件事：
 *   1. 构建成功且产物 chunk 图无环；
 *   2. 全部协商门面/运行时虚拟模块落在固定 chunk `fulgurjs-shared-facades`；
 *   3. 门面 chunk 对外零静态 import（"汇"形态——环在数学上不可能）。
 */
import { describe, expect, it } from 'vitest'
import { build } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { federation } from '../src/index'

const HOST_VUE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/host-vue')

// 引擎来源：packages/plugin 自带的 devDeps vite（当前为 8.3.0/rolldown 主线）。
// 该用例不依赖 fixtures 的 node_modules，CI unit job 零额外安装即可运行。

/** 产物 chunk 静态依赖图找环（与 e2e/check-chunk-cycles 同逻辑） */
function findChunkCycles(distDir: string): string[][] {
  const jsDir = fs.readdirSync(distDir, { withFileTypes: true })
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.js')) files.push(p)
    }
  }
  for (const e of jsDir) {
    const p = path.join(distDir, e.name)
    if (e.isDirectory()) walk(p)
  }
  const edges = new Map<string, Set<string>>()
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8')
    const deps = new Set<string>()
    for (const m of code.matchAll(/from\s*["']\.\/([^"']+)["']/g)) deps.add(m[1])
    edges.set(path.basename(f), deps)
  }
  const state = new Map<string, number>()
  const stack: string[] = []
  const cycles: string[][] = []
  const dfs = (node: string) => {
    state.set(node, 1)
    stack.push(node)
    for (const dep of edges.get(node) ?? []) {
      if (!edges.has(dep)) continue
      const st = state.get(dep) ?? 0
      if (st === 0) dfs(dep)
      else if (st === 1) cycles.push([...stack.slice(stack.indexOf(dep)), dep])
    }
    stack.pop()
    state.set(node, 2)
  }
  for (const f of edges.keys()) if ((state.get(f) ?? 0) === 0) dfs(f)
  return cycles
}

describe('D6: 宿主 + devSharedSelf + manualChunks 构建产物形态', () => {
  it('门面隔离进固定 chunk，产物无环，门面 chunk 零对外静态依赖', { timeout: 120_000 }, async () => {
    const root = fs.mkdtempSync(path.join(HOST_VUE_ROOT, '.d6-build-'))
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'd6-host',
          private: true,
          type: 'module',
          dependencies: { vue: '^3.5.22', 'vue-router': '^4.4.0' },
        }),
      )
      fs.mkdirSync(path.join(root, 'src'), { recursive: true })
      fs.writeFileSync(
        path.join(root, 'index.html'),
        '<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>',
      )
      // vue-router 是 manualChunks 强制组员，其内部 vue 导入会被门面化——原缺陷的成环推手。
      // 注意 remote 导入必须写在非入口模块：入口文件在 build 下只内联 init 即短路返回
      // （见 pre.transform 的 entry 分支），入口内的 remote 导入本就不参与改写（既有边界）。
      fs.mkdirSync(path.join(root, 'src/pages'), { recursive: true })
      fs.writeFileSync(
        path.join(root, 'src/pages/remote-page.ts'),
        `export const go = () => import('remote-a/Page')\n`,
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
      const outDir = path.join(root, 'dist')

      await build({
        root,
        configFile: false,
        logLevel: 'warn',
        plugins: [
          federation({
            name: 'd6-host',
            remotes: { 'remote-a': { dev: 'http://localhost:5101', prod: '/remote-a' } },
            shared: {
              vue: { singleton: true, requiredVersion: '^3.5.0' },
              'vue-router': { singleton: true, requiredVersion: '^4.4.0' },
            },
            devSharedSelf: true,
          }),
        ],
        build: {
          outDir,
          emptyOutDir: true,
          target: 'es2022',
          minify: false,
          rollupOptions: {
            output: {
              manualChunks: { 'vue-vendor': ['vue', 'vue-router'] },
            },
          },
        },
      })

      const jsDir = path.join(outDir, 'assets')
      const dir = fs.existsSync(jsDir) ? jsDir : outDir
      const chunks = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
      expect(chunks.length).toBeGreaterThan(0)
      const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8')

      // 1. 产物 chunk 图无环
      const cycles = findChunkCycles(dir)
      expect(cycles).toEqual([])

      // 2. 门面/运行时全部落在插件专属组：runtime 单独一组（公共底座），vue 门面按 shareKey 一组
      //    （前缀后必须紧跟 -hash：排除 fulgurjs-shared-vue-router 的独立组）
      const facadeChunks = chunks.filter((f) => f.startsWith('fulgurjs-shared-vue') && !f.startsWith('fulgurjs-shared-vue-router'))
      const runtimeChunks = chunks.filter((f) => f.startsWith('fulgurjs-runtime'))
      expect(facadeChunks.length).toBe(1)
      expect(runtimeChunks.length).toBeGreaterThanOrEqual(1)
      const facadeCode = read(facadeChunks[0]!)
      // 命名空间/绑定门面的协商实体必须存在（loadShare 调用或命名空间复制），
      // 且不能是对本体 chunk 的透传别名（透传会被 rollup/rolldown 内联进本体 chunk，
      // 使 fallback 动态 import 指回本体 → TLA 混合环死锁）
      expect(facadeCode).toMatch(/loadShare|__fulgurjs_ns/)
      expect(facadeCode).toContain('await')
      for (const f of chunks) {
        if (f === facadeChunks[0] || f.startsWith('fulgurjs-runtime')) continue
        // 其他 chunk 内不允许再出现协商门面 TLA 形态（await loadShare( 出现在非门面 chunk
        // 意味着门面模块未被隔离）
        expect(read(f).match(/await\s+\w+\(\s*"vue"/g)?.length ?? 0).toBe(0)
      }

      // 3. 门面 chunk 是"汇"：对外静态 import 只允许指向插件自身生成的 chunk
      //    （runtime/helper 等）；静态依赖任何用户/本体 chunk 都会重建死锁结构。
      //    （引擎无关表述：rollup 与 rolldown 的 chunk 命名/合并策略不同，但
      //    插件生成 chunk 的名字恒以 fulgurjs- / virtual_fulgurjs- 开头。）
      const staticImports = [
        ...facadeCode.matchAll(/from\s*["']\.\/([^"']+)["']/g),
      ].map((m) => m[1]!)
      const nonPlugin = staticImports.filter((f) => !/^(fulgurjs-|virtual_fulgurjs-)/.test(f))
      expect(nonPlugin).toEqual([])

      // 4. 「宿主 + allowNodeModules」路径覆盖证据：MC-FIX-2（2026-10-04）起 shared 本体
      //    闭包（vue/vue-router 包体）优先归入 fulgurjs-provider-* 组，用户 vue-vendor 组
      //    若因此为空则不再产出 chunk。死锁防线锚点相应迁移：**fallback 目标 chunk（所有
      //    fulgurjs-provider-* 与仍存在的用户 vendor 组）不得静态依赖任何门面 chunk**——
      //    若出现该静态边，将形成「门面 TLA → 动态 import 本体 chunk → 静态 import 门面」死锁。
      const bodyChunks = chunks.filter(
        (f) => f.startsWith('fulgurjs-provider-') || (f.startsWith('vue-vendor') && !f.startsWith('fulgurjs-')),
      )
      expect(bodyChunks.length).toBeGreaterThan(0)
      for (const f of bodyChunks) {
        expect(read(f)).not.toMatch(/from ["']\.\/fulgurjs-shared-/)
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  /**
   * MC-FIX（2026-10-04）回归：纯宿主（无 exposes、devSharedSelf 默认 false）+ 对象形式
   * manualChunks 把 vue 与其消费方 vue-router 分进同组——MES admin 实机死锁形态。
   *
   * 旧缺陷（两个叠加）：
   * - MC-FIX-1：buildFallbackTransform 缺 node_modules 闸门 → vue-router 对 vue 的静态
   *   导入被 post 兜底错误门面化（宿主自身依赖本不该改写），2056 个依赖模块受影响；
   * - MC-FIX-2：对象形式 manualChunks 包装漏 providerChunkOf → 真实 vue 落进用户
   *   vue-vendor 组（与被改写的 vue-router 同 chunk），「vue-vendor →静态→ TLA 门面
   *   →fallback 动态→ vue-vendor」自等待，页面零报错死锁（shareScopeMap 恒空）。
   */
  it('纯宿主 + 对象 manualChunks（vue+vue-router 同组）：依赖不改写、本体入 provider 组、无环', { timeout: 120_000 }, async () => {
    const root = fs.mkdtempSync(path.join(HOST_VUE_ROOT, '.mcfix-build-'))
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'mcfix-host',
          private: true,
          type: 'module',
          dependencies: { vue: '^3.5.22', 'vue-router': '^4.4.0' },
        }),
      )
      fs.mkdirSync(path.join(root, 'src'), { recursive: true })
      fs.writeFileSync(
        path.join(root, 'index.html'),
        '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
      )
      fs.writeFileSync(
        path.join(root, 'src/main.ts'),
        [
          `import { createApp, ref } from 'vue'`,
          `import { createRouter, createWebHistory } from 'vue-router'`,
          `void createApp({ setup: () => () => ref(1) }).mount('#app')`,
          `void createRouter({ history: createWebHistory(), routes: [] })`,
        ].join('\n'),
      )
      const outDir = path.join(root, 'dist')

      await build({
        root,
        configFile: false,
        logLevel: 'warn',
        plugins: [
          federation({
            name: 'mcfix-host',
            remotes: { 'remote-a': { dev: 'http://localhost:5101', prod: '/remote-a' } },
            shared: { vue: { singleton: true, requiredVersion: '^3.5.0' } },
            // 无 exposes、无 devSharedSelf —— 与 MES admin 同形态的纯宿主
          }),
        ],
        build: {
          outDir,
          emptyOutDir: true,
          target: 'es2022',
          minify: false,
          rollupOptions: {
            output: {
              manualChunks: { 'vue-vendor': ['vue', 'vue-router'] },
            },
          },
        },
      })

      const jsDir = path.join(outDir, 'assets')
      const dir = fs.existsSync(jsDir) ? jsDir : outDir
      const chunks = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
      expect(chunks.length).toBeGreaterThan(0)
      const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8')

      // 1. 产物 chunk 静态依赖图无环（旧缺陷即环）
      expect(findChunkCycles(dir)).toEqual([])

      // 2. MC-FIX-2：真实 vue 本体进 fulgurjs-provider-vue 组（用户 vue-vendor 分组被
      //    provider 隔离覆盖），与消费方 chunk 物理分离
      const providerVue = chunks.filter((f) => f.startsWith('fulgurjs-provider-vue'))
      expect(providerVue.length).toBeGreaterThanOrEqual(1)

      // 3. MC-FIX-1：宿主自身依赖（vue-router 包体所在 chunk——用户组或 provider 组）
      //    不得出现对协商门面的静态依赖——post 兜底不得门面化宿主 node_modules 消费方。
      //    （入口等应用源码 chunk 的门面导入是 pre 改写的正确行为，不在本断言范围）
      const vendorOrProvider = chunks.filter(
        (f) => f.startsWith('fulgurjs-provider-') || (f.startsWith('vue-vendor') && !f.startsWith('fulgurjs-')),
      )
      expect(vendorOrProvider.length).toBeGreaterThan(0)
      for (const f of vendorOrProvider) {
        expect(read(f)).not.toMatch(/from ["']\.\/fulgurjs-shared-/)
      }

      // 4. 门面 chunk 仍是"汇"：静态依赖只指向插件自身 chunk
      const facadeChunk = chunks.find((f) => /^fulgurjs-shared-vue-/.test(f))
      if (facadeChunk) {
        const staticImports = [...read(facadeChunk).matchAll(/from\s*["']\.\/([^"']+)["']/g)].map((m) => m[1])
        expect(staticImports.filter((f) => !/^(fulgurjs-|virtual_fulgurjs-)/.test(f))).toEqual([])
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

/**
 * D6 补充（2026-09-23）：post 阶段 auto-import 兜底——unplugin-auto-import 等后置插件
 * 注入的 `import { ref } from 'vue'` 发生在本插件 pre.transform 之后，会绕过门面化并
 * 静态绑定本地 vue 副本，形成「协商系统 vs 本地系统」双响应性并存（实测症状：同一组件
 * 内 A ref 的赋值不触发渲染、B ref 的赋值正常）。post.transform 必须对 build 下的
 * 非 .vue 文件兜底改写。WP1（2026-09-23）起该逻辑提取为 buildFallbackTransform 共享函数，
 * 并新增 resolveId 期兜底改道（覆盖 auto-import 注册在 federation() 之后的顺序）。
 * 真实构建回归见 tests/build-plugin-chain.test.ts；此处为源码契约快速定位。
 */
describe('D6: post 阶段 auto-import 兜底（源码契约）', () => {
  const src = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/index.ts'),
    'utf8',
  )
  it('post.transform 在 build 下委托 buildFallbackTransform（非 .vue 文件不跳过）', () => {
    expect(src).toContain("if (state.command === 'build') {")
    expect(src).toContain('return buildFallbackTransform(code, id)')
    // 兜底函数覆盖非 .vue 文件（isJsLike 含 .ts/.js），且带 import/require 快速预检
    const fnStart = src.indexOf('async function buildFallbackTransform')
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = src.slice(fnStart, src.indexOf('\n  }', fnStart))
    expect(fnBody).toContain("clean.endsWith('.vue')")
    expect(fnBody).toContain('const quickCheck')
    expect(fnBody).toContain('rewriteShared: true')
  })
  it('build 下 isPluginProcessedModule 守卫不拦截兜底（transformModule 幂等，依赖 collect 完成）', () => {
    // D6 补丁：守卫在 build 下会拦掉「pre 已处理 + auto-import 后置注入」的文件
    //（.vue script 子请求必被 pre 标记），故 build 分支的守卫判定必须限定 serve
    const guardLine = src.match(/if \((state\.command === 'serve' && )?isPluginProcessedModule\(code\)\) return/)
    expect(guardLine).toBeTruthy()
    expect(guardLine![1]).toContain("state.command === 'serve'")
  })
  it('兜底传入 sharedClosureRoots（与 pre 一致的闭包静态化）', () => {
    const fnStart = src.indexOf('async function buildFallbackTransform')
    const fnBody = src.slice(fnStart, src.indexOf('\n  }', fnStart))
    expect(fnBody).toContain('sharedClosureRoots: state.sharedClosureRoots')
  })
  it('WP1：resolveId 期兜底改道存在（覆盖 auto-import 注册在 federation() 之后的顺序）', () => {
    expect(src).toContain('state.transformedModules.has(importer)')
    expect(src).toContain('RESOLVED.sharedNsFacade(hit.shareKey)')
  })
})
