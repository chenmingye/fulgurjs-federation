import type { FederationOptions } from '@fulgurjs/federation'

/**
 * React 宿主（套 Jeecg-B 子应用）联邦配置。
 * 宿主共享实际需要的框架实例。Pinia 由 Jeecg-B 自身提供：
 * 本 React 宿主没有 Pinia 状态，不额外注册一个未使用的 provider。
 */
export default {
  name: 'jeecg-react-host',
  filename: 'fulgurjs-remoteEntry.js',
  remotes: {
    'jeecg-b': {
      external: 'http://localhost:5372/',
      dev: 'http://localhost:5372/',
      prod: '/jeecg-b',
    },
  },
  shared: {
    react: { singleton: true, requiredVersion: '^19.0.0' },
    'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
    vue: { singleton: true, requiredVersion: '^3.5.0' },
    dayjs: { singleton: true, requiredVersion: false },
  },
} satisfies FederationOptions
