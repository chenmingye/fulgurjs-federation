<script setup lang="ts">
/**
 * examples/templates/showcase/vue-host/src/pages/BridgeReactPage.vue — 桥接演示页（Vue 宿主 × React 子应用）。
 * createVueBridgeApp + routing prop（basePath=/br-react + createVueBridgeNavigation 端口）；
 * catch-all 路由保证子应用内部导航不重挂本组件；appProps 携带稳定回调供子应用上报事件。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
import { BRIDGE_BASE_PATH, getBridgeRouting } from '../routing'
import { handleChildEvent, logNav } from '../demo-log'
import ObsPanel from '../ObsPanel.vue'

const RemoteReactBridge = createVueBridgeApp('react-remote/bridge', { retries: 1 })
const routing = getBridgeRouting()
const appProps = { onChildEvent: handleChildEvent }

const router = useRouter()
const deepLink = ref(`${window.location.origin}${BRIDGE_BASE_PATH}/orders?q=网络&page=2`)
const deepLinkError = ref('')

const handleDeepLink = (): void => {
  const raw = deepLink.value.trim()
  let path = raw
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw)
      path = parsed.pathname + parsed.search
    } catch {
      deepLinkError.value = 'URL 无法解析'
      return
    }
  }
  if (path !== BRIDGE_BASE_PATH && !path.startsWith(`${BRIDGE_BASE_PATH}/`)) {
    deepLinkError.value = `路径必须位于 ${BRIDGE_BASE_PATH} 前缀下`
    return
  }
  deepLinkError.value = ''
  logNav('深链粘贴', `push ${path}`)
  void router.push(path)
}
</script>

<template>
  <section>
    <h2>桥接演示：Vue 宿主 × React 子应用（URL 同步）</h2>
    <p class="demo-muted">
      子应用挂载在宿主 <code>{{ BRIDGE_BASE_PATH }}</code> 前缀下；观测台实时展示宿主 URL、
      子应用逻辑位置、history.length 与导航事件来源。
    </p>
    <ObsPanel />
    <section class="demo-deeplink">
      <h3>深链粘贴框（push 侧「刷新直达」复现）</h3>
      <div class="demo-row">
        <input v-model="deepLink" class="demo-deeplink-input" aria-label="深链粘贴框" />
        <button @click="handleDeepLink">push 复现直达</button>
      </div>
      <p v-if="deepLinkError !== ''" class="demo-deeplink-error">{{ deepLinkError }}</p>
      <p class="demo-muted">粘贴带中文 query 的完整 URL 后点击按钮 = 复制地址栏在新窗口打开前的 push 侧动作。</p>
    </section>
    <section class="demo-bridge-area" data-demo-bridge-area>
      <RemoteReactBridge :routing="routing" :app-props="appProps" />
    </section>
  </section>
</template>

<style scoped>
.demo-deeplink { border: 1px dashed #bbb; padding: 8px 12px; margin: 12px 0; border-radius: 4px; }
.demo-deeplink h3 { margin: 6px 0; }
.demo-deeplink-input { flex: 1 1 320px; }
.demo-deeplink button { cursor: pointer; }
.demo-deeplink-error { color: #c0392b; margin: 4px 0; }
.demo-bridge-area { border: 2px solid #61dafb; padding: 8px 12px; margin: 12px 0; border-radius: 4px; }
</style>
