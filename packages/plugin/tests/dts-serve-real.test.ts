import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDevTypesServer } from '../src/dts-serve'
import { typesCachePath } from '../src/dts-cache'
import type { NormalizedOptions } from '../src/options'

it('真实Vue失败记录监听目录外依赖，外部修复后自动恢复且失败不写成功缓存', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-failed-input-watch-'))
  const root = path.join(base, 'provider'), external = path.join(base, 'external'), model = path.join(external, 'model.ts')
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.mkdirSync(external)
  fs.writeFileSync(model, 'export interface Model { id:number }')
  fs.writeFileSync(path.join(root, 'package.json'), '{"private":true}')
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, types: [],
  }, include: ['src'] }))
  fs.writeFileSync(path.join(root, 'src/Entry.vue'), `<script setup lang="ts">import type {Model} from '../../external/model';defineProps<{params:Model}>();</script><template>{{params.id.toUpperCase()}}</template>`)
  for (const name of ['typescript', 'vue', 'vue-tsc']) fs.symlinkSync(path.resolve(__dirname, '../node_modules', name), path.join(root, 'node_modules', name), 'dir')
  const logs: string[] = []
  const service = createDevTypesServer({ root, exposes: [{ name: './Entry', import: './src/Entry.vue' }], pluginVersion: 'test', dts: true } as NormalizedOptions,
    { log: line => logs.push(line), warn: line => logs.push(line) })
  try {
    await vi.waitFor(() => expect(logs.join('\n')).toContain('TS2339'), { timeout: 15000 })
    expect(service.revision()).toBeNull()
    expect(fs.existsSync(typesCachePath(root))).toBe(false)
    fs.writeFileSync(model, 'export interface Model { id:string }')
    // 不调用invalidate，也没有Vite根目录watcher；必须由失败输入的外部监听触发。
    await vi.waitFor(() => expect(service.revision()).not.toBeNull(), { timeout: 15000 })
    expect(service.servePath('/@fulgurjs-types/index.json')).not.toBeNull()
    expect(fs.existsSync(typesCachePath(root))).toBe(true)
  } finally { service.dispose(); fs.rmSync(base, { recursive: true, force: true }) }
}, 35000)
