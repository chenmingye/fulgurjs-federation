import type { FederationOptions } from '@fulgurjs/federation'

/**
 * Jeecg-B（联邦子应用实例）联邦配置。
 *
 * 本工程由 JeecgBoot 官方 v3.9.5 前端基线生成（来源/锁定见 demo/jeecg/README.md），
 * 仅做联邦接线补丁：expose ./bridge = defineBridgeApp 桥接契约模块。
 * shared 只共享 vue 生态四键（singleton），ant-design-vue 等 UI 库不共享以保同步语义。
 */
export default {
  name: 'jeecg-b',
  filename: 'fulgurjs-remoteEntry.js',
  manifest: true,
  exposes: {
    './bridge': 'src/fulgurjs/bridge.ts',
  },
  // 三层嵌套链路（A→B→C）：B 作为中间层宿主也要能加载 React-C
  remotes: {
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
