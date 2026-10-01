import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/bridge-react-host/' : undefined,
  plugins: [react(), federation(fulgurjsConfig)],
}))
