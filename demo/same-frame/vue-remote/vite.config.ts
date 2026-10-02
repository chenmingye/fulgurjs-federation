import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/sf-vue-remote/' : undefined,
  plugins: [vue(), federation(fulgurjsConfig)],
}))
