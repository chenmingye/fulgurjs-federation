import type { FederationOptions } from '@fulgurjs/federation'

/**
 * React-C（Jeecg 三层链路的 React 子应用）联邦配置。
 * expose ./bridge = 受控 memory data router 桥接契约（/bridge/router/react）。
 */
export default {
  name: 'react-c',
  filename: 'fulgurjs-remoteEntry.js',
  manifest: true,
  exposes: {
    './bridge': 'src/bridge.tsx',
  },
  shared: {
    react: { singleton: true, requiredVersion: '^19.0.0' },
    'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
  },
} satisfies FederationOptions
