import type { FederationOptions } from '@fulgurjs/federation'

/**
 * React 子应用联邦配置（demo/bridge-router/react-remote，端口 5333）。
 * 只暴露 ./bridge 桥接契约；宿主（vue-host）启用 URL 同步后经它加载。
 * react-router-dom 是子应用自己的受控路由库（不进 shared），由消费方自装。
 */
export default {
  name: 'react-remote',
  filename: 'fulgurjs-remoteEntry.js',
  exposes: {
    './bridge': './src/bridge.tsx',
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
