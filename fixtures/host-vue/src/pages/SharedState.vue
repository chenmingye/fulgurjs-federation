<template>
  <div data-testid="page-shared-state">
    <p data-testid="host-count">host sees: {{ n }}</p>
    <p data-testid="pinia-note">pinia singleton proof</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { createPinia } from 'pinia'

const n = ref('...')

onMounted(async () => {
  // 远程暴露的 store 定义 + 宿主 pinia 实例（若 pinia singleton 断裂，行为将不一致）
  const mod = await import('remote-a/counter')
  const pinia = createPinia()
  const store = mod.useCounterStore(pinia)
  store.n = 7
  store.inc()
  n.value = String(store.n)
})
void computed
</script>
