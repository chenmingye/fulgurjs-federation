<script setup lang="ts">
/**
 * 编辑表单：可编辑、取消/保存；保存更新本地内存数据后回详情（列表随之更新）。
 */
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { STATUS_LABELS, getTicket, updateTicket, type TicketStatus } from '../store/tickets'

const props = defineProps<{ id: string }>()
const router = useRouter()

const source = getTicket(Number(props.id))
const form = reactive({
  title: source?.title ?? '',
  status: String(source?.status ?? 'open'),
  assignee: source?.assignee ?? '',
})

function handleCancel(): void {
  router.push(`/tickets/${props.id}`)
}

function handleSave(): void {
  updateTicket(Number(props.id), {
    title: form.title,
    status: form.status as TicketStatus,
    assignee: form.assignee,
  })
  router.push(`/tickets/${props.id}`)
}
</script>

<template>
  <div v-if="source" class="sfc-page">
    <h3>编辑工单 #{{ props.id }}</h3>
    <label class="sfc-field">标题 <input v-model="form.title" /></label>
    <label class="sfc-field">状态
      <select v-model="form.status">
        <option v-for="(label, key) in STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
    </label>
    <label class="sfc-field">负责人 <input v-model="form.assignee" /></label>
    <p>
      <button class="sfc-btn-primary" @click="handleSave">保存</button>
      <button @click="handleCancel">取消</button>
    </p>
  </div>
  <div v-else class="sfc-page">
    <h3>工单不存在</h3>
    <p>无法编辑不存在的工单（id={{ props.id }}）。</p>
  </div>
</template>
