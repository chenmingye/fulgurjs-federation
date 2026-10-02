import type { FederationOptions } from '@fulgurjs/federation'

/**
 * React 宿主联邦配置（demo/bridge-router/react-host，端口 5336）。
 * 桥接宿主双框架安装合同：react + react-dom + vue 三键全部 singleton——
 * Vue 子应用的 shared vue 实例经此协商单例，缺失会表现为双实例（MFU-010）。
 */
export default {
  name: 'react-host',
  remotes: {
    'vue-remote': {
      dev: 'http://localhost:5335',
      prod: '/vue-remote',
    },
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
    vue: { singleton: true },
  },
} satisfies FederationOptions
