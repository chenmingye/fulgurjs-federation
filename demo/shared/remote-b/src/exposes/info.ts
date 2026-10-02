/**
 * remote-b 次要信息模块（exposes['./info']）：演示卡片⑤的预载目标。
 * 默认页面不消费它——preloadRemote('sh-remote-b/info') 才会拉取对应 chunk，
 * 因此 performance 资源时间线能看到真实的新增条目。
 */
export const INFO_REMOTE = 'sh-remote-b'
export const INFO_PURPOSE = 'demo/shared 场景的预载观测目标模块（默认页面不加载，仅 preloadRemote 触拉取）'

export function infoLines(): string[] {
  return [
    `容器名：${INFO_REMOTE}`,
    `用途：${INFO_PURPOSE}`,
  ]
}
