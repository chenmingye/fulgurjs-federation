import type { FederationOptions } from '@fulgurjs/federation'

/**
 * remote-a 联邦配置（demo/shared「共享依赖与运行时能力」场景）。
 *
 * shared 关键点：nanostores 以 { singleton: true, requiredVersion: false } 声明——
 * 本应用安装 0.11.4（与宿主相同），参与共享协商；requiredVersion: false 表示接受
 * 作用域中任意版本，最终由 singleton 裁决（最高版本 / 已加载版本优先）。
 */
export default {
  name: 'sh-remote-a',
  filename: 'fulgurjs-remoteEntry.js',
  exposes: {
    './store': './src/shared/counter.ts',
    './CounterPanel': './src/exposes/CounterPanel.vue',
    './ContextPanel': './src/exposes/ContextPanel.vue',
    './demo-consumer': './src/exposes/demoConsumer.ts',
    './utils': './src/exposes/utils.ts',
  },
  shared: {
    vue: { singleton: true },
    nanostores: { singleton: true, requiredVersion: false },
  },
} satisfies FederationOptions
