/**
 * FgVueRemoteProps 消费形态（props 提取入口，与 FgReactRemoteProps 对应）：
 * 注册表驱动的字段级正反例 + 边界（函数组件/嵌套命名合同/非组件/无 default/
 * any/动态入口）。负向用 @ts-expect-error 断言（未命中会报 Unused 指令）。
 */
import type { FgVueRemoteProps } from '@fulgurjs/federation/vue'

// ===== 构造型组件：字段级语义与直接使用组件一致 =====
type FormProps = FgVueRemoteProps<'demo-host/FormRouterPage'>
export const okForm: FormProps = { formId: 'f1' }
// @ts-expect-error 缺必填 formId
export const missingFormId: FormProps = {}
// @ts-expect-error 数字冒充字符串
export const numericFormId: FormProps = { formId: 1 }

// ===== 嵌套 params：经 ambient 命名合同（真实生成链同形） =====
type NestedParams = NonNullable<FgVueRemoteProps<'demo-host/NestedForm'>['params']>
export const okNested: NestedParams = { id: 'x', name: 'y', disabled: false }
// @ts-expect-error 嵌套必填缺失（id/name）
export const nestedMissing: NestedParams = { toEdit: '1' }
// @ts-expect-error 嵌套字段类型错误（disabled 非 boolean 字面量）
export const nestedBadBool: NestedParams = { id: 'x', name: 'y', disabled: 'false' }
// @ts-expect-error 嵌套字段拼错
export const nestedTypo: NestedParams = { id: 'x', name: 'y', disabeld: true }

// ===== 函数组件：按首参（props）签名提取 =====
type FnProps = FgVueRemoteProps<'demo-host/FunctionalGreeting'>
export const okFn: FnProps = { name: 'n', count: 1 }
// @ts-expect-error 函数组件必填 name 缺失
export const badFn: FnProps = { count: 1 }

// ===== 非组件 / 无 default：诚实结果（never），不伪造对象面 =====
type ApiProps = FgVueRemoteProps<'demo-host/api'>
// @ts-expect-error 非组件入口没有 props 合同（never 拒绝任何赋值）
export const asProps: ApiProps = { formId: 'f1' }
type NoDefaultProps = FgVueRemoteProps<'demo-host/NoDefaultModule'>
// @ts-expect-error 无 default 导出的入口同样没有 props 合同
export const noDefaultProps: NoDefaultProps = {}

// ===== any 入口：源声明即 any，提取不放大也不收窄（与直接消费一致）=====
type AnyProps = FgVueRemoteProps<'demo-host/AnyComp'>
export const anyProps: AnyProps = { whatever: 1 }

// ===== 动态入口：宽松对象面（与 remoteComponent 放行语义一致）=====
const dynamicSpec: string = 'demo-host/' + 'NestedForm'
type DynProps = FgVueRemoteProps<typeof dynamicSpec>
export const dynProps: DynProps = { anything: true }
