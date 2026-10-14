import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import federation from '@fulgurjs/federation'
import config from './fulgurjs.config'
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/application-vue/' : '/',
  resolve: { dedupe: ['vue', 'vue-router', 'pinia'] },
  plugins: [vue(), federation(config)],
}))
