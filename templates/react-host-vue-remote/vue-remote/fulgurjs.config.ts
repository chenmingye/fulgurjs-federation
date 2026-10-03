import type { FederationOptions } from '@fulgurjs/federation'

/**
 * Vue 子应用联邦配置：`./bridge` expose = defineBridgeApp 契约模块（任务书 §3.3）。
 * 子应用只安装并共享自己的框架（vue），不为桥接安装对方框架。
 */
export default {
  name: 'bridge-vue-remote',
  filename: 'fulgurjs-remoteEntry.js',
  exposes: {
    './bridge': './src/bridge.ts',
  },
  shared: {
    vue: { singleton: true, requiredVersion: '^3.4.0' },
  },
} satisfies FederationOptions
