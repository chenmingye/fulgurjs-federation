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
  // 确定性顺序：先取 remote-a 的模块——其容器 init 把 vue@3.5 注册进共享域且 slot-a
  // 首个协商即命中 3.5（singleton「已加载优先」：若 remote-b 的 3.4.38 先被加载，
  // slot-a 会被锁死在 3.4.38，B-2/B-8 的双版本断言变成容器 init 竞速的随机结果）
  const modA = await import('remote-a/VueCheck')
  const [modB, modCard] = await Promise.all([
    import('remote-b/VueCheck'),
    import('remote-a/StyledCard'),
  ])
  if (slotA.value) render(createVNode(modA.default, { state }), slotA.value)
  if (slotB.value) render(createVNode(modB.default, { state }), slotB.value)
  if (slotCard.value) render(createVNode(modCard.default, { title: 'CROSS CARD' }), slotCard.value)
})
</script>
