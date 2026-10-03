import type { FederationOptions } from '@fulgurjs/federation'

/**
 * Vue 宿主联邦配置（demo/bridge-router/vue-host，端口 5334）。
 * 桥接宿主双框架安装合同：vue + react + react-dom 三键全部 singleton——
 * React 子应用的 shared 实例经此协商单例，缺失会表现为 Invalid hook call / 双实例（MFU-010）。
 */
export default {
  name: 'vue-host',
  remotes: {
    'react-remote': {
      dev: 'http://localhost:5333',
      prod: '/react-remote',
    },
  },
  shared: {
    vue: { singleton: true },
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
