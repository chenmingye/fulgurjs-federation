import { expect, it } from 'vitest'
import { createTypesCacheWorker } from '../src/dts-cache-worker-client'

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
