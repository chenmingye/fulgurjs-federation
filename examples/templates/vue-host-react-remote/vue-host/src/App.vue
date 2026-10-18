<script setup lang="ts">
/** Vue宿主嵌React完整应用：只绑定业务身份与上下文，不手写联邦登录代次。 */
import { computed, ref } from 'vue'
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
import { currentUser, sessionIdentity, getLatestHostContext, login, logout, refreshToken } from './fulgurjs/host/context'

const RemoteReactApp = createVueBridgeApp('bridge-react-remote/bridge', {
  retries: 1,
  session: sessionIdentity,
  getContext: getLatestHostContext,
})
const userName = computed(() => currentUser()?.name ?? '')
const label = ref('来自 Vue 宿主')
const readyCount = ref(0)
function handleReady(): void { readyCount.value++ }
// 这些函数只改业务状态；换代、清理旧上下文与卸载顺序由插件负责。
function switchUser(): void { login({ id: 2, name: 'Bob' }) }
function doLogout(): void { logout() }
</script>

<template>
  <div style="font-family: sans-serif; padding: 16px; max-width: 720px">
    <h1>Vue 宿主 × React 子应用（@fulgurjs/federation/vue）</h1>
    <p data-testid="demo-session">当前用户：{{ userName || '未登录' }}· onReady 次数：{{ readyCount }}</p>

    <p>
      <button data-testid="demo-switch" @click="switchUser">切换到 Bob（自动重挂）</button>
      <button data-testid="demo-refresh-token" @click="refreshToken">刷新 token（不重挂）</button>
      <button data-testid="demo-logout" @click="doLogout">登出（自动卸载）</button>
    </p>

    <!-- 外层元素控制桥接区域外观；appProps 是挂载时浅拷贝快照，换引用不重挂，重挂用 :key -->
    <section style="margin-top: 12px">
      <RemoteReactApp
        :app-props="{ label, onReady: handleReady }"
      />
    </section>
  </div>
</template>
