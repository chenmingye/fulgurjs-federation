<script setup lang="ts">
/**
 * examples/templates/showcase/vue-host/src/GuardBanner.vue — 宿主守卫确认横幅（异步 beforeEach 等待用户选择）。
 * 「取消」= Vue Router 导航失败 → 通道收到 cancelled，URL/子应用位置保持不变。
 */
import { guardPending, resolveGuard } from './guard'
</script>

<template>
  <div v-if="guardPending" class="demo-guard" role="alertdialog" aria-label="宿主守卫确认">
    <span>宿主守卫：是否允许前往 <code>{{ guardPending.to }}</code>？</span>
    <button @click="resolveGuard(true)">继续</button>
    <button @click="resolveGuard(false)">取消</button>
  </div>
</template>

<style scoped>
.demo-guard {
  display: flex; gap: 12px; align-items: center;
  background: #fff7e6; border: 1px solid #f0c36d;
  padding: 8px 12px; margin-bottom: 12px; border-radius: 4px;
}
.demo-guard button { cursor: pointer; }
</style>
