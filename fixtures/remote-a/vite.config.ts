import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'

export default defineConfig({
  // vue-router 不进预构建：预构建副本会内联本地 vue，与 shared singleton 协商出的
  // vue 形成双实例，路由 provide/inject 断链（DEV-004 同类风险，桥接轮实测复现）。
  // exclude 后走源码，其 vue 导入被插件 dev 改写到 shared 门面，全链单实例。
  optimizeDeps: { exclude: ['vue-router'] },
  plugins: [
    vue(),
    federation({
      name: 'remote-a',
      filename: 'fulgurjs-remoteEntry.js',
      exposes: {
        './Button': './src/exposes/Button.vue',
        './StyledCard': './src/exposes/StyledCard.vue',
        './VueCheck': './src/exposes/VueCheck.vue',
        './utils': './src/exposes/utils.ts',
        './StaticDep': './src/exposes/StaticDep.vue',
        './static-dep-second': './src/exposes/static-dep-second.ts',
        './counter': './src/exposes/counter.ts',
        // 5.3.0 桥接：Vue 子应用契约 + 故障注入 expose（BN01/BN02）
        './bridge': './src/bridge.ts',
        './bridge-broken': './src/bridge-broken.ts',
        './bridge-mount-fail': './src/bridge-mount-fail.ts',
      },
      shared: {
        vue: { singleton: true, requiredVersion: '^3.4.0' },
        pinia: { singleton: true },
      },
    }),
  ],
})
