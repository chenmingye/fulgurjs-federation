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
  </main>
</template>

<script setup lang="ts">
// WP7：单一 API 门面（推荐入口）+ 旧入口同文件共存（c8c0ac1 回归类：门面/运行时显式
// 导入与远程动态导入混用，防重复改写守卫不得漏掉远程导入；两入口必须收敛同一单例）
import { loadRemote, getRuntime as grApi, parseSpec } from '@fulgurjs/federation/runtime'
import { getRuntime as grLegacy } from 'virtual:fulgurjs-runtime'

// ref/computed/shallowRef/isRef 均不显式导入：auto-import 注入（宿主侧插件链回归）
const count = ref(0)
const remoteComp = shallowRef<any>(null)
const identity = ref('pending')
const entryIdentity = ref('pending')
const refKind = isRef(count) ? 'ref-ok' : 'ref-bad'
;(globalThis as any).__probe_host_vue = { ref, computed }
const specRemote = parseSpec('remote-auto/Counter').remote

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
</script>
