<template>
  <div data-testid="page-multi">
    <div ref="slotA" data-testid="slot-a" />
    <div ref="slotB" data-testid="slot-b" />
    <div ref="slotCard" data-testid="slot-card" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, createVNode, render } from 'vue'

const slotA = ref<HTMLElement>()
const slotB = ref<HTMLElement>()
const slotCard = ref<HTMLElement>()

// host 自己的 vue 创建的响应式对象，传给两个 remote 检查单例
const state = reactive({ a: 1 })

onMounted(async () => {
  const [modA, modB, modCard] = await Promise.all([
    import('remote-a/VueCheck'),
    import('remote-b/VueCheck'),
    import('remote-a/StyledCard'),
  ])
  if (slotA.value) render(createVNode(modA.default, { state }), slotA.value)
  if (slotB.value) render(createVNode(modB.default, { state }), slotB.value)
  if (slotCard.value) render(createVNode(modCard.default, { title: 'CROSS CARD' }), slotCard.value)
})
</script>
