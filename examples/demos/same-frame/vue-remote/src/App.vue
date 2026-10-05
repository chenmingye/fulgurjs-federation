<script setup lang="ts">
/**
 * 子应用根组件：身份栏 + 宿主 appProps 提示 + 内部 RouterView。
 * 独立运行（main.ts，web history）与桥接态（bridge.ts，memory history）共用本组件。
 * onReady/onGone 只在桥接态由宿主传入——供宿主推进真实的挂载/卸载计数。
 */
import { onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import ChildIdentityBar from './components/ChildIdentityBar.vue'

const props = defineProps<{
  label?: string
  onReady?: () => void
  onGone?: () => void
}>()

onMounted(() => {
  props.onReady?.()
})

onUnmounted(() => {
  props.onGone?.()
})
</script>

<template>
  <div class="sfc-child-app">
    <ChildIdentityBar />
    <p v-if="label" class="sfc-child-label">{{ label }}</p>
    <nav class="sfc-child-nav">
      <RouterLink to="/tickets">工单列表</RouterLink>
      <RouterLink to="/remote-form">远程表单（宿主提供）</RouterLink>
    </nav>
    <RouterView />
  </div>
</template>

<style scoped>
.sfc-child-nav {
  display: flex;
  gap: 14px;
  margin: 4px 0 10px;
}
</style>
