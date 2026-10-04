import type { FederationOptions } from '@fulgurjs/federation'

/**
 * Vue 子应用联邦配置（examples/templates/showcase/vue-remote，端口 5335）。
 * 只暴露 ./bridge 桥接契约；宿主（react-host）启用 URL 同步后经它加载。
 * vue-router 是子应用自己的受控路由库（不进 shared），由消费方自装。
 */
export default {
  name: 'vue-remote',
  filename: 'fulgurjs-remoteEntry.js',
  exposes: {
    './bridge': './src/bridge.ts',
  },
  shared: {
    vue: { singleton: true },
  },
} satisfies FederationOptions
