<script setup lang="ts">
/**
 * host-bridge-vue：Vue 宿主嵌入 React 桥接子应用（remote-react/bridge）。
 * 交互面覆盖：props 快照与函数引用、受控会话（A→登出→B）、多实例、
 * 宿主重渲染风暴、故障注入 spec 选择（BN01/BN02）、卸载循环（BR04）。
 */
import { onMounted, ref } from 'vue'
import { clearAppContext } from '@fulgurjs/federation/runtime'
import { createVueBridgeApp } from '@fulgurjs/federation/bridge/vue'
import { getLatestHostContext, switchSession, logoutSession } from './host-context'

const params = new URLSearchParams(window.location.search)
const specName = params.get('spec') ?? 'bridge'
const multi = params.get('multi') === '1'

// BN07：注入 onSession 真实延迟（远程 setup 读同一页面全局）
if (params.get('onsession-delay') === '1') {
  ;(globalThis as any).__FG_ONSESSION_DELAY_MS__ = 400
}

// spec 允许切换正常/故障注入 expose（e2e 经 URL 驱动）
const RemoteReactApp = createVueBridgeApp(`remote-react/${specName === 'broken' ? 'bridge-broken' : specName === 'mount-fail' ? 'bridge-mount-fail' : 'bridge'}`, {
  retries: 0,
  getContext: () => getLatestHostContext(),
})

const sessionKey = ref<string | null>('sess-A')
const userName = ref('alice')
const label = ref('from-host-v1')
const renderTick = ref(0)
const eventLog = ref<string[]>([])
const bridgeKey = ref(0)
const mountedCount = ref(0)

function log(msg: string): void {
  eventLog.value = [...eventLog.value, msg].slice(-20)
}

function handleReady(): void {
  mountedCount.value++
  log(`onReady#${mountedCount.value}@${sessionKey.value ?? 'null'}`)
}

async function switchToB(): Promise<void> {
  // 推荐顺序（§4.3）：受控 prop 置 null → 等卸载 → clearAppContext → 准备 B 快照 → 更新 prop
  sessionKey.value = null
  await nextFrame()
  clearAppContext()
  switchSession('sess-B', { id: 2, name: 'bob' })
  userName.value = 'bob'
  sessionKey.value = 'sess-B'
}

async function logout(): Promise<void> {
  sessionKey.value = null
  await nextFrame()
  clearAppContext()
  logoutSession()
  userName.value = ''
}

async function reloginA(): Promise<void> {
  sessionKey.value = null
  await nextFrame()
  clearAppContext()
  switchSession('sess-A', { id: 1, name: 'alice' })
  userName.value = 'alice'
  sessionKey.value = 'sess-A'
}

async function nextFrame(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  await new Promise((r) => setTimeout(r, 50))
}

function stormRerender(): void {
  for (let i = 0; i < 20; i++) renderTick.value++
}

function remountBy(): void {
  bridgeKey.value++
}

function toggleLabel(): void {
  label.value = label.value === 'from-host-v1' ? 'from-host-v2' : 'from-host-v1'
}

onMounted(() => {
  log(`page-loaded:${sessionKey.value}`)
})
</script>

<template>
  <div style="font-family: sans-serif; padding: 12px">
    <h1 data-testid="host-title">host-bridge-vue（Vue 宿主 × React 子应用）</h1>
    <p data-testid="host-session">session:{{ sessionKey ?? 'null' }} user:{{ userName || 'none' }} tick:{{ renderTick }}</p>
    <p data-testid="host-event-log">{{ eventLog.join('|') }}</p>
    <p data-testid="host-ready-count">ready-count:{{ mountedCount }}</p>

    <div style="margin: 8px 0">
      <button data-testid="act-switch-b" @click="switchToB">换账号 B</button>
      <button data-testid="act-logout" @click="logout">登出</button>
      <button data-testid="act-relogin-a" @click="reloginA">重登 A</button>
      <button data-testid="act-storm" @click="stormRerender">重渲染风暴</button>
      <button data-testid="act-remount" @click="remountBy">key 重挂</button>
      <button data-testid="act-toggle-label" @click="toggleLabel">换 props 引用</button>
    </div>

    <div style="border: 1px solid #ccc; padding: 8px" data-testid="bridge-area">
      <RemoteReactApp
        v-if="multi === false"
        :key="bridgeKey"
        :session-key="sessionKey"
        :app-props="{ label, onReady: handleReady, nested: { origin: 'host-bridge-vue' } }"
      />
      <template v-else>
        <RemoteReactApp :session-key="sessionKey" :app-props="{ label: 'inst-1', onReady: handleReady }" />
        <hr />
        <RemoteReactApp :session-key="sessionKey" :app-props="{ label: 'inst-2', onReady: handleReady }" />
      </template>
    </div>
  </div>
</template>
