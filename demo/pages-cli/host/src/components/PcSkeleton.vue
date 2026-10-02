<template>
  <div class="pc-skeleton" role="status" aria-label="页面加载中">
    <span v-for="n in 4" :key="n" class="pc-skeleton__bar" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { pushTrace } from '../fulgurjs/host/trace'

// createHostPages({ loadingComponent }) 的加载期占位（README §9.1.2 骨架屏的项目侧落位）：
// delay 200ms 内加载完成不显示（防闪烁）；首次冷加载（依赖预构建窗口）通常超过 200ms，
// 「加载时序」面板可看到 骨架屏显示 → 远程页面 mounted 的真实时序。
onMounted(() => {
  pushTrace({ source: 'host', label: '骨架屏显示（异步组件加载超过 delay 200ms）' })
})
</script>

<style scoped>
.pc-skeleton {
  display: grid;
  gap: 12px;
  padding: 8px 0;
}
.pc-skeleton__bar {
  display: block;
  height: 16px;
  border-radius: 4px;
  background: linear-gradient(90deg, #eef2f7 25%, #dde6ef 37%, #eef2f7 63%);
  background-size: 400% 100%;
  animation: pc-skeleton-shine 1.2s ease infinite;
}
@keyframes pc-skeleton-shine {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
