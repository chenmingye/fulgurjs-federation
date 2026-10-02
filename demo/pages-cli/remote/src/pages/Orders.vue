<template>
  <section class="pc-page">
    <h2>订单列表 <small>pc-remote/pages/orders · 普通远程页面（未保活）</small></h2>

    <div v-if="contextError" class="pc-error">
      <p><strong>requireAppContext('user', 'getToken', 'sessionKey') 抛错——错误码 {{ contextError.code }}</strong></p>
      <pre>{{ contextError.message }}</pre>
      <p>触发条件：宿主点击「清空上下文」后重新进入本页——时序契约 bridge → setup/onSession → 页面模块被违反时，插件显式报错而不是静默。</p>
    </div>
    <dl v-else class="pc-kv">
      <dt>user.name（快照）</dt>
      <dd>{{ context.userName }}</dd>
      <dt>sessionKey（登录代次）</dt>
      <dd><code>{{ context.sessionKey }}</code></dd>
      <dt>getToken()（拉取式）</dt>
      <dd><code>{{ context.tokenPreview }}</code>（演示假 token，非真实凭证）</dd>
    </dl>

    <table class="pc-table">
      <thead>
        <tr><th>订单号</th><th>金额</th><th>状态</th></tr>
      </thead>
      <tbody>
        <tr v-for="order in orders" :key="order.id">
          <td>{{ order.id }}</td>
          <td>{{ order.amount }}</td>
          <td>{{ order.status }}</td>
        </tr>
      </tbody>
    </table>

    <p class="pc-hint">
      本页在 onMounted 里用 requireAppContext 显式校验读取宿主桥提供的 AppContext（CC-001 缺键三段式）。
      页面未保活：切走再回来会重新挂载并重新校验——「清空上下文」后的缺键行为就在这一步复现。
    </p>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { requireAppContext } from '@fulgurjs/federation/runtime'
import { pushRemoteTrace } from '../fulgurjs/trace'

interface DisplayContext {
  userName?: string
  sessionKey?: string
  tokenPreview?: string
}

const context = ref<DisplayContext>({})
const contextError = ref<{ code: string; message: string } | null>(null)

const orders = [
  { id: 'SO-2026-0001', amount: '¥1,280.00', status: '已发货' },
  { id: 'SO-2026-0002', amount: '¥368.50', status: '待付款' },
  { id: 'SO-2026-0003', amount: '¥9,999.00', status: '已完成' },
]

onMounted(() => {
  pushRemoteTrace('远程页面 mounted：pc-remote/pages/orders（loading → ready）')
  try {
    const ctx = requireAppContext('user', 'getToken', 'sessionKey')
    context.value = {
      userName: String(ctx.user?.name ?? ''),
      sessionKey: ctx.sessionKey,
      tokenPreview: `${(ctx.getToken?.() ?? '').slice(0, 12)}…`,
    }
  } catch (e) {
    const err = e as Error & { code?: string }
    contextError.value = { code: err.code ?? 'UNKNOWN', message: err.message }
  }
})
</script>
