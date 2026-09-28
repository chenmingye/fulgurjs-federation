/**
 * 页面表数据（纯数据：不 import React/路由库/浏览器对象——CLI 与浏览器适配器共用）。
 * spec 缺省推导 = 去首段（远程前缀）+ 剥 :参数 段；带参路由建议显式 spec。
 */
export interface PageRecord {
  route: string
  spec?: string
  name?: string
  title?: string
  /** 宿主自由扩展位（keepAlive 等）——与插件 PageRouteLike 的 index signature 对齐 */
  [key: string]: unknown
}

export const pages: PageRecord[] = [
  { route: '/remote-react/home', spec: 'pages/home', name: 'RemoteHome' },
  { route: '/remote-react/detail/:id', spec: 'pages/detail', name: 'RemoteDetail' },
]

export const remotePrefixes: Record<string, string> = {
  '/remote-react': 'remote-react',
}
