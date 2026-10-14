import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@fulgurjs/federation'
import config from './fulgurjs.config'
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/application-react/' : '/',
  resolve: { dedupe: ['react', 'react-dom', 'react-router-dom'] },
  plugins: [react(), federation(config)],
}))
