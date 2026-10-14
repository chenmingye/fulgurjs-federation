// @vitest-environment jsdom
/**
 * bindStoreToApp（/vue 显式状态归属）单测。
 * 用真实 Pinia 验证：双实例异步隔离、省略/null 补绑定实例、显式参数尊重、
 * $id 与热更新属性保留、getter 延迟初始化、未就绪报错、不修改全局 activePinia。
 */
import { describe, expect, it } from 'vitest'
import { createPinia, defineStore, getActivePinia, setActivePinia } from 'pinia'
import { bindStoreToApp } from '../src/vue-store'

const counterDefinition = defineStore('counter', {
  state: () => ({ count: 0 }),
  getters: {
    doubled: (state) => state.count * 2,
  },
  actions: {
    async incrementLater() {
      await Promise.resolve()
      this.count += 1
    },
  },
})

describe('bindStoreToApp：实例归属', () => {
  it('两个应用、两个 Pinia、同名 store：异步回调分别进入所属实例', async () => {
    const piniaA = createPinia()
    const piniaB = createPinia()
    const useA = bindStoreToApp(counterDefinition, piniaA)
    const useB = bindStoreToApp(counterDefinition, piniaB)
    // 模拟异步期间全局 activePinia 被切到另一应用（这正是该 API 防的坑）
    setActivePinia(piniaB)
    const storeA = useA()
    const storeB = useB()
    await storeA.incrementLater()
    await storeA.incrementLater()
    await storeB.incrementLater()
    expect(useA().count, 'A 的异步更新只进 A 实例').toBe(2)
    expect(useB().count, 'B 不受 A 影响').toBe(1)
    expect(useA().$id).toBe('counter')
    expect(useA()).not.toBe(useB())
  })

  it('省略参数与 null 参数都补绑定实例；显式传其他实例时尊重调用参数', () => {
    const piniaBound = createPinia()
    const piniaOther = createPinia()
    const use = bindStoreToApp(counterDefinition, piniaBound)
    use().count = 5
    expect(use().count, '省略参数 → 绑定实例').toBe(5)
    use(null as never).count = 7
    expect(use().count, 'null 参数 → 绑定实例').toBe(7)
    use(piniaOther).count = 100
    expect(use(piniaOther).count, '显式实例 → 尊重参数').toBe(100)
    expect(use().count, '显式调用不影响绑定实例').toBe(7)
  })

  it('返回代理保留 $id 等属性与函数语义（receiver 不变）', () => {
    const use = bindStoreToApp(counterDefinition, createPinia())
    expect(use.$id, 'store definition 的 $id 透传').toBe('counter')
    const store = use()
    expect(store.$id).toBe('counter')
    expect(typeof store.incrementLater).toBe('function')
  })

  it('getter 延迟初始化；未就绪的延迟 getter 报明确错误', async () => {
    const use = bindStoreToApp(counterDefinition, createPinia())
    const store = use()
    store.count = 21
    expect(store.doubled, 'getter 在访问时求值').toBe(42)
    // 延迟解析：模块导入时 Pinia 尚未创建（单默认应用常见形态）
    let pinia: ReturnType<typeof createPinia> | null = null
    const useLazy = bindStoreToApp(counterDefinition, () => pinia as never)
    expect(() => useLazy(), '未就绪 → 三段式明确报错').toThrowError(/本应用的 Pinia 尚未创建/)
    pinia = createPinia()
    useLazy().count = 3
    expect(useLazy().count, '就绪后正常进入实际实例').toBe(3)
  })

  it('代理不改变 Pinia 原生 activePinia 语义；正常组件注入不受影响', async () => {
    const piniaA = createPinia()
    const piniaB = createPinia()
    // 基线：Pinia 原生行为——显式传实例的 useStore 会把 activePinia 设为该实例
    counterDefinition(piniaA as never)
    const baseline = getActivePinia()
    setActivePinia(piniaB)
    const useA = bindStoreToApp(counterDefinition, piniaA)
    await useA().incrementLater()
    expect(getActivePinia(), '代理与裸调用对 activePinia 的效果一致（无额外切换）').toBe(baseline)
    // 原生注入（组件 setup 内 counterDefinition()）读到的是当前 activePinia 上的实例；
    // 绑定实例的异步写入不污染该实例
    setActivePinia(piniaB)
    const storeB = counterDefinition()
    await useA().incrementLater()
    expect(storeB.count, '原生注入实例未被绑定实例的写入污染').toBe(0)
    expect(useA().count, '绑定实例收到自己的两次异步更新').toBe(2)
    expect(storeB.count, '再次读取仍不受影响').toBe(0)
  })
})
