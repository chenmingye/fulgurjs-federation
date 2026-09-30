import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config.ts'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/react-remote/' : undefined,
  plugins: [react(), federation(fulgurjsConfig)],
}))
