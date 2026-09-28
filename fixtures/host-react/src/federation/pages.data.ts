/**
 * 页面表数据（纯数据：不 import React/路由库/浏览器对象，CLI 与浏览器适配器共用）。
 * keepAlive 字段保留为宿主自由扩展位——React 侧不获得 Vue 的保活保证（文档已声明）。
 */
export interface PageRecord {
  route: string
  spec?: string
  name?: string
  title?: string
  keepAlive?: boolean
}

export const pages: PageRecord[] = [
  { route: '/remote-react/home', spec: 'pages/home', name: 'RemoteHome', title: '远程首页', keepAlive: true },
  { route: '/remote-react/detail/:id', spec: 'pages/detail', name: 'RemoteDetail', title: '远程参数页' },
]

export const remotePrefixes: Record<string, string> = {
  '/remote-react': 'remote-react',
}
