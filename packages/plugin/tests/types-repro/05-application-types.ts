/**
 * defineApplication / bindStoreToApp 的消费形态类型守卫（正负断言）。
 * - 普通 interface Props 不需要索引签名；
 * - 可选/必填 props 决定 start 是否必须传参；
 * - 拼错字段、错类型必须真实报错（@ts-expect-error）。
 */
import { defineApplication, bindStoreToApp, type Application, type ApplicationHandle } from '@fulgurjs/federation/vue'
import { createApp } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineStore } from 'pinia'

interface OptionalProps { label?: string }
interface RequiredProps { label: string; count: number }

// 普通 interface（无索引签名）可直接使用
const optional = defineApplication<OptionalProps>((props) => {
  const label: string | undefined = props.label
  void label
  return { app: createApp({ render: () => null }), router: createRouter({ history: createMemoryHistory(), routes: [] }) }
})
// 可选 props：start 可省参数
async function startOptional(): Promise<ApplicationHandle> {
  const handle = await optional.start('#app')
  handle.unmount()
  return handle
}
void startOptional
// @ts-expect-error 可选字段传错类型必须报错
void optional.start('#app', { label: 42 })

const required = defineApplication<RequiredProps>(() => ({
  app: createApp({ render: () => null }),
  router: createRouter({ history: createMemoryHistory(), routes: [] }),
}))
// @ts-expect-error 必填 props 缺参必须报错
void required.start('#app')
// @ts-expect-error 拼错字段名必须报错
void required.start('#app', { label: 'x', count: 1, lable: 'typo' })
// @ts-expect-error 必填字段类型错误必须报错
void required.start('#app', { label: 'x', count: 'not-a-number' })

const typed: Application<RequiredProps> = required
void typed

// bindStoreToApp：保留 useStore 的参数/返回类型与 $id 属性
const useCounterStore = defineStore('counter', { state: () => ({ count: 0 }) })
const pinia = { install: () => {} } as never
const useBound = bindStoreToApp(useCounterStore, pinia)
const store = useBound()
const id: string = store.$id
const count: number = store.count
void id
void count
// @ts-expect-error store 上不存在的字段必须报错
store.nonexistent
