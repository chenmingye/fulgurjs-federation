import type { FederationOptions } from '@fulgurjs/federation'

/**
 * 宿主端联邦配置（唯一需要维护的联邦声明文件）。
 * - 只静态注册正常远程 err-good（卡 2/4/6/7/8/10 的加载目标）；
 * - 卡 1/3/9 的故障远程（err-unreachable / err-hang / err-setup-bad）由页面内
 *   registerRemote 运行时注册（promise remote / 动态地址），不走配置文件——
 *   故障注入是运行时行为，配置面保持与真实工程一致的最小形态。
 */
export default {
  name: 'err-host',
  remotes: {
    'err-good': {
      dev: 'http://localhost:5352/err-good',
      prod: '/err-good',
    },
  },
  shared: {
    vue: { singleton: true },
  },
} satisfies FederationOptions
