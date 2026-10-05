import type { FederationOptions } from '@fulgurjs/federation'

/**
 * 同框架 Vue 子应用联邦配置（examples/demos/same-frame）。
 * - './bridge'：defineBridgeApp 完整子应用契约（宿主经 createVueBridgeApp 整站挂载）。
 * - './components/TicketSummary'：单个远程组件（宿主经 remoteComponent 直渲染，组件级对比项）。
 * 子应用只装并共享自己的框架（vue singleton）；自带的 vue-router 不进 shared
 * （memory 路由自包含，宿主侧另有自己的 vue-router 实例，互不干扰）。
 */
export default {
  name: 'sf-vue-remote',
  filename: 'fulgurjs-remoteEntry.js',
  // 反向消费宿主暴露的远程表单（宿主→子应用→远程表单三层链路；宿主须已启动）
  remotes: {
    'sf-vue-host': {
      dev: 'http://localhost:5324',
      prod: '/',
    },
  },
  exposes: {
    './bridge': './src/bridge.ts',
    './components/TicketSummary': './src/exposes/TicketSummary.vue',
  },
  shared: {
    vue: { singleton: true, requiredVersion: '^3.4.0' },
  },
} satisfies FederationOptions
