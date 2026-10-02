<template>
  <div class="pc-stat-card">
    <span class="pc-stat-card__value">{{ value }}</span>
    <span class="pc-stat-card__label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
// 联邦普通组件（对照页面适配器）：宿主经 remoteComponent('pc-remote/widgets/stat-card') 直渲染。
// props 全部可选并给默认值（BLD-003 核对项：expose 目标组件需要必填 props 时给默认值）。
withDefaults(
  defineProps<{
    label?: string
    value?: string | number
  }>(),
  { label: '指标', value: '—' },
)
</script>

<style scoped>
.pc-stat-card {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
  padding: 12px 16px;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  background: #fff;
}
.pc-stat-card__value {
  font-size: 22px;
  font-weight: 600;
  color: #1f3b57;
}
.pc-stat-card__label {
  font-size: 12px;
  color: #627d98;
}
</style>
