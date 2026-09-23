import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { federation } from '@fulgurjs/federation'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({ imports: ['vue'], dts: false }),
    federation({
      name: 'host-auto',
      remotes: {
        // prod 用根相对地址（2.0.3 起支持）：与宿主同源的 NGINX 子路径部署形态
        'remote-auto': { dev: 'http://localhost:5111', prod: '/remote-auto' },
      },
      shared: {
        vue: { singleton: true, requiredVersion: '^3.4.0' },
      },
    }),
  ],
})
