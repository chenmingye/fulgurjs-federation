<script setup lang="ts">
/**
 * 组件级暴露（对比项）：宿主用 remoteComponent 直渲染的单个远程组件。
 * 刻意不带路由/会话语义——统计只反映本模块自身的数据，无 AppContext 协议，
 * 与「应用级桥接」（完整子应用 + 受控会话）形成对照。
 */
import { computed, ref } from 'vue'
import { listTickets } from '../store/tickets'
import '../demo.css'

const props = defineProps<{ title?: string }>()

const stats = computed(() => {
  const all = listTickets()
  const by = (s: string): number => all.filter((t) => t.status === s).length
  return { total: all.length, open: by('open'), processing: by('processing'), done: by('done') }
})

const clicks = ref(0)
</script>

<template>
  <div class="sfc-summary">
    <p class="sfc-summary-title">{{ props.title || '工单概览（远程组件直渲染）' }}</p>
    <p class="sfc-summary-line">
      总数 {{ stats.total }} · 待处理 {{ stats.open }} · 进行中 {{ stats.processing }} · 已完成 {{ stats.done }}
    </p>
    <p>
      <button @click="clicks++">远程组件内交互：{{ clicks }}</button>
      <span class="sfc-summary-note">来源：sf-vue-remote/components/TicketSummary（无路由、无 AppContext）</span>
    </p>
  </div>
</template>
