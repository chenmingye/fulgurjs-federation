// remote-a/fulgurjs.config.ts —— 远程应用自己的配置（一项目一份；整文件可复制到你的远程项目根目录）
//
// Vite 接入（本项目 vite.config.ts 只需两行联邦相关代码）：
//   import federation from '@fulgurjs/federation'
//   import fulgurjsConfig from './fulgurjs.config'
//   // plugins: [ ...原有插件, federation(fulgurjsConfig) ]
//
// CLI（纯本地，无网络）：npx fulgurjs explain
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  // 联邦容器名（宿主引用它时用这个名；同一页面内唯一）
  name: 'remote-a',
  // 对外暴露的模块：'./键' → 相对本项目根的源文件路径
  exposes: {
    './pages/remote-a/home': './src/views/Home.vue',
    './pages/remote-a/detail': './src/views/Detail.vue',
  },
  // 可选：远程需要启动期初始化（全局样式/组件/locale）时声明入口文件
  // setup: './src/fulgurjs/setup.ts',
  shared: {
    vue: { singleton: true },
  },
} satisfies FederationOptions
