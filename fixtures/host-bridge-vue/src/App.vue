<script setup lang="ts">
/**
 * host-bridge-vue：Vue 宿主嵌入 React 桥接子应用（remote-react/bridge）。
 * 交互面覆盖：props 快照与函数引用、受控会话（A→登出→B）、多实例、
 * 宿主重渲染风暴、故障注入 spec 选择（BN01/BN02）、卸载循环（BR04）。
 */
import { onMounted, ref } from 'vue'
import { clearAppContext } from '@fulgurjs/federation/runtime'
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
import { getLatestHostContext, switchSession, logoutSession } from './host-context'

const params = new URLSearchParams(window.location.search)
const specName = params.get('spec') ?? 'bridge'
const multi = params.get('multi') === '1'
// F6 专用：同文档两个独立桥接消费方（同一 runtime/注册表、同会话并存——
// 页面级单会话合同下"异会话并存"必须被 MFU-017 拒绝，属预期行为而非污染）
const dual = params.get('dual') === '1'

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

// ── F6 双消费方状态（dual=1）────────────────────────────────────────────
// 每侧独立：sessionKey / 重挂 key / ready 计数 / 事件日志；页面级会话快照经
// host-context 全局管理（与真实多实例宿主的受控会话模型一致）。
interface DualSide {
  sessionKey: string | null
  key: number
  ready: number
  log: string[]
  user: string
}
function makeDualSide(user: string): DualSide {
  return { sessionKey: 'sess-A', key: 0, ready: 0, log: [], user }
}
const dualSides = ref<DualSide[]>([makeDualSide('alice'), makeDualSide('alice')])

function dualLog(side: DualSide, msg: string): void {
  side.log = [...side.log, msg].slice(-12)
}

function dualReady(side: DualSide): void {
  side.ready++
  dualLog(side, `onReady#${side.ready}@${side.sessionKey ?? 'null'}`)
}

async function dualFrame(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  await new Promise((r) => setTimeout(r, 50))
}

/** 双侧只能同会话并存：换会话按钮先把页面级快照切到目标会话，再驱动该侧代次 */
async function dualSwitch(side: DualSide, key: 'sess-A' | 'sess-B' | 'sess-C'): Promise<void> {
  side.sessionKey = null
  await dualFrame()
  const user = key === 'sess-A' ? 'alice' : key === 'sess-B' ? 'bob' : 'carol'
  switchSession(key, { id: key === 'sess-A' ? 1 : key === 'sess-B' ? 2 : 3, name: user })
  side.user = user
  side.sessionKey = key
  dualLog(side, `switch:${key}`)
}

/** 单侧离开：受控键置 null（该侧容器卸载并释放会话登记，另一侧不动） */
async function dualLeave(side: DualSide): Promise<void> {
  side.sessionKey = null
  await dualFrame()
  dualLog(side, 'leave')
}

/** 单侧重进：跟随页面级当前会话快照（与存活侧同会话，满足并存合同） */
async function dualReenter(side: DualSide): Promise<void> {
  const key = getLatestHostContext().sessionKey
  side.sessionKey = key
  dualLog(side, `reenter:${key}`)
}

function dualRemount(side: DualSide): void {
  side.key++
}

onMounted(() => {
  if (!dual) log(`page-loaded:${sessionKey.value}`)
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

    <div v-if="dual" data-testid="dual-root">
      <div v-for="(side, i) in dualSides" :key="i" style="border: 1px solid #888; margin: 10px 0; padding: 8px" :data-testid="`dual-${i + 1}-area`">
        <p :data-testid="`dual-${i + 1}-session`">session:{{ side.sessionKey ?? 'null' }} user:{{ side.user }}</p>
        <p :data-testid="`dual-${i + 1}-ready`">ready-count:{{ side.ready }}</p>
        <p :data-testid="`dual-${i + 1}-log`">{{ side.log.join('|') }}</p>
        <div style="margin: 4px 0">
          <button :data-testid="`dual-${i + 1}-leave`" @click="dualLeave(side)">离开</button>
          <button :data-testid="`dual-${i + 1}-switch-b`" @click="dualSwitch(side, 'sess-B')">换 B</button>
          <button :data-testid="`dual-${i + 1}-switch-c`" @click="dualSwitch(side, 'sess-C')">换 C</button>
          <button :data-testid="`dual-${i + 1}-reenter`" @click="dualReenter(side)">重进</button>
          <button :data-testid="`dual-${i + 1}-remount`" @click="dualRemount(side)">key 重挂</button>
        </div>
        <RemoteReactApp :key="side.key" :session-key="side.sessionKey" :app-props="{ label: `dual-${i + 1}`, onReady: () => dualReady(side) }" />
      </div>
    </div>

    <div v-else-if="multi === false" style="border: 1px solid #ccc; padding: 8px" data-testid="bridge-area">
      <RemoteReactApp
        :key="bridgeKey"
        :session-key="sessionKey"
        :app-props="{ label, onReady: handleReady, nested: { origin: 'host-bridge-vue' } }"
      />
    </div>
    <div v-else style="border: 1px solid #ccc; padding: 8px" data-testid="bridge-area">
      <RemoteReactApp :session-key="sessionKey" :app-props="{ label: 'inst-1', onReady: handleReady }" />
      <hr />
      <RemoteReactApp :session-key="sessionKey" :app-props="{ label: 'inst-2', onReady: handleReady }" />
    </div>
  </div>
</template>
