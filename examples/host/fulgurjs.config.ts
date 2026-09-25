// host/fulgurjs.config.ts —— 宿主应用自己的配置（一项目一份；整文件可复制到你的宿主项目根目录）
//
// 宿主只写自己的 name / remotes / shared；页面核对数据以具名导出 hostPages 提供给 CLI。
// Vite 接入（本项目 vite.config.ts 只需两行联邦相关代码）：
//   import federation from '@fulgurjs/federation'
//   import fulgurjsConfig from './fulgurjs.config'
//   // plugins: [ ...原有插件, federation(fulgurjsConfig) ]
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'host-app',
  // 消费的远程（键 = import 前缀；dev/prod 地址二段式，单地址字符串也行）
  remotes: {
    'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' },
  },
  shared: {
    vue: { singleton: true },
  },
} satisfies FederationOptions

// ── 以下仅供 CLI explain/check-pages 读取（不是 federation() 的参数）──
// 页面数据与运行时 createHostPages 消费同一份纯数据模块（唯一手工维护位置）
export const hostPages = {
  remotePrefixes: { '/remote-a/': 'remote-a' },
  pages: [{ route: '/remote-a/home', name: 'RemoteAHome', title: '首页' }],
}
