import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config.ts'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/vue-remote/' : undefined,
  // vue-router 双实例防护（同 fixtures/remote-a）：dedupe 强制单实例；vue-router 不进
  // 预构建——预构建副本会内联本地 vue，与 shared singleton 协商出的 vue 形成双实例，
  // 路由 provide/inject 断链。exclude 后走源码，其 vue 导入被插件 dev 改写到 shared 门面。
  resolve: { dedupe: ['vue', 'vue-router'] },
  optimizeDeps: { exclude: ['vue-router'] },
  plugins: [vue(), federation(fulgurjsConfig)],
}))
