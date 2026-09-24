<template>
  <main style="font-family: sans-serif; padding: 16px">
    <h1>host-auto（auto-import × 联邦宿主）</h1>

    <p data-testid="host-count">host count: {{ count }} ({{ refKind }})</p>
    <button data-testid="host-inc" @click="count++">host +1（auto-imported ref）</button>

    <p>
      <button data-testid="load-remote-dynamic" @click="loadViaDynamicImport">
        load remote（动态 import 语法）
      </button>
      <button data-testid="load-remote-api" @click="loadViaApi">load remote（loadRemote API）</button>
    </p>

    <section data-testid="remote-slot">
      <component :is="remoteComp" v-if="remoteComp" />
    </section>

    <p data-testid="vue-identity">vue identity: {{ identity }} / {{ entryIdentity }} / spec:{{ specRemote }}</p>

    <hr />
    <h2>setup/onSession 生命周期探针（§3.3.1）</h2>
    <p>
      <button data-testid="session-a" @click="switchSession('s-A')">登录代次 A</button>
      <button data-testid="session-b" @click="switchSession('s-B')">登录代次 B</button>
      <button data-testid="logout" @click="doLogout">退出（clearAppContext）</button>
      <button data-testid="load-probe" @click="loadProbe">加载远程模块（触发生命周期）</button>
      <button data-testid="preload-probe" @click="preloadProbe">仅预载（无副作用断言）</button>
      <button data-testid="load-api" @click="loadApiModule">加载普通 TS 模块（expose ≠ 自动执行）</button>
    </p>
    <p data-testid="session-state">sessionKey: {{ sessionKey || '(未提供)' }}</p>
    <p data-testid="setup-calls">setup calls: {{ callsText }}</p>
    <p data-testid="api-calls">api calls: {{ apiText }} / value: {{ apiValue || '-' }}</p>
  </main>
</template>

<script setup lang="ts">
// WP7：单一 API 门面（推荐入口）+ 旧入口同文件共存（c8c0ac1 回归类：门面/运行时显式
// 导入与远程动态导入混用，防重复改写守卫不得漏掉远程导入；两入口必须收敛同一单例）
import {
  loadRemote, getRuntime as grApi, parseSpec,
  provideAppContext, clearAppContext, preloadRemote,
} from '@fulgurjs/federation/runtime'
import { getRuntime as grLegacy } from 'virtual:fulgurjs-runtime'

// ref/computed/shallowRef/isRef 均不显式导入：auto-import 注入（宿主侧插件链回归）
const count = ref(0)
const remoteComp = shallowRef<any>(null)
const identity = ref('pending')
const entryIdentity = ref('pending')
const refKind = isRef(count) ? 'ref-ok' : 'ref-bad'
;(globalThis as any).__probe_host_vue = { ref, computed }
const specRemote = parseSpec('remote-auto/Counter').remote

const sessionKey = ref<string>('')
const callsText = ref('')
const apiText = ref('0')
const apiValue = ref('')

function checkIdentity() {
  const hostVue = (globalThis as any).__probe_host_vue
  const remoteVue = (globalThis as any).__probe_remote_vue
  identity.value =
    hostVue && remoteVue
      ? hostVue.ref === remoteVue.ref
        ? 'same'
        : 'DIFFERENT'
      : 'missing-probe'
  // 新旧入口收敛同一运行时单例（WP7 契约）
  entryIdentity.value = grApi() === grLegacy() ? 'same-runtime' : 'DIFFERENT-runtime'
}

async function loadViaDynamicImport() {
  const mod = await import('remote-auto/Counter')
  remoteComp.value = (mod as any).default
  await waitForRemoteProbe()
  checkIdentity()
}

async function loadViaApi() {
  const mod = await loadRemote('remote-auto/Counter')
  remoteComp.value = (mod as any).default
  await waitForRemoteProbe()
  checkIdentity()
}

/** 远程组件的实例探针在 script setup（挂载）时写入——等它就绪再做同实例比对 */
async function waitForRemoteProbe() {
  for (let i = 0; i < 40 && !(globalThis as any).__probe_remote_vue; i++) {
    await new Promise((r) => setTimeout(r, 50))
  }
}

// ── setup/onSession 生命周期探针（§3.3.1 e2e 断言面）────────────────────────
function snapshotCalls() {
  callsText.value = JSON.stringify((globalThis as any).__SETUP_CALLS__ ?? [])
}

/** 宿主登录态切换：每次成功登录/重登生成新的非敏感 sessionKey（不是 token） */
function switchSession(key: string) {
  sessionKey.value = key
  provideAppContext({ user: { id: key }, sessionKey: key })
  snapshotCalls()
}

/** 退出：清 context + 作废会话状态（onSession 去重失效，下次登录必须重跑） */
function doLogout() {
  sessionKey.value = ''
  clearAppContext()
  snapshotCalls()
}

/** 加载远程模块：统一入口触发 setup（一次）→ onSession（当前代次一次）→ 返回模块 */
async function loadProbe() {
  await loadRemote('remote-auto/Counter')
  snapshotCalls()
}

/** 仅预载：preloadRemote 只下载资源，不得执行 setup/onSession（T7） */
async function preloadProbe() {
  await preloadRemote('remote-auto')
  snapshotCalls()
}

/** 普通 TS expose：loadRemote 取得导出但不执行；显式调用才执行（T2） */
async function loadApiModule() {
  const before = ((globalThis as any).__API_CALLS__ ?? []).length
  const mod = await loadRemote('remote-auto/api') as any
  const afterLoad = ((globalThis as any).__API_CALLS__ ?? []).length
  apiValue.value = mod.probeApiValue()
  const afterCall = ((globalThis as any).__API_CALLS__ ?? []).length
  apiText.value = `load后=${afterLoad}/load前=${before}/调用后=${afterCall}`
  snapshotCalls()
}
</script>
