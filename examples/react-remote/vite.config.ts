import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig({
  plugins: [react(), federation(fulgurjsConfig)],
})
