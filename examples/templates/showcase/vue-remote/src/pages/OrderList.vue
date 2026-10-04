<script setup lang="ts">
/**
 * examples/templates/showcase/vue-remote/src/pages/OrderList.vue — 工单列表页（筛选 + 分页）。
 * 筛选关键词与页码写入子应用路由 query（q=xxx&page=n，中文可输入），
 * 经桥接通道同步到宿主 URL；跳详情再返回时组件重建、状态从 query 还原。
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { reportNav } from '../child-bus'

interface OrderItem {
  id: number
  title: string
}

const ORDERS: OrderItem[] = [
  { id: 1, title: '登录异常排查' },
  { id: 2, title: '网络抖动投诉' },
  { id: 3, title: '权限配置变更' },
  { id: 4, title: '数据导出失败' },
  { id: 5, title: '消息推送延迟' },
  { id: 6, title: '账单核对差异' },
  { id: 7, title: '接口超时告警' },
  { id: 8, title: '存储扩容申请' },
]
const PAGE_SIZE = 3

const route = useRoute()
const router = useRouter()

const queryText = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const page = computed(() => {
  const raw = typeof route.query.page === 'string' ? Number.parseInt(route.query.page, 10) : 1
  return Number.isFinite(raw) && raw > 0 ? raw : 1
})
// 输入框初值跟随当前 q：详情返回后组件重建，仍能还原筛选
const qInput = ref(queryText.value)

const filtered = computed(() =>
  queryText.value === '' ? ORDERS : ORDERS.filter((item) => item.title.includes(queryText.value)),
)
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const pageItems = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

const buildTarget = (qValue: string, pageValue: number): string =>
  `/orders?page=${pageValue}${qValue === '' ? '' : `&q=${encodeURIComponent(qValue)}`}`

const handleSearch = (): void => {
  const target = buildTarget(qInput.value.trim(), 1)
  reportNav('子应用 push/replace', 'push', target)
  void router.push(target)
}

const handlePageStep = (delta: number): void => {
  const next = Math.min(totalPages.value, Math.max(1, page.value + delta))
  if (next === page.value) return
  const target = buildTarget(queryText.value, next)
  reportNav('子应用 push/replace', 'push', target)
  void router.push(target)
}

const handleOpenDetail = (item: OrderItem): void => {
  reportNav('子应用 Link', 'push', `/orders/${item.id}?src=row`)
  void router.push(`/orders/${item.id}?src=row`)
}

const handleGoSettings = (): void => {
  reportNav('子应用 Link', 'push', '/settings')
  void router.push('/settings')
}

const handleGoLocked = (): void => {
  reportNav('子应用 Link', 'push', '/locked')
  void router.push('/locked')
}
</script>

<template>
  <section class="demo-page">
    <h3 class="demo-page-title">工单列表（子应用路由 /orders）</h3>
    <p class="demo-muted">
      当前筛选：q={{ queryText === '' ? '（空）' : queryText }}，页码：{{ page }}/{{ totalPages }}（来自子应用路由 query）
    </p>
    <div class="demo-row">
      <input v-model="qInput" placeholder="输入筛选关键词（支持中文，如：网络）" aria-label="筛选关键词" />
      <button @click="handleSearch">筛选（push ?q=&amp;page=1）</button>
    </div>
    <ul class="demo-order-list">
      <li v-for="item in pageItems" :key="item.id">
        <span>#{{ item.id }} {{ item.title }}</span>
        <button @click="handleOpenDetail(item)">查看详情</button>
      </li>
      <li v-if="pageItems.length === 0" class="demo-muted">无匹配工单</li>
    </ul>
    <div class="demo-row">
      <button :disabled="page <= 1" @click="handlePageStep(-1)">上一页</button>
      <span>第 {{ page }} / {{ totalPages }} 页</span>
      <button :disabled="page >= totalPages" @click="handlePageStep(1)">下一页</button>
    </div>
    <div class="demo-row">
      <button @click="handleGoSettings">前往设置页</button>
      <button @click="handleGoLocked">锁定页（触发宿主守卫）</button>
    </div>
  </section>
</template>

<style scoped>
.demo-page { padding: 8px 0; }
.demo-page-title { margin: 4px 0; }
.demo-muted { color: #666; font-size: 13px; margin: 4px 0; }
.demo-row { display: flex; gap: 8px; align-items: center; margin: 8px 0; flex-wrap: wrap; }
.demo-row button { cursor: pointer; }
.demo-order-list { list-style: none; padding: 0; margin: 8px 0; }
.demo-order-list li { display: flex; gap: 8px; align-items: center; padding: 4px 0; }
.demo-order-list button { cursor: pointer; }
</style>
