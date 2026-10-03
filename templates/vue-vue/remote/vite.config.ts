import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config.ts'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/vue-remote/' : undefined,
  plugins: [vue(), federation(fulgurjsConfig)],
}))
