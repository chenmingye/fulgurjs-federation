<script setup lang="ts">
/**
 * 页面2 · 应用级桥接：createVueBridgeApp 挂载完整子应用（sf-vue-remote/bridge）。
 * 含会话演示：
 * - provideAppContext 快照（用户名可输入，经 getContext 同步 getter 提供）；
 * - 「切换会话」受控顺序：sessionKey→null 等卸载 → clearAppContext → 新快照 → 新 sessionKey；
 * - 「卸载再挂载」：mount/unmount 计数由子应用 onReady/onGone 真实回调推进。
 */
import { ref } from 'vue'
import { clearAppContext } from '@fulgurjs/federation/runtime'
import { createVueBridgeApp } from '@fulgurjs/federation/bridge/vue'
import IdentityBadges from '../components/IdentityBadges.vue'
import DiagnosticsPanel from '../components/DiagnosticsPanel.vue'
import { currentSession, getLatestHostContext, login } from '../host-session'
import { bridgeDiag, countMount, countSessionSwitch, countUnmount, logDiag } from '../diagnostics'

// 工厂选项：retries 透传 loadRemote；getContext 在每次实际加载前同步取最新快照（纯 getter）
const BridgeApp = createVueBridgeApp('sf-vue-remote/bridge', {
  retries: 1,
  getContext: () => getLatestHostContext(),
})

const initial = currentSession()
/** 桥接受控控制参数：非空字符串 = 登录代次；null = 登出态（空容器） */
const sessionKey = ref<string | null>(initial.key)
/** 用户名输入（作为下一次快照的 user.name） */
const inputName = ref(initial.user.name)
/** 当前会话代次 key（卸载再挂载时恢复同一 key） */
const activeKey = ref(initial.key ?? 'session-1-alice')

function handleReady(): void {
  countMount()
  logDiag('child', '子应用 onReady：挂载完成（首次根提交）')
}

function handleGone(): void {
  countUnmount()
  logDiag('child', '子应用 onGone：已卸载（容器由桥接管控）')
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

let sessionSeq = 1

// 换会话受控顺序（README §8.2）：sessionKey→null 等卸载 → clearAppContext → 新快照 → 新 sessionKey
async function handleSwitchSession(): Promise<void> {
  logDiag('host', '切换会话开始：sessionKey → null（等待卸载）')
  sessionKey.value = null
  await nextFrame()
  clearAppContext()
  logDiag('host', 'clearAppContext 完成（旧会话快照与去重状态已清理）')
  sessionSeq += 1
  const name = inputName.value.trim() || '未命名用户'
  const key = `session-${sessionSeq}-${name}`
  login(key, { id: sessionSeq, name })
  activeKey.value = key
  countSessionSwitch()
  logDiag('host', `新快照就绪：sessionKey=${key}，user=${name}`)
  sessionKey.value = key
  logDiag('host', 'sessionKey 更新 → 桥接按新代次重挂（getContext → provideAppContext → loadRemote → mount）')
}

// 卸载再挂载：null 等卸载（容器保持空）→ 恢复同一 sessionKey（模块缓存复用，不重复下载）
async function handleRemount(): Promise<void> {
  logDiag('host', `卸载再挂载：sessionKey → null（当前 key=${activeKey.value}）`)
  sessionKey.value = null
  await nextFrame()
  logDiag('host', '已卸载（容器保持空）；重新赋同一 sessionKey')
  sessionKey.value = activeKey.value
  logDiag('host', 'sessionKey 恢复 → 桥接重挂')
}
</script>

<template>
  <section>
    <h2>页面2 · 应用级桥接（createVueBridgeApp 挂载完整子应用）</h2>
    <IdentityBadges host-name="sf-vue-host" framework="Vue" remote-name="sf-vue-remote" remote-framework="Vue" />
    <p class="sfh-note">
      子应用自带 memory 路由（工单列表/详情/编辑）与本地状态，整站挂载/卸载；
      内部导航不写宿主 URL。受控会话：sessionKey 变化驱动卸载/重挂与 AppContext 快照写入。
    </p>
    <p class="sfh-toolbar" data-testid="demo-session">
      当前 sessionKey：<code>{{ sessionKey ?? '未登录（空容器）' }}</code>
      · mount {{ bridgeDiag.mountCount }} · unmount {{ bridgeDiag.unmountCount }}
    </p>
    <div class="sfh-toolbar">
      <label>用户名快照 <input v-model="inputName" data-testid="demo-username" /></label>
      <button data-testid="demo-switch" @click="handleSwitchSession">切换会话（null → clearAppContext → 新快照 → 新 key）</button>
      <button class="sfh-btn-secondary" data-testid="demo-remount" @click="handleRemount">卸载再挂载</button>
    </div>
    <section class="sfh-bridge-area">
      <BridgeApp
        :session-key="sessionKey"
        :app-props="{ label: '来自 sf-vue-host 的 appProps 快照', onReady: handleReady, onGone: handleGone }"
      />
    </section>
    <DiagnosticsPanel note="计数推进来源：子应用根组件 onMounted/onUnmounted 回调（真实生命周期）；日志包含宿主会话操作与 runtime 错误事件。" />
  </section>
</template>
