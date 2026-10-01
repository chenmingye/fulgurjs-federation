<script setup lang="ts">
/**
 * RoutedApproval：URL 同步路由页（Vue 宿主 × React 子应用，?routed=1 驱动）。
 * - routing prop：createVueBridgeNavigation(router)（模块级单例端口，引用稳定——
 *   routing 引用重建但键相同 → 宿主不重挂、不重复订阅）；
 * - basePath=/approval；挂载 pending（?routed-delay=1 时 400ms）内换路径由
 *   「mount 前读取最新位置」兜底（U12）；
 * - ?spec=bridge 强制用未声明协议的 memory 契约 → MFU-031 占位（U17）。
 */
import { computed, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { clearAppContext } from '@fulgurjs/federation/runtime'
import { createVueBridgeApp } from '@fulgurjs/federation/bridge/vue'
import { createVueBridgeNavigation, type BridgeHostRouting } from '@fulgurjs/federation/bridge/router/vue'
import { getLatestHostContext, switchSession } from './host-context'

const route = useRoute()
const router = (globalThis as any).__HOST_ROUTER__
const params = new URLSearchParams(window.location.search)
const routedOn = params.get('routed') === '1'
const specName = params.get('spec') === 'bridge' ? 'bridge' : 'bridge-routed'

// 端口单例（模块级一次创建）
const navigation = createVueBridgeNavigation(router)
const routing: BridgeHostRouting = { basePath: '/approval', navigation }

const RemoteReactRouted = createVueBridgeApp(`remote-react/${specName}`, {
  retries: 0,
  getContext: () => getLatestHostContext(),
})

// 会话：路由页独立 sess-A/sess-B 切换（U14 用）
const sessionKey = ref<string | null>('sess-A')
const switchToB = (): void => {
  sessionKey.value = null
  setTimeout(() => {
    clearAppContext()
    switchSession('sess-B', { id: 2, name: 'bob' })
    sessionKey.value = 'sess-B'
  }, 60)
}

// U12：挂载 pending 窗口（?routed-delay=1 → 400ms）
const delayMs = params.get('routed-delay') === '1' ? 400 : 0
const pending = ref(delayMs > 0)
if (delayMs > 0) setTimeout(() => (pending.value = false), delayMs)
onUnmounted(() => {
  ;(globalThis as any).__ROUTED_UNMOUNTED_AT__ = Date.now()
})

const sessionLabel = computed(() => sessionKey.value ?? 'null')
</script>

<template>
  <div style="font-family: sans-serif; padding: 12px">
    <nav style="padding: 8px; background: #eee; margin-bottom: 8px">
      <RouterLink data-testid="routed-menu-home" to="/" style="margin-right: 12px">宿主首页</RouterLink>
      <RouterLink data-testid="routed-menu-list" to="/approval/list" style="margin-right: 12px">审批列表</RouterLink>
      <RouterLink data-testid="routed-menu-detail" to="/approval/detail/789?tab=main" style="margin-right: 12px">审批详情789</RouterLink>
      <RouterLink data-testid="routed-menu-secret" to="/approval/secret" style="margin-right: 12px">机密页(守卫拒绝)</RouterLink>
      <button data-testid="routed-act-switch-b" @click="switchToB">换账号 B</button>
      <span data-testid="routed-session">session:{{ sessionLabel }}</span>
    </nav>
    <p data-testid="routed-host-url">{{ route.fullPath }}</p>
    <div style="border: 1px solid #42b883; padding: 8px" data-testid="routed-bridge-area">
      <template v-if="routedOn">
        <RemoteReactRouted v-if="!pending" :session-key="sessionKey" :routing="routing" :app-props="{ origin: 'routed' }" />
        <p v-else data-testid="routed-pending">pending…</p>
      </template>
      <p v-else data-testid="routed-off">routed 未启用（?routed=1）——memory 模式</p>
    </div>
  </div>
</template>
