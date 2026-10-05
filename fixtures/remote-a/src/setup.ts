/**
 * @FilePath: /fulgurjs-federation/fixtures/remote-a/src/setup.ts
 * @Description: remote-a 初始化入口（federation({ setup })）。default 必须导出；
 * globalComponents 声明暴露面依赖的全局注册组件——运行时在每次 loadRemote 时
 * 幂等注册到当次消费方 app（remoteComponent 自动捕获）。
 */
import type { RemoteSetupContext, RemoteSetupModule } from '@fulgurjs/federation/vue'

export default async function setup(_context: RemoteSetupContext): Promise<void> {
  // 本远程无应用级副作用；仅声明 globalComponents（见下）
}

// 零参 loader 形态：setup 模块零组件依赖——组件只在本框架消费方真实渲染时才加载
// （React 页面消费本远程纯 TS 模块时不拖入 vue 依赖图，跨源 dev URL 不受影响）
export const globalComponents: RemoteSetupModule['globalComponents'] = {
  FFormSection: () => import('./exposes/FormSection.vue'),
}
