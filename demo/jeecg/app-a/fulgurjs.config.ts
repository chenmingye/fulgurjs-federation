import type { FederationOptions } from '@fulgurjs/federation'

/**
 * Jeecg-A（联邦宿主实例）联邦配置。
 * remotes：
 *  - jeecg-b：JeecgBoot 官方前端生成的子应用实例（同基线，端口 5372）
 *  - jeecg-c：React 完整子应用（demo/jeecg/react-c，端口 5373）
 * shared 与子应用端对齐（vue 生态四键 singleton）；演示数据层为各应用内置 mock。
 */
export default {
  name: 'jeecg-a',
  filename: 'fulgurjs-remoteEntry.js',
  remotes: {
    'jeecg-b': {
      external: 'http://localhost:5372/',
      dev: 'http://localhost:5372/',
      prod: '/jeecg-b',
    },
    'react-c': {
      external: 'http://localhost:5373/',
      dev: 'http://localhost:5373/',
      prod: '/react-c',
    },
  },
  shared: {
    vue: { singleton: true, requiredVersion: '^3.5.0' },
    react: { singleton: true, requiredVersion: '^19.0.0' },
    'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
    'vue-router': { singleton: true, requiredVersion: '^5.1.0' },
    pinia: { singleton: true, requiredVersion: '^3.0.0' },
    dayjs: { singleton: true, requiredVersion: false },
  },
} satisfies FederationOptions
