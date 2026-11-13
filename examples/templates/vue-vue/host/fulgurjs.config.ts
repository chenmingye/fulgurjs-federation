import type { FederationOptions, PageRouteLike } from '@fulgurjs/federation'

/**
 * 宿主端联邦配置（唯一需要维护的联邦声明文件）。
 * - remotes：改远程地址只动这里；dev 与生产可以分别指定。
 * - hostPages：页面表 + 路由前缀归属，浏览器侧 createHostPages 与 CLI check-pages 共用。
 */
export default {
  name: 'vue-host',
  remotes: {
    'vue-remote': {
      dev: 'http://localhost:5213',
      prod: '/vue-remote',
    },
  },
  shared: {
    vue: { singleton: true },
  },
} satisfies FederationOptions

/** 页面表：URL 路由 → 远程 expose 的映射（spec = 远程名 + exposes 键） */
const pages: PageRouteLike[] = [
  { route: '/remote/home', spec: 'pages/HomePage', name: 'RemoteHome', title: '远程首页' },
  { route: '/remote/detail/:id', spec: 'pages/DetailPage', name: 'RemoteDetail', title: '远程详情' },
]

/** 路由前缀 → 远程归属（最长前缀匹配） */
const remotePrefixes: Record<string, string> = {
  '/remote': 'vue-remote',
}

/** 运行时页面适配器与CLI核对共用唯一入口，不另维护页面副本。 */
export const hostPages = { pages, remotePrefixes }
