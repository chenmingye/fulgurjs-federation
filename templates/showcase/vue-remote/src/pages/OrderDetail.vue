<script setup lang="ts">
/**
 * demo/bridge-router/vue-remote/src/pages/OrderDetail.vue — 工单详情页（路径参数 /orders/:id）。
 * 「返回列表」走 go(-1)（委托宿主浏览器历史）；「回列表」走 push（经通道写宿主 URL）。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { reportNav } from '../child-bus'

const route = useRoute()
const router = useRouter()

const id = computed(() => String(route.params.id ?? ''))
const queryEcho = computed(() => {
  const rest = route.fullPath.slice(route.path.length)
  return rest === '' ? '（无）' : rest
})

const handleBack = (): void => {
  reportNav('子应用 go', 'go', '-1')
  router.back()
}

const handleLinkBack = (): void => {
  reportNav('子应用 Link', 'push', '/orders')
  void router.push('/orders')
}
</script>

<template>
  <section class="demo-page">
    <h3 class="demo-page-title">工单详情（子应用路由 /orders/:id）</h3>
    <p>工单 ID：<code>{{ id }}</code>；query 回显：<code>{{ queryEcho }}</code></p>
    <div class="demo-row">
      <button @click="handleBack">返回列表（go(-1)）</button>
      <button @click="handleLinkBack">回列表（push /orders）</button>
    </div>
  </section>
</template>

<style scoped>
.demo-page { padding: 8px 0; }
.demo-page-title { margin: 4px 0; }
.demo-row { display: flex; gap: 8px; align-items: center; margin: 8px 0; flex-wrap: wrap; }
.demo-row button { cursor: pointer; }
</style>
