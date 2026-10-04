<script setup lang="ts">
/**
 * 工单列表：本地内存数据 + 状态筛选 + 关键字过滤 + 客户端分页。
 * 路由由子应用自持（memory，不落宿主 URL）；编辑保存后回到本页数据即更新。
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { STATUS_LABELS, listTickets } from '../store/tickets'

const keyword = ref('')
const statusFilter = ref<string>('all')
const page = ref(1)
const pageSize = 4

const filtered = computed(() => {
  const kw = keyword.value.trim()
  return listTickets().filter((t) => {
    const hitStatus = statusFilter.value === 'all' || t.status === statusFilter.value
    const hitKeyword = kw === '' || t.title.includes(kw)
    return hitStatus && hitKeyword
  })
})
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

function handleFilterChange(): void {
  page.value = 1
}

function handlePrevPage(): void {
  if (page.value > 1) page.value -= 1
}

function handleNextPage(): void {
  if (page.value < totalPages.value) page.value += 1
}
</script>

<template>
  <div class="sfc-page">
    <h3>工单列表</h3>
    <div class="sfc-toolbar">
      <input v-model="keyword" placeholder="按标题搜索" @input="handleFilterChange" />
      <select v-model="statusFilter" @change="handleFilterChange">
        <option value="all">全部状态</option>
        <option v-for="(label, key) in STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
      <span>共 {{ filtered.length }} 条</span>
    </div>
    <table class="sfc-table">
      <thead>
        <tr><th>ID</th><th>标题</th><th>状态</th><th>负责人</th><th>更新时间</th></tr>
      </thead>
      <tbody>
        <tr v-for="t in paged" :key="t.id">
          <td>{{ t.id }}</td>
          <td><RouterLink :to="`/tickets/${t.id}`">{{ t.title }}</RouterLink></td>
          <td>{{ STATUS_LABELS[t.status] }}</td>
          <td>{{ t.assignee }}</td>
          <td>{{ t.updatedAt }}</td>
        </tr>
        <tr v-if="paged.length === 0"><td colspan="5">无匹配工单</td></tr>
      </tbody>
    </table>
    <div class="sfc-pager">
      <button :disabled="page <= 1" @click="handlePrevPage">上一页</button>
      <span>第 {{ page }} / {{ totalPages }} 页</span>
      <button :disabled="page >= totalPages" @click="handleNextPage">下一页</button>
    </div>
  </div>
</template>
