import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/jeecg-react-host/' : undefined,
  plugins: [react(), federation(fulgurjsConfig)],
  // Jeecg-B 的演示数据请求前缀（B 在本页运行，相对路径落本端口；顺序：长前缀在前）
  server: {
    proxy: {
      '/jeecgboot-b': { target: 'http://localhost:5380/jeecg-boot-b', changeOrigin: true, rewrite: (p) => p.replace(/^\/jeecgboot-b/, '') },
    },
  },
}))
