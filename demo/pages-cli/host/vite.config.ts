import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config.ts'

// 纯宿主：无 base、无 exposes；联邦相关代码只有插件注册这一处（README 路径②）。
export default defineConfig({
  plugins: [vue(), federation(fulgurjsConfig)],
})
