/**
 * 桥接 props 中转：工厂接收的宿主快照在挂载前存这里，供实例内视图读取。
 * 仅 Jeecg-B 桥接模式使用；独立启动时为空对象。
 */
import { reactive } from 'vue'

export interface JeecgBridgeProps {
  /** 宿主透传的登录 token（演示用，真实验证由各端 mock 层自管） */
  token?: string
  /** 宿主登录用户名（显示用） */
  user?: string
  /** 嵌套深度：A=0，B 内嵌 C 时传 0+1；达到上限后不再继续嵌套 */
  depth?: number
}

const state = reactive<JeecgBridgeProps>({})

export function setBridgeProps(props: JeecgBridgeProps | undefined): void {
  Object.assign(state, props ?? {})
}

export function useBridgeProps(): Readonly<JeecgBridgeProps> {
  return state
}
