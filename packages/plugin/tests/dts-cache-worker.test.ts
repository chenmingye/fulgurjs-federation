import { expect, it } from 'vitest'
import { createTypesCacheWorker } from '../src/dts-cache-worker-client'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { typesCachePath } from '../src/dts-cache'

it('预热仅载入工具，不解析项目或生成声明，也不创建成功缓存', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-cache-warmup-'))
  const tool = path.join(root, 'node_modules/typescript')
  fs.mkdirSync(tool, { recursive: true })
  fs.writeFileSync(path.join(tool, 'package.json'), '{"name":"typescript","main":"index.js"}')
  fs.writeFileSync(path.join(tool, 'index.js'), 'Object.defineProperty(exports,"createProgram",{get(){throw Error("不得启动编译")}})')
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{ deliberately invalid config')
  const worker = createTypesCacheWorker()
  try {
    await expect(worker.warmup({ root, exposes: [], pluginVersion: 'test' })).resolves.toBeUndefined()
    expect(fs.existsSync(typesCachePath(root))).toBe(false)
  } finally { worker.dispose(); fs.rmSync(root, { recursive: true, force: true }) }
})

it('消息序列化失败不留下悬挂请求，后续请求仍可执行；关闭中任务按正常拒绝收尾', async () => {
  const worker = createTypesCacheWorker()
  const input = { root: '/__fulgurjs_missing_cache_fixture__', exposes: [], pluginVersion: 'test' }
  try {
    await expect(worker.read({ ...input, dts: () => {} })).rejects.toThrow()
    await expect(worker.capture(input)).resolves.toBeNull()
    const pending = worker.capture(input)
    const rejection = expect(pending).rejects.toThrow('类型缓存服务已关闭')
    worker.dispose()
    await rejection
    await expect(worker.read(input)).rejects.toThrow('类型缓存服务已关闭')
  } finally { worker.dispose() }
})
