import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { federation } from '../src/index'

const fixture = path.resolve(__dirname, '../../../fixtures/host-vue')

it.each(['before', 'after'] as const)('dev 自动导入位于 federation %s 时都协商共享实例', async (order) => {
  const vite = await import(pathToFileURL(path.join(fixture, 'node_modules/vite/dist/node/index.js')).href)
  const auto = (await import(pathToFileURL(path.join(fixture, 'node_modules/unplugin-auto-import/dist/vite.js')).href)).default
  const root = fs.mkdtempSync(path.join(fixture, '.dev-auto-'))
  let server: Awaited<ReturnType<typeof vite.createServer>> | undefined
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module', dependencies: { vue: '^3.4.0' } }))
    // 第一份 import 在 pre 已被处理，后置插件仍会补第二份导入。
    fs.writeFileSync(path.join(root, 'entry.ts'), 'import { ref } from "vue"; export const count = ref(0); export const double = computed(() => count.value * 2)')
    const fed = federation({ name: 'auto-provider', exposes: { './Counter': './entry.ts' }, shared: { vue: { singleton: true } }, dts: false })
    const inject = auto({ imports: ['vue'], dts: false })
    server = await vite.createServer({ root, configFile: false, logLevel: 'silent', plugins: order === 'before' ? [inject, ...fed] : [...fed, inject], server: { port: 0 } })
    const result = await server.transformRequest('/entry.ts')
    expect(result?.code).toContain('computed')
    expect(result?.code).toContain('virtual:fulgurjs-shared:vue')
    expect(result?.code).not.toMatch(/from\s*["'][^"']*\/deps\/vue\.js/)
    expect(result?.code).not.toMatch(/from\s*["']vue["']/)
  } finally {
    await server?.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}, 60_000)
