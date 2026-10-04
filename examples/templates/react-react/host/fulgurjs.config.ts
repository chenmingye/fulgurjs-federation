import type { FederationOptions, PageRouteLike } from '@fulgurjs/federation'

/**
 * 宿主端联邦配置（唯一需要维护的联邦声明文件）。
 * - remotes：改远程地址只动这里；dev 与生产可以分别指定。
 * - hostPages：页面表 + 路由前缀归属，浏览器侧 createReactHostPages 与 CLI check-pages 共用。
 */
export default {
  name: 'react-host',
  remotes: {
    'react-remote': {
      dev: 'http://localhost:5203',
      prod: '/react-remote',
    },
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions

/** 页面表：URL 路由 → 远程 expose 的映射（spec = 远程名 + exposes 键） */
export const pages: PageRouteLike[] = [
  { route: '/remote/home', spec: 'pages/HomePage', name: 'RemoteHome', title: '远程首页' },
  { route: '/remote/detail/:id', spec: 'pages/DetailPage', name: 'RemoteDetail', title: '远程详情' },
]

/** 路由前缀 → 远程归属（最长前缀匹配） */
export const remotePrefixes: Record<string, string> = {
  '/remote': 'react-remote',
}
