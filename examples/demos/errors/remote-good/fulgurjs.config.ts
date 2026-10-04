import type { FederationOptions } from '@fulgurjs/federation'

/**
 * err-good 联邦配置（错误恢复演示的「正常远程」）。
 *
 * exposes 全部为**可正常加载**的模块，故障一律由宿主侧注入或由专门的故障注入 expose 提供：
 * - ClickButton / utils：正常组件与工具函数（各故障卡「恢复后验证可用」的加载目标）；
 * - module-error：模块顶层 throw（卡 4：remoteComponent 默认错误占位语义）；
 * - bridge-good：合法桥接契约（卡 6/7/8 的恢复目标与正常对照）；
 * - bridge-broken：契约非法注入（默认导出缺 mount/unmount → MFU-015）；
 * - bridge-mount-fail：mount 阶段抛错注入（→ MFU-016 phase:mount）；
 * - bridge-unmount-fail：unmount 阶段抛错注入（→ MFU-016 phase:unmount + 容器持久封锁）。
 * - setup：声明初始化生命周期（README §10.2）；读取 globalThis.__FGX_FAIL_SETUP__
 *   决定是否抛错——供卡 9 演示 MFU-012 与 debug.setup = failed 语义。
 */
export default {
  name: 'err-good',
  filename: 'fulgurjs-remoteEntry.js',
  exposes: {
    './ClickButton': './src/exposes/ClickButton.vue',
    './utils': './src/exposes/utils.ts',
    './module-error': './src/exposes/module-error.ts',
    './bridge-good': './src/exposes/bridge-good.ts',
    './bridge-broken': './src/exposes/bridge-broken.ts',
    './bridge-mount-fail': './src/exposes/bridge-mount-fail.ts',
    './bridge-unmount-fail': './src/exposes/bridge-unmount-fail.ts',
  },
  setup: './src/fulgurjs/setup.ts',
  shared: {
    vue: { singleton: true, requiredVersion: '^3.4.0' },
  },
} satisfies FederationOptions
