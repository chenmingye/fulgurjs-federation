import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'host-vue',
      remotes: {
        // dev/prod 显式拆分：dev 走各自 dev server，prod 走同源 NGINX 子路径（根相对地址，
        // 与 prod-setup 的动态端口解耦——绝对地址会把页面钉死在单一端口）
        'remote-a': { dev: 'http://localhost:5101', prod: '/remote-a' },
        'remote-b': { dev: 'http://localhost:5102', prod: '/remote-b' },
        // webpack 语法 + 键重命名：导入前缀 shop/，容器自报名 remote-a
        shop: { external: 'remote-a@http://localhost:5101', prod: '/remote-a' },
        'promise-remote': () => Promise.resolve({ name: 'promise-remote', init: async () => {}, get: async () => ({}) }), // 运行时注册后生效（见 PromiseRemote.vue）
        // promise-based remote 无法静态序列化（对齐 webpack 'promise new Promise' 的运行时语义），
        // 在 /promise-remote 页面通过 registerRemote 运行时注册后按常规语法消费
      },
      shared: {
        vue: { singleton: true, requiredVersion: '^3.4.0' },
        // eager 素材：pinia 打进初始 chunk（prod 断言初始加载即下载）
        pinia: { singleton: true, eager: true },
        'lodash-es': { shareKey: 'lodash', requiredVersion: '^4.17.0' },
      },
    }),
  ],
})
