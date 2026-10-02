/**
 * 宿主桥（演示版，卡片⑩）：登录态与跨应用传值统一入口。
 * 时序契约：先 provideAppContext，再加载远程页面（README §9）。
 * 「登出」后可再次调用本函数重新提供（provide = 顶层 merge，幂等可多次）。
 */
import { provideAppContext } from '@fulgurjs/federation/runtime'

export function provideDemoContext(): void {
  provideAppContext({
    user: { id: 'u-1001', name: '演示用户', roles: ['admin'] },
    // 取最新 token（拉取式防过期）；演示场景返回模拟值
    getToken: () => 'demo-token-<模拟值>',
    // 非敏感登录代次 ID（演示场景无 onSession，不参与去重，仅作标准字段示范）
    sessionKey: 'demo-session-001',
    // 项目扩展位：函数引用通道（远程组件直接调用宿主闭包）
    api: {
      hello: (name: string) => `你好，${name}！本条返回值来自宿主 sh-host 的 api.hello 函数引用`,
    },
  })
}
