/**
 * 远程类型注册表消费形态（最新 TS 口径守卫）：模拟宿主已同步远程类型后，插件生成的
 * registry 声明（模块增强包内共享注册表）。登记的入口获得真实类型；未登记字面量
 * 在调用点报错；动态 string 走 unknown 边界（见 04-registry.ts 断言）。
 */
import '@fulgurjs/federation/internal/registry.js'

/**
 * 命名业务合同经 import('demo-host/__internal/contracts') 引用进入入口声明——
 * 该 ambient 模块在 07-ambient-contracts.d.ts（全局脚本；module 文件内的
 * declare module 只是增强，未解析时静默失效）。
 */

declare module '@fulgurjs/federation/internal/registry.js' {
  interface FgRemoteTypes {
    'demo-host/api': {
      getDictItems: (code: string) => Promise<{ label: string; value: string }[]>
      submitForm: (payload: { id: string }) => Promise<void>
    }
    'demo-host/FormRouterPage': { default: import('vue').DefineComponent<{ formId: string }, {}, unknown> }
    'demo-host/AmisFormRouterPage': { default: import('vue').DefineComponent<{ schemaId: string; editable?: boolean }, {}, unknown> }
    'demo-host/bridge': { default: import('@fulgurjs/federation/vue').BridgeApp & { __fgBridgeProps?: { tenantId: string } } }
    'demo-host/NestedForm': { default: import('vue').DefineComponent<{ params?: import('demo-host/__internal/contracts').CustomFormParams }, {}, unknown> }
    'demo-host/FunctionalGreeting': { default: (props: { name: string; count?: number }) => any }
    'demo-host/NoDefaultModule': { util: (x: string) => string }
    'demo-host/AnyComp': { default: any }
  }
}
