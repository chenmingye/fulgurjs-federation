import type { FederationOptions } from '@fulgurjs/federation'

/**
 * 宿主联邦配置（examples/demos/shared「共享依赖与运行时能力」场景）。
 *
 * shared 关键点（nanostores 版本协商方案）：
 * - 宿主安装 nanostores 0.11.4（最新 0.x），remote-a 同版本，remote-b 固定旧版 0.6.0；
 * - 三端都以 { singleton: true, requiredVersion: false } 声明——requiredVersion: false
 *   表示接受作用域中任意版本；singleton 裁决实际命中：已加载优先 + 最高版本，
 *   最终三端收敛到宿主提供的 0.11.4（卡片②面板可见 shareScopeMap 中 picked 的 from/version）。
 * - dts 关闭原因：本演示全部经 loadRemote 动态消费远程模块，无静态远程导入，无需类型直连。
 */
export default {
  name: 'sh-host',
  remotes: {
    'sh-remote-a': {
      dev: 'http://localhost:5343',
      prod: '/sh-remote-a',
    },
    'sh-remote-b': {
      dev: 'http://localhost:5345',
      prod: '/sh-remote-b',
    },
  },
  shared: {
    vue: { singleton: true },
    nanostores: { singleton: true, requiredVersion: false },
  },
  dts: false,
} satisfies FederationOptions
