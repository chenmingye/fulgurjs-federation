/**
 * 远程自身的数据接口（模块联邦外的普通 fetch；模拟远程应用自己的后台）。
 * 账号相关返回值用于「同页 A→退出→B」会话切换断言（B 的真实数据生效）。
 */
export async function fetchGreeting(account: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 30))
  return `hello ${account} @ remote-data-v1`
}
