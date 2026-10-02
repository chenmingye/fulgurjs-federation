import type { FederationOptions } from '@fulgurjs/federation'
import { pages, remotePrefixes } from './src/fulgurjs/pages.data'

/**
 * 远程端联邦配置（唯一需要维护的联邦声明文件）。
 * - exposes：宿主页面表按这里的键加载模块（pages/* 为联邦页面，widgets/* 为普通组件，
 *   setup 为初始化生命周期入口的公开对照键——见下方说明）；
 * - setup：README §10 的生命周期入口声明（默认导出 setup 应用级一次 + 可选 onSession
 *   按宿主 sessionKey 去重），插件内部经保留键 ./__fulgurjs_setup__ 携带，不占用公开 exposes；
 * - shared：vue singleton——跨应用必须同实例。
 */
export default {
  name: 'pc-remote',
  filename: 'fulgurjs-remoteEntry.js',
  exposes: {
    './pages/orders': './src/pages/Orders.vue',
    './pages/orders-detail': './src/pages/OrdersDetail.vue',
    './pages/dashboard': './src/pages/Dashboard.vue',
    './widgets/stat-card': './src/widgets/StatCard.vue',
    // 公开对照键：指向 setup 生命周期文件本身，用于演示「模块可加载 ≠ 生命周期执行」——
    // loadRemote('pc-remote/setup') 只取得模块导出，不会执行 setup/onSession；
    // 初始化一律由 federation({ setup }) 声明驱动（README §10 的显式边界）。
    './setup': './src/fulgurjs/setup.ts',
  },
  setup: './src/fulgurjs/setup.ts',
  shared: {
    vue: { singleton: true, requiredVersion: '^3.4.0' },
  },
} satisfies FederationOptions

/**
 * 远程侧同源页面数据（hostPages 具名导出，仅供 CLI explain/check-pages 读取，不是
 * federation() 的参数）：与本目录 src/fulgurjs/pages.data.ts 同源（同一份纯数据模块），
 * 内容与宿主 demo/pages-cli/host 的页面表一致——「宿主页面表 ↔ 远程页面清单」的契约
 * 对照即以此为基准（真实工程中页面表唯一手工维护位置在宿主，远程只维护 exposes 键）。
 */
export const hostPages = { pages, remotePrefixes }
