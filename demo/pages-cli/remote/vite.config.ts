import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config.ts'

// dev 与 build 都挂在 /pc-remote/ 路径段下：与宿主 remotes 的 dev/prod 地址
// （http://localhost:5363/pc-remote 与 /pc-remote）以及 doctor --dev 的
// 「<base>/<app>/@fulgurjs-entry.js」探测语义保持一致（README §7 端点约定）。
export default defineConfig({
  base: '/pc-remote/',
  plugins: [vue(), federation(fulgurjsConfig)],
})
