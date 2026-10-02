import type { FederationOptions } from '@fulgurjs/federation'

/**
 * React 宿主（套 Jeecg-B 子应用）联邦配置。
 * 桥接使用合同（README §8.2）：宿主同时安装 vue + react + react-dom，shared 全部 singleton——
 * Vue 子应用（jeecg-b）经协商复用宿主提供的 vue 实例。
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
    pinia: { singleton: true, requiredVersion: '^3.0.0' },
    dayjs: { singleton: true, requiredVersion: false },
  },
} satisfies FederationOptions
