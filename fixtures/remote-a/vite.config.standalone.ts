import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'

// 容错专项用的独立实例：与主 remote-a 同源码，但容器名不同（5199 端口）
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'remote-a-sa',
      filename: 'fulgurjs-remoteEntry.js',
      exposes: {
        './Button': './src/exposes/Button.vue',
        './utils': './src/exposes/utils.ts',
      },
      shared: {
        vue: { singleton: true, requiredVersion: '^3.4.0' },
      },
    }),
  ],
})
