import type { FederationOptions } from '@fulgurjs/federation'

/**
 * remote-b 联邦配置（demo/shared「共享依赖与运行时能力」场景）。
 *
 * 本应用 package.json 固定安装 nanostores 0.6.0（旧版本）：以
 * { singleton: true, requiredVersion: false } 参与共享协商——被宿主加载时，
 * singleton 裁决命中作用域中已加载的宿主 0.11.4，本端 0.6.0 注册后不被采用。
 */
export default {
  name: 'sh-remote-b',
  filename: 'fulgurjs-remoteEntry.js',
  exposes: {
    './RemoteCounter': './src/exposes/RemoteCounter.vue',
    './info': './src/exposes/info.ts',
  },
  shared: {
    vue: { singleton: true },
    nanostores: { singleton: true, requiredVersion: false },
  },
} satisfies FederationOptions
