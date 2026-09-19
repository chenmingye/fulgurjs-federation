/**
 * 通用起步样例：一个宿主 + 一个远程（应用名/路径均为虚构）。
 * 用法：npx fulgur init --config examples/fulgur.config.example.ts
 * 完整字段说明见 `fulgur init` 生成的起步模板（fulgur init --template fulgur.config.ts）。
 */
import { defineFulgurConfig } from '@fulgurjs/federation/config'

export default defineFulgurConfig({
  root: process.cwd(),
  apps: [
    {
      path: 'apps/host',
      name: 'host-app',
      port: 5173,
      base: '/',
      host: {
        remotePrefixes: { '/remote-a/': 'remote-a' },
        remotes: {
          'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' },
        },
        pages: [
          { route: '/remote-a/home', name: 'RemoteAHome', title: '首页' },
          { route: '/remote-a/detail/:id', name: 'RemoteADetail', spec: 'pages/remote-a/detail', title: '详情' },
        ],
      },
    },
    {
      path: 'apps/remote-a',
      name: 'remote-a',
      port: 5174,
      base: '/remote-a',
      remote: {
        exposes: {
          './pages/remote-a/home': './src/views/Home.vue',
          './pages/remote-a/detail': './src/views/Detail.vue',
        },
      },
    },
  ],
  deploy: { webRoot: '/var/www/your-site', listen: 8080 },
})
