import type { FederationOptions } from '@fulgurjs/federation'

/**
 * React 子应用联邦配置：`./bridge` expose = defineBridgeApp 契约模块（任务书 §3.3）。
 * 子应用只安装并共享自己的框架（react + react-dom），不为桥接安装 Vue。
 */
export default {
  name: 'bridge-react-remote',
  filename: 'fulgurjs-remoteEntry.js',
  exposes: {
    './bridge': './src/bridge.tsx',
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
