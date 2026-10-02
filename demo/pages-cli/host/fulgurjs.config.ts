import type { FederationOptions } from '@fulgurjs/federation'
import { pages, remotePrefixes } from './src/fulgurjs/pages.data'

/**
 * 宿主端联邦配置（唯一需要维护的联邦声明文件）。
 * - remotes：改远程地址只动这里；dev 地址挂 /pc-remote/ 路径段（与远程 vite base 一致）；
 * - hostPages：页面表 + 路由前缀归属的具名导出——浏览器侧 createHostPages 与
 *   CLI check-pages/explain 消费同一份数据模块（src/fulgurjs/pages.data.ts，README §4/§10 契约）。
 */
export default {
  name: 'pc-host',
  remotes: {
    'pc-remote': {
      dev: 'http://localhost:5363/pc-remote',
      prod: '/pc-remote',
    },
  },
  shared: {
    vue: { singleton: true },
  },
} satisfies FederationOptions

/** 页面核对数据（仅供 CLI explain/check-pages 读取，不是 federation() 的参数） */
export const hostPages = { pages, remotePrefixes }
