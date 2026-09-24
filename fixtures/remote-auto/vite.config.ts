import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { federation } from '@fulgurjs/federation'

export default defineConfig({
  plugins: [
    vue(),
    // D6-4 回归场景：auto-import 在联邦 pre.transform 之后注入 `import { ref } from 'vue'`，
    // 注入必须被 post 阶段兜底改写为协商门面（否则双响应性系统：ref 赋值不触发渲染）。
    AutoImport({ imports: ['vue'], dts: false }),
    federation({
      name: 'remote-auto',
      filename: 'fulgurjs-remoteEntry.js',
      exposes: {
        './Counter': './src/exposes/Counter.vue',
        './api': './src/exposes/api.ts',
      },
      // setup 生命周期 fixture：setup 应用级一次 + onSession 按 sessionKey 去重（§3.3.1）
      setup: './src/fulgurjs/setup.ts',
      shared: {
        vue: { singleton: true, requiredVersion: '^3.4.0' },
      },
    }),
  ],
})
