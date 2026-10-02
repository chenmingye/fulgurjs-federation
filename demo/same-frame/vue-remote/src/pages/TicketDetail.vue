<script setup lang="ts">
/**
 * 工单详情：路由参数 :id 来自子应用 memory 路由（不落宿主 URL）。
 */
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { STATUS_LABELS, getTicket } from '../store/tickets'

const props = defineProps<{ id: string }>()
const router = useRouter()

const ticket = computed(() => getTicket(Number(props.id)))
</script>

<template>
  <div v-if="ticket" class="sfc-page">
    <h3>工单详情 #{{ ticket.id }}</h3>
    <p><b>标题：</b>{{ ticket.title }}</p>
    <p><b>状态：</b>{{ STATUS_LABELS[ticket.status] }}</p>
    <p><b>负责人：</b>{{ ticket.assignee }}</p>
    <p><b>更新时间：</b>{{ ticket.updatedAt }}</p>
    <p>
      <button @click="router.push(`/tickets/${ticket.id}/edit`)">编辑</button>
      <RouterLink class="sfc-link" to="/tickets">返回列表</RouterLink>
    </p>
  </div>
  <div v-else class="sfc-page">
    <h3>工单不存在</h3>
    <p>路由参数 id={{ props.id }} 没有对应的本地工单数据。</p>
    <RouterLink class="sfc-link" to="/tickets">返回列表</RouterLink>
  </div>
</template>
