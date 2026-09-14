<template>
  <div style="padding: 12px">
    <p data-testid="remote-a-standalone">REMOTE-A STANDALONE OK (vue {{ vueVersion }})</p>
    <ExposeButton label="standalone" />
    <p data-testid="remote-a-count">{{ counter.n }}</p>
    <button data-testid="remote-a-inc" @click="counter.inc()">inc</button>
  </div>
</template>

<script setup lang="ts">
import { version as vueVersion } from 'vue'
import { createPinia, storeToRefs } from 'pinia'
import ExposeButton from './exposes/Button.vue'
import { useCounterStore } from './exposes/counter'

const pinia = createPinia()
// 独立运行时激活（真实子应用挂载由宿主完成，这里保证 standalone 可用）
;(globalThis as any).__VUE_DEVTOOLS_GLOBAL_HOOK__ ??= null
const counter = useCounterStore(pinia)
const { n } = storeToRefs(counter)
void n
</script>
