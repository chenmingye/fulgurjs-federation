import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config.ts'

// dev 与 build 都挂在 /err-good/ 路径段下：宿主 remotes 的 dev/prod 地址
// （http://localhost:5352/err-good 与 /err-good）与 README §7 端点约定
// 「<base>/@fulgurjs-entry.js」保持一致。
export default defineConfig({
  base: '/err-good/',
  plugins: [vue(), federation(fulgurjsConfig)],
})
