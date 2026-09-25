/**
 * 通用起步样例（4.2.0 单项目契约形态）：一个远程 + 一个宿主各一份配置。
 * 完整字段说明见 `fulgurjs init` 生成的起步模板（fulgurjs init --template fulgurjs.config.ts）。
 */
import type { FederationOptions } from '@fulgurjs/federation'

// ── remote-a/fulgurjs.config.ts（远程应用自己的配置）──
export const remoteAConfig = {
  name: 'remote-a',
  exposes: {
    './pages/remote-a/home': './src/views/Home.vue',
    './pages/remote-a/detail': './src/views/Detail.vue',
  },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions

// ── host/fulgurjs.config.ts（宿主应用自己的配置：消费地址 + 可选页面核对数据）──
export const hostConfig = {
  name: 'host-app',
  remotes: {
    'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' },
  },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions

// 宿主页面核对数据（具名导出 hostPages，仅供 CLI explain/check-pages；不是 federation() 参数）：
// export const hostPages = { pages: [{ route: '/remote-a/home', name: 'RemoteAHome', title: '首页' }],
//                            remotePrefixes: { '/remote-a/': 'remote-a' } }

// 各自 vite.config.ts 里：
//   import federation from '@fulgurjs/federation'
//   import fulgurjsConfig from './fulgurjs.config'
//   plugins: [ ..., federation(fulgurjsConfig) ]
