import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@fulgurjs/federation'

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'host-bridge-react',
      remotes: {
        'remote-a': { dev: 'http://localhost:5101', prod: '/remote-a' },
      },
      // 桥接配方（任务书 §3.5）：双框架 shared 全部 singleton
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
        vue: { singleton: true },
      },
    }),
  ],
})
