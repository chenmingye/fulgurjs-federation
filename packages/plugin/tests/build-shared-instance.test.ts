import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'
import { expect, it } from 'vitest'
import { federation } from '../src/index'

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/host-vue')
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

it('双向应用的同步共享消费与运行时消费使用同一响应式实例', { timeout: 30_000 }, async () => {
  const root = fs.mkdtempSync(path.join(fixture, '.shared-instance-'))
  try {
    fs.mkdirSync(path.join(root, 'src'))
    // CI 的 unit 作业只安装插件依赖，不能借本机 fixture 已有 node_modules 通过。
    fs.mkdirSync(path.join(root, 'node_modules'))
    for (const dep of ['vue', 'vite']) {
      fs.symlinkSync(path.join(pluginRoot, 'node_modules', dep), path.join(root, 'node_modules', dep), 'dir')
    }
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module', dependencies: { vue: '^3.5.0' } }))
    fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>\n<html><head></head><body>\n<script type="module" src="/src/main.ts"></script>\n</body></html>')
    fs.writeFileSync(path.join(root, 'src/main.ts'), `import './probe'`)
    fs.writeFileSync(path.join(root, 'src/theme.ts'), `globalThis.__themeClientLoaded = true`)
    fs.writeFileSync(path.join(root, 'src/seed.ts'), `
      export { registerShare, loadShare } from 'virtual:fulgurjs-runtime'
      export * as local from 'virtual:fulgurjs-shared:vue'
    `)
    fs.writeFileSync(path.join(root, 'src/probe.ts'), `
      import { ref } from 'vue'
      import { loadShare } from 'virtual:fulgurjs-runtime'
      globalThis.__sharedInstanceResult = loadShare('vue', { singleton: true }).then(ns => {
        if (ns.ref !== ref) throw new Error('static/dynamic Vue identity mismatch')
        const value = ref(0)
        let rendered = -1
        const runner = ns.effect(() => { rendered = value.value })
        value.value = 1
        ns.stop(runner)
        if (rendered !== 1) throw new Error('reactivity update lost')
        return rendered
      })
    `)
    await build({
      root, configFile: false, logLevel: 'error',
      plugins: [{
        name: 'inject-absolute-theme-client',
        resolveId: id => ['virtual:injected-client', '/virtual:injected-client'].includes(id) ? '\0injected-client' : undefined,
        load: id => id === '\0injected-client' ? 'globalThis.__injectedClientLoaded = true' : undefined,
        transformIndexHtml: { order: 'pre', handler: () => [
          { tag: 'script', attrs: { type: 'module', src: path.join(root, 'src/theme.ts') }, injectTo: 'head' },
          { tag: 'script', attrs: { type: 'module', src: '/virtual:injected-client' }, injectTo: 'head' },
        ] },
      }, federation({
        name: 'instance-owner', remotes: { other: '/other' },
        exposes: { './Probe': './src/probe.ts' },
        shared: { vue: { singleton: true, requiredVersion: '^3.5.0', strictVersion: true } }, devSharedSelf: false, dts: false,
      })],
      build: {
        target: 'es2022', minify: false, modulePreload: false,
        rollupOptions: {
          // Rolldown 的显式分组模式不兼容 strict；保留入口导出即可验证外部 provider。
          preserveEntrySignatures: 'allow-extension',
          input: { index: path.join(root, 'index.html'), seed: path.join(root, 'src/seed.ts') },
          output: { entryFileNames: 'assets/[name].js', manualChunks: { 'vue-vendor': ['vue'] } },
        },
      },
    })
    const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8')
    const entry = html.match(/src="([^"]+\.js)"/)![1]
    const entryUrl = pathToFileURL(path.join(root, 'dist', entry.replace(/^\//, ''))).href
    const result = execFileSync(process.execPath, ['--input-type=module', '-e',
      `await import(${JSON.stringify(entryUrl)}); console.log(await globalThis.__sharedInstanceResult)`,
    ], { encoding: 'utf8', timeout: 10_000 })
    expect(result.trim()).toBe('1')
    // 另一个进程先登记并加载外部 provider。只检查本地 fallback 的正向例会漏掉
    // “提供方一律直绑本体”的错误：外部实例被选中时，静态消费同样必须收养它。
    const seedUrl = pathToFileURL(path.join(root, 'dist/assets/seed.js')).href
    const adopted = execFileSync(process.execPath, ['--input-type=module', '-e', `
      const seed = await import(${JSON.stringify(seedUrl)});
      const foreign = { ...seed.local, ref: (...args) => seed.local.ref(...args) };
      seed.registerShare('default', 'vue', '3.5.99', async () => foreign, { from: 'preloaded' });
      await seed.loadShare('vue', { singleton: true, requiredVersion: '^3.5.0' });
      await import(${JSON.stringify(entryUrl)});
      console.log(await globalThis.__sharedInstanceResult);
    `], { encoding: 'utf8', timeout: 10_000 })
    expect(adopted.trim()).toBe('1')
    const rejected = execFileSync(process.execPath, ['--input-type=module', '-e', `
      const seed = await import(${JSON.stringify(seedUrl)});
      seed.registerShare('default', 'vue', '4.0.0', async () => seed.local, { from: 'conflicting' });
      await seed.loadShare('vue', { singleton: true, requiredVersion: '^4.0.0' });
      globalThis.window = new EventTarget();
      try {
        await import(${JSON.stringify(entryUrl)});
        console.log('unexpected success');
      } catch (error) { console.log(error.code); }
    `], { encoding: 'utf8', timeout: 10_000 })
    expect(rejected.trim()).toBe('MFU-003')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
