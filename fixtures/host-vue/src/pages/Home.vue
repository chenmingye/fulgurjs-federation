<template>
  <div data-testid="page-home">
    <button data-testid="load-btn" @click="load">load remote-a/Button</button>
    <div ref="slot" />
  </div>
</template>

<script setup lang="ts">
import { ref, createVNode, render } from 'vue'

const slot = ref<HTMLElement>()
const loaded = ref(false)

async function load() {
  // webpack 同款用法：动态 import 远程模块（default 为组件）
  const mod = await import('remote-a/Button')
  const Btn = mod.default
  if (slot.value && !loaded.value) {
    render(createVNode(Btn, { label: 'FROM HOST' }), slot.value)
    loaded.value = true
  }
}
defineExpose({ loaded })
</script>
