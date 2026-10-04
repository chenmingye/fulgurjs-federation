import type { FederationOptions } from '@fulgurjs/federation'

/**
 * 同框架 React 子应用联邦配置（examples/demos/same-frame）。
 * - './bridge'：defineBridgeApp 完整子应用契约（宿主经 createReactBridgeApp 整站挂载）。
 * - './components/TicketSummary'：单个远程组件（宿主经 remoteComponent 直渲染，组件级对比项）。
 * 子应用只装并共享自己的框架（react + react-dom singleton）；react-router-dom 不进 shared
 * （createMemoryRouter 自包含，宿主侧另有自己的 router 实例，互不干扰）。
 */
export default {
  name: 'sf-react-remote',
  filename: 'fulgurjs-remoteEntry.js',
  exposes: {
    './bridge': './src/bridge.tsx',
    './components/TicketSummary': './src/exposes/TicketSummary.tsx',
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
