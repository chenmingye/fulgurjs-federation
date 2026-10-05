<script setup lang="ts">
/**
 * Vue 宿主 × React 桥接子应用（examples 版，含全部关键语义注释）。
 * 先启动 examples/templates/react-remote（5303）再启动本宿主。
 */
import { ref } from 'vue'
import { clearAppContext } from '@fulgurjs/federation/runtime'
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
import { getLatestHostContext, login, logout } from './host-session'

// 工厂选项：retries 透传 loadRemote；getContext 在每次实际加载前同步取最新快照
const RemoteReactApp = createVueBridgeApp('bridge-react-remote/bridge', {
  retries: 1,
  getContext: () => getLatestHostContext(),
})

// sessionKey 是桥接控制参数（非敏感登录代次 ID），不是业务 props
const sessionKey = ref<string | null>('login-1-alice')
const userName = ref('Alice')
const label = ref('来自 Vue 宿主')
const readyCount = ref(0)

function handleReady(): void {
  readyCount.value++
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r(null)))
}

// 换账号推荐顺序（§4.3）：受控 prop 置 null → 等卸载 → clearAppContext 清 A 残留
// → 登录 B → 更新受控 prop 触发新代次（getContext + loadRemote + onSession 全走一遍）
async function switchUser(): Promise<void> {
  sessionKey.value = null
  await nextFrame()
  clearAppContext()
  login('login-2-bob', { id: 2, name: 'Bob' })
  userName.value = 'Bob'
  sessionKey.value = 'login-2-bob'
}

// 登出：prop 置 null → 桥接立即卸载且不再请求 → 宿主清理全局 context
async function doLogout(): Promise<void> {
  sessionKey.value = null
  await nextFrame()
  clearAppContext()
  logout()
  userName.value = ''
}
</script>

<template>
  <div style="font-family: sans-serif; padding: 16px; max-width: 720px">
    <h1>Vue 宿主 × React 子应用（@fulgurjs/federation/vue）</h1>
    <p data-testid="demo-session">会话：{{ sessionKey ?? '未登录' }}（{{ userName || '—' }}）· onReady 次数：{{ readyCount }}</p>

    <p>
      <button data-testid="demo-switch" @click="switchUser">切换到 Bob（clearAppContext → 重挂）</button>
      <button data-testid="demo-logout" @click="doLogout">登出（sessionKey → null）</button>
    </p>

    <!-- 外层元素控制桥接区域外观；appProps 是挂载时浅拷贝快照，换引用不重挂，重挂用 :key -->
    <section style="margin-top: 12px">
      <RemoteReactApp
        :session-key="sessionKey"
        :app-props="{ label, onReady: handleReady }"
      />
    </section>
  </div>
</template>
