/**
 * 典型消费形态类型回归（最新 TS 口径）：宿主桥 provide + EP 消费端断言。
 * 背景：bridge.ts 的 provideGlobalConfig(getAppContext(), app) 曾在新版 TS 下
 * 报 ts2345（EP ConfigProviderProps.locale: Language vs context.locale: unknown），
 * 工程内旧版 vue-tsc 未报——本样例集由最新 TS 口径守卫，防 CLI 绿 IDE 红再发。
 */
import { provideAppContext, getAppContext, requireAppContext } from '@fulgurjs/federation/runtime'
import { provideGlobalConfig } from 'element-plus'
import type { App } from 'vue'

// 宿主桥形态（精简后六键 + 扩展位）
provideAppContext({
  user: { id: '101' },
  getToken: () => 'token-value',
  store: {},
  hostApp: {},
  locale: {},
  events: { main: { getDictItems: () => [] } },
})

// 远程 boot 形态：显式校验读取
const ctx = requireAppContext('store', 'user', 'hostApp')
const uid = String((ctx.user as Record<string, any>).id)

// EP 消费端断言形态（消费端按 UI 库形状收窄）
const app = {} as App
provideGlobalConfig(getAppContext() as Record<string, any>, app)

// 反向注册 + 读点
const events = getAppContext().events ?? {}
events.bpm = { formEvent: () => Promise.resolve('N') }
const dict = (getAppContext().events?.main as Record<string, any> | undefined)?.getDictItems?.('sex')
void uid
void dict
