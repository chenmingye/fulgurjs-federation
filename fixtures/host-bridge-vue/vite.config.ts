import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'host-bridge-vue',
      remotes: {
        'remote-react': { dev: 'http://localhost:5103', prod: '/remote-react' },
      },
      // 桥接配方（任务书 §3.5）：双框架 shared 全部 singleton；
      // 子路径共享由插件现有 shared 处理覆盖
      shared: {
        vue: { singleton: true },
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
    }),
  ],
})
