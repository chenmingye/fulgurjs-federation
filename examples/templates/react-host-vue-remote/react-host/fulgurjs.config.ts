import type { FederationOptions } from '@fulgurjs/federation'

/**
 * React 桥接宿主联邦配置（双框架安装合同 + 全 singleton，见 vue-host 同款说明）。
 * 推荐入口：/bridge/react（只携带 React 宿主适配器）。
 */
export default {
  name: 'bridge-react-host',
  remotes: {
    'bridge-vue-remote': {
      dev: 'http://localhost:5313',
      prod: '/bridge-vue-remote',
    },
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
    vue: { singleton: true },
  },
} satisfies FederationOptions
