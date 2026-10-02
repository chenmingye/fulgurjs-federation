/** 普通 TS 工具模块（exposes['./utils']）：演示卡片③④的 loadRemote 目标 */
export const VERSION_TAG = 'sh-remote-a/utils'

export function addUp(...nums: number[]): number {
  return nums.reduce((acc, n) => acc + n, 0)
}

export function repeatText(text: string, times: number): string {
  return Array.from({ length: times }, () => text).join(' ')
}
