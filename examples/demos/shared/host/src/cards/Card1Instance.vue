<template>
  <DemoCard
    no="①"
    title="实例身份一致：nanostores 单例（三方同 atom）"
    description="宿主组件、remote-a 组件、remote-b 组件三处渲染同一个 atom 计数。任何一处修改，三处同步——singleton 协商保证全页只有一份 nanostores 实例。remote-b 声明的是旧版 0.6.0，实际也被收敛到共享实例。"
    api="loadRemote('sh-remote-a/store') / remoteComponent / shared: nanostores singleton"
    source="remote-a/src/shared/counter.ts"
  >
    <div class="inst-grid">
      <div class="inst-box">
        <div class="inst-name">宿主组件（本卡片）</div>
        <div class="inst-count">{{ count }}</div>
        <button class="btn" type="button" @click="bump(1)">+1</button>
        <button class="btn" type="button" @click="bump(5)">+5</button>
        <button class="btn ghost" type="button" @click="reset">清零</button>
        <div v-if="storeNs" class="inst-meta">
          <div>实例标识：{{ instanceTag }}</div>
          <div>宿主自己 import 的 atom === store 导出工厂：{{ factorySame ? '一致' : '不一致' }}</div>
        </div>
      </div>
      <div class="inst-box">
        <div class="inst-name">remote-a 组件</div>
        <RemoteACounter />
      </div>
      <div class="inst-box">
        <div class="inst-name">remote-b 组件（声明 0.6.0）</div>
        <RemoteBCounter />
      </div>
    </div>
    <p class="ok" v-if="storeNs">
      store 模块本页求值次数：{{ evalCount }}（恒为 1 = 单实例）；三处实例标识 Symbol 相同即同一模块实例；
      各处「atom 工厂一致」= 各端 import 的 nanostores 经 singleton 协商收敛到同一份。
    </p>
    <p class="err" v-if="loadError">加载 sh-remote-a/store 失败：{{ loadError }}</p>
  </DemoCard>
</template>

<script setup lang="ts">
/**
 * 卡片①：三方同实例演示。
 * - store 模块（sh-remote-a/store）在页面内只有一份（联邦 expose 单实例），
 *   宿主、remote-a、remote-b 三处都渲染它导出的同一个 atom；
 * - 宿主自己直接 import 的 nanostores（本地副本）与 store 模块导出的 atomFactory
 *   严格相等——证明 remote-a/remote-b 的 nanostores 导入被协商到了宿主实例。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { loadRemote, remoteComponent } from '@fulgurjs/federation/vue'
import { atom as hostAtom } from 'nanostores'
import DemoCard from './DemoCard.vue'
import { formatError } from '../demo/format'

const RemoteACounter = remoteComponent('sh-remote-a/CounterPanel')
const RemoteBCounter = remoteComponent('sh-remote-b/RemoteCounter')

const storeNs = ref<Record<string, any> | null>(null)
const loadError = ref('')
const count = ref(0)
const instanceTag = ref('')
const factorySame = ref(false)
const evalCount = ref(0)

let unsubscribe: (() => void) | undefined

onMounted(async () => {
  try {
    const ns = (await loadRemote('sh-remote-a/store')) as Record<string, any>
    storeNs.value = ns
    instanceTag.value = String(ns.NS_INSTANCE)
    factorySame.value = hostAtom === ns.atomFactory
    // nanostores 0.11 API：subscribe 立即回调一次并返回退订函数（旧版 .sub 已移除）
    unsubscribe = ns.counter.subscribe((value: number) => { count.value = value })
    count.value = ns.counter.get()
    evalCount.value = (globalThis as Record<string, unknown>).__NS_EVAL_COUNT__ as number
  } catch (err) {
    loadError.value = formatError(err)
  }
})

onUnmounted(() => unsubscribe?.())

function bump(delta: number): void {
  storeNs.value?.bumpCounter(delta)
}

function reset(): void {
  storeNs.value?.resetCounter()
}
</script>
