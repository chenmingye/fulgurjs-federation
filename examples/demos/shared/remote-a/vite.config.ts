import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/sh-remote-a/' : undefined,
  plugins: [vue(), federation(fulgurjsConfig)],
}))
