<script setup lang="ts">
import { ref } from 'vue'
import { createVueBridgeApp } from '@fulgurjs/federation/bridge/vue'
const Child = createVueBridgeApp('rv-remote18-strict/bridge', {
  retries: 0, getContext: () => ({ sessionKey: 'vue-react18', user: { name: '演示用户' } }),
})
const count = ref(0)
const ready = (info: Record<string, unknown>) => { (window as any).__VUE_R18 = info }
</script>
<template>
  <main style="font-family: sans-serif; padding: 20px">
    <h1>Vue 宿主 × React 18（物理依赖与共享声明均对齐）</h1>
    <button data-testid="vue-counter" @click="count++">Vue 计数：{{ count }}</button>
    <Child session-key="vue-react18" :app-props="{ onReady: ready }" />
  </main>
</template>
