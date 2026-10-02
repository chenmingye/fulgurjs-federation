import { defineConfig, type Connect, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config.ts'

/**
 * 卡 3 故障注入插件：/fulgurjs-hang-entry.js 挂起中间件——TCP 可达但响应永不到达
 * （既不写响应也不调用 next）。运行时 registerRemote timeout:1500 会先超时；浏览器侧
 * 该次动态 import 永久挂起（import 无法取消，单条 in-flight 记录被复用）。
 */
const createHangEntryPlugin = (): Plugin => ({
  name: 'err-demo:hang-entry',
  configureServer(server) {
    const hang = (_req: Connect.IncomingMessage, _res: unknown, _next: Connect.NextFunction): void => {
      /* 故意挂起：模拟网络黑洞，属卡 3 的注入机制本体，勿改为返回响应 */
    }
    server.middlewares.use('/fulgurjs-hang-entry.js', hang)
  },
})

// 纯宿主：无 base、无 exposes；联邦相关代码只有插件注册这一处（README 路径②）。
export default defineConfig({
  plugins: [vue(), createHangEntryPlugin(), federation(fulgurjsConfig)],
})
