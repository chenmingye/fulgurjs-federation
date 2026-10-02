<template>
  <div class="error-view">
    <p class="ev-head">
      <span class="ev-label">{{ label ?? '真实错误对象' }}</span>
      <span class="ev-code">{{ info.code }}</span>
      <span class="ev-name">{{ info.name }}</span>
    </p>
    <pre class="ev-message">{{ info.message }}</pre>
    <pre v-if="info.details" class="ev-details">details: {{ info.details }}</pre>
  </div>
</template>

<script setup lang="ts">
/**
 * 错误对象展示组件：渲染 catch 到的真实错误（错误码 / name / message / details JSON）。
 * 各故障卡共用；只负责展示，不参与错误生成。
 */
import { computed } from 'vue'
import { describeError } from '../shared'

const props = defineProps<{
  error: unknown
  label?: string
}>()

const info = computed(() => describeError(props.error))
</script>

<style scoped>
.error-view {
  border: 1px solid #ffa39e;
  background: #fff1f0;
  border-radius: 6px;
  padding: 8px 10px;
}
.ev-head {
  margin: 0 0 6px;
  display: flex;
  gap: 8px;
  align-items: center;
  font-weight: 600;
}
.ev-code {
  background: #cf1322;
  color: #fff;
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 12px;
  font-weight: 600;
}
.ev-name {
  color: #888;
  font-size: 12px;
  font-weight: 400;
}
.ev-message,
.ev-details {
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  line-height: 1.6;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.ev-details {
  color: #874d00;
}
</style>
