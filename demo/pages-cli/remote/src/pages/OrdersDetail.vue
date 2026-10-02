<template>
  <section class="pc-page">
    <h2>订单详情 <small>pc-remote/pages/orders-detail · 参数页（宿主路由 /pc/orders/:id，显式 spec）</small></h2>

    <dl class="pc-kv">
      <dt>路由参数 id（宿主 props 透传）</dt>
      <dd><code>{{ id ?? '（未传）' }}</code></dd>
      <dt>query.tab（宿主 props 透传）</dt>
      <dd><code>{{ tab ?? '（未传）' }}</code></dd>
      <dt>当前 sessionKey（getAppContext 宽松读取）</dt>
      <dd><code>{{ sessionKey ?? '（空——宿主已清空上下文；requireAppContext 会显式报 CC-001，而宽松读取不抛错）' }}</code></dd>
    </dl>

    <p class="pc-hint">
      带参路由在页面表里显式声明 spec: 'pages/orders-detail'——缺省剥参推导会与列表页收敛出同一个
      spec（R1 校验拦截的真实事故场景）。宿主路由的 params + query 经 createHostPages 的 attrs
      透传到达本页。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { getAppContext } from '@fulgurjs/federation/runtime'
import { pushRemoteTrace } from '../fulgurjs/trace'

// props 由宿主路由的 props 函数透传：{ ...route.params, ...route.query }
const props = defineProps<{
  id?: string
  tab?: string
}>()

const sessionKey = computed(() => getAppContext().sessionKey)

onMounted(() => {
  pushRemoteTrace(`远程页面 mounted：pc-remote/pages/orders-detail（id=${props.id ?? '—'}）`)
})
</script>
