<template>
  <div class="ns-panel">
    <div class="ns-panel-title">remote-b 组件（sh-remote-b/RemoteCounter，本端声明 nanostores 0.6.0）</div>
    <p v-if="note" class="ns-muted">{{ note }}</p>
    <template v-else>
      <div class="ns-panel-count">计数：{{ count }}</div>
      <button class="ns-btn" type="button" @click="bump(1)">+1</button>
      <button class="ns-btn" type="button" @click="bump(5)">+5</button>
      <ul class="ns-panel-meta">
        <li>实例标识：{{ instanceTag }}</li>
        <li>本组件 import 的 atom === store 导出工厂：{{ factorySameText }}</li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * remote-b 暴露的计数面板（演示卡片①的第三处）：
 * - 本应用安装 nanostores 0.6.0（旧版本）；被宿主加载时本组件对 nanostores 的导入
 *   经 singleton 协商实际使用作用域中已加载的宿主 0.11.4——用「自己 import 的 atom
 *   是否 === store 导出的 atomFactory」直接验证协商结果；
 * - 计数 atom 来自跨远程加载的 sh-remote-a/store（联邦内唯一 store 模块实例）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { loadRemote } from '@fulgurjs/federation/runtime'
import { atom as localAtom } from 'nanostores'

const count = ref(0)
const instanceTag = ref('')
const factorySame = ref<boolean | null>(null)
const note = ref('正在跨远程加载 sh-remote-a/store …')

const factorySameText = computed(() => {
  if (factorySame.value === null) return '检测中'
  return factorySame.value
    ? '一致（singleton 协商生效：0.6.0 声明被收敛到共享实例）'
    : '不一致（出现了第二份 nanostores）'
})

let store: Record<string, any> | undefined
let unsubscribe: (() => void) | undefined

onMounted(async () => {
  try {
    store = (await loadRemote('sh-remote-a/store')) as Record<string, any>
    instanceTag.value = String(store.NS_INSTANCE)
    factorySame.value = localAtom === store.atomFactory
    // nanostores 0.11 API：subscribe 立即回调一次并返回退订函数（旧版 .sub 已移除）
    unsubscribe = store.counter.subscribe((value: number) => { count.value = value })
    count.value = store.counter.get()
    note.value = ''
  } catch (err) {
    note.value = '独立运行时无法跨远程加载 sh-remote-a/store（该组件需在宿主页面查看）。原因：' + String((err as Error)?.message ?? err)
  }
})

onUnmounted(() => unsubscribe?.())

function bump(delta: number): void {
  store?.bumpCounter(delta)
}
</script>

<style scoped>
.ns-panel { font-size: 13px; line-height: 1.7; }
.ns-panel-title { font-weight: 600; margin-bottom: 6px; }
.ns-panel-count { font-size: 18px; font-weight: 700; color: #1677ff; margin: 6px 0; }
.ns-btn { border: 1px solid #1677ff; background: #1677ff; color: #fff; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; margin-right: 6px; }
.ns-panel-meta { font-size: 12px; color: #5b6470; padding-left: 16px; margin: 8px 0 0; word-break: break-all; }
.ns-muted { font-size: 12px; color: #8a919f; }
</style>
