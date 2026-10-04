import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig({
  plugins: [vue(), federation(fulgurjsConfig)],
})
