/**
 * 宿主本地模块：main.ts 以 shareKey 'lib-alias' 把它注册进共享作用域（演示卡片⑦）。
 * remote-a 的消费模块通过 loadShare('lib-alias') 取到的就是这一份。
 */
export const LIB_ALIAS_VERSION = '1.0.0'
export const PROVIDED_BY = 'sh-host（宿主本地模块 lib/greeting.ts）'

export function greet(name: string): string {
  return `lib-alias 问候：你好，${name}！`
}
