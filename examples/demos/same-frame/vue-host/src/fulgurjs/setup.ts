/**
 * @FilePath: /fulgurjs-federation/examples/demos/same-frame/vue-host/src/fulgurjs/setup.ts
 * @Description: 宿主（同时是表单提供方）的联邦初始化入口。
 * globalComponents 声明暴露面（./form/ApprovalForm）依赖的全局注册组件——
 * 表单模板里的 <sf-form-section> 字符串标签按消费方 app 注册表解析；
 * 运行时在每次 loadRemote 时把它们幂等注册到当次消费方 app。
 */
import type { RemoteSetupContext, RemoteSetupModule } from '@fulgurjs/federation/vue'
import FormSection from '../exposes/form/FormSection.vue'

export default async function setup(_context: RemoteSetupContext): Promise<void> {
  // 本演示宿主无应用级副作用；仅声明 globalComponents
}

export const globalComponents: RemoteSetupModule['globalComponents'] = {
  SfFormSection: FormSection,
}
