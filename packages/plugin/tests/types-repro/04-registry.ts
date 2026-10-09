/**
 * 注册表驱动消费形态（用户 IDE 视角）：普通 import、loadRemote、remoteComponent、
 * 桥接工厂共用同一注册表；负向用 @ts-expect-error 断言（未命中会报 Unused 指令）。
 */
import { loadRemote } from '@fulgurjs/federation/runtime'
import { remoteComponent, createVueBridgeApp } from '@fulgurjs/federation/vue'
import type { FgBridgeAppProps, FgRemoteModule } from '@fulgurjs/federation/vue'

const Form = remoteComponent('demo-host/FormRouterPage')
type FormProps = InstanceType<typeof Form>['$props']
export const formProps: FormProps = { formId: 'f1' }

const Amis = remoteComponent('demo-host/AmisFormRouterPage')
type AmisProps = InstanceType<typeof Amis>['$props']
export const amisProps: AmisProps = { schemaId: 's1', editable: true }

const Bridge = createVueBridgeApp('demo-host/bridge')
type BridgeProps = InstanceType<typeof Bridge>['$props']
export const bridgeProps: BridgeProps = { appProps: { tenantId: 't1' } }
export const bridgePropsTyped: FgBridgeAppProps<'demo-host/bridge'> = { tenantId: 't1' }

export async function consume(): Promise<void> {
  const mod = await loadRemote('demo-host/api')
  const items = await mod.getDictItems('sex')
  const firstLabel: string = items[0]?.label ?? ''
  const typed: FgRemoteModule<'demo-host/api'> = mod
  await typed.submitForm({ id: '1' })

  // 动态变量：放行 + unknown 边界
  const dynamicEntry: string = 'demo-host/' + 'api'
  const dyn = await loadRemote(dynamicEntry)

  void firstLabel
  void dyn

  // ===== 负向（应全部报错）=====
  // @ts-expect-error 拼错入口
  const wrongEntry = await loadRemote('demo-host/apix')
  // @ts-expect-error 返回类型错误（label 是 string，赋给 number 报错）
  const bad: number = (await mod.getDictItems('x'))[0]?.label ?? 0
  // @ts-expect-error unknown 边界：动态结果不能当已验证模块
  const dynMember = dyn.getDictItems
  // @ts-expect-error 组件必填 prop 缺失
  const badForm: FormProps = {}
  // @ts-expect-error 普通模块冒充组件入口
  const asComponent = remoteComponent('demo-host/api')
  // @ts-expect-error 桥接 appProps 字段类型错误
  const badBridge: BridgeProps = { appProps: { tenantId: 1 } }
  // @ts-expect-error 普通模块冒充桥接入口
  const asBridge = createVueBridgeApp('demo-host/api')
  void [wrongEntry, bad, dynMember, badForm, asComponent, badBridge, asBridge]
}
