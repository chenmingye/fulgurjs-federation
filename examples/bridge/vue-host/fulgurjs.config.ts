import type { FederationOptions } from '@fulgurjs/federation'

/**
 * Vue 桥接宿主联邦配置。
 * 桥接模式使用合同（README §8.2 / 任务书 §3.5）：宿主必须同时安装 vue + react + react-dom，
 * 并把两套框架 shared 全部 singleton——缺 singleton 是使用违例（双实例症状见 README 故障表）。
 * 推荐入口：/bridge/vue（只携带 Vue 宿主适配器，dev 与生产都不加载 React 宿主适配代码）。
 */
export default {
  name: 'bridge-vue-host',
  remotes: {
    'bridge-react-remote': {
      dev: 'http://localhost:5303',
      prod: '/bridge-react-remote',
    },
  },
  shared: {
    vue: { singleton: true },
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
