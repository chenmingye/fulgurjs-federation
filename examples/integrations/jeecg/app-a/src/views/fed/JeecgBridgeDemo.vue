<template>
  <div class="fed-jeecg-bridge">
    <a-card :bordered="false" size="small" class="fed-panel">
      <template #title>联邦演示 · Jeecg-A 嵌入 Jeecg-B（同源双实例桥接）</template>
      <a-space direction="vertical" :size="6" style="width: 100%">
        <a-space wrap>
          <a-tag color="purple">宿主：jeecg-a（JeecgBoot 官方前端实例 A）</a-tag>
          <a-tag color="geekblue">子应用：jeecg-b（同基线独立实例，自有 store/路由/主题）</a-tag>
          <a-tag color="cyan">URL 同步 basePath=/fed/bridge</a-tag>
        </a-space>
        <a-space wrap align="center">
          <span>会话：</span>
          <a-radio-group v-model:value="sessionName" button-style="solid" size="small" @change="handleSessionChange">
            <a-radio-button value="alice">用户 alice</a-radio-button>
            <a-radio-button value="bob">用户 bob</a-radio-button>
            <a-radio-button value="none">登出</a-radio-button>
          </a-radio-group>
          <a-button size="small" @click="handleRemount">卸载后重挂</a-button>
          <span>子应用挂载次数：<b>{{ mountCount }}</b>（换会话/重挂 +1，B 内路由变化不变）</span>
        </a-space>
        <div class="fed-bridge-container" data-fulgurjs="jeecg-a-embeds-jeecg-b">
          <BridgeJeecgB v-if="sessionKey !== null" :app-props="{ ...appProps, onReady: handleReady }" :session-key="sessionKey"
            :routing="{ basePath: '/fed/bridge', navigation: navPort }" @ready="handleReady" />
          <a-empty v-else description="已登出：Jeecg-B 已卸载（会话代次置空）" />
        </div>
        <a-collapse ghost>
          <a-collapse-panel key="diag" header="诊断面板（会话代次 / AppContext / 事件）">
            <p>sessionKey：<code>{{ sessionKey ?? 'null（登出态）' }}</code></p>
            <p>appProps：<code>{{ JSON.stringify(appProps) }}</code></p>
            <p>宿主路由：<code>{{ route.fullPath }}</code> · history.length：<b>{{ historyLen }}</b></p>
            <p>事件：<code v-if="events.length">{{ events.slice(-6).join(' | ') }}</code><span v-else>（暂无）</span></p>
          </a-collapse-panel>
        </a-collapse>
      </a-space>
    </a-card>
  </div>
</template>

<script setup lang="ts">
/**
 * Jeecg-A 宿主桥接视图：嵌入同源异实例的 Jeecg-B。
 * - createVueBridgeApp（/bridge/vue）+ createVueBridgeNavigation（/bridge/router/vue）；
 * - 受控会话：sessionKey 组件 prop 驱动（换账号=卸载→清 context→新代次重挂，§8.2 合同）；
 * - URL 同步：B 的 memory 路由写入本实例浏览器历史（唯一写入方=A）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
import { createVueBridgeNavigation } from '@fulgurjs/federation/vue'

const route = useRoute()
const router = useRouter()
const historyLen = ref(0)
const mountCount = ref(0)
const events = ref<string[]>([])

const sessionName = ref<'alice' | 'bob' | 'none'>('alice')
const sessionKey = computed(() => (sessionName.value === 'none' ? null : `jeecg-a:${sessionName.value}`))
const appProps = computed(() => ({
  token: sessionName.value === 'none' ? undefined : sessionName.value === 'bob' ? 'fakeToken2' : 'fakeToken1',
  user: sessionName.value === 'none' ? undefined : sessionName.value,
  depth: 0,
}))

// B 的宿主导航端口：读写本实例（jeecg-a）的浏览器路由
const navPort = createVueBridgeNavigation(router)

const BridgeJeecgB = createVueBridgeApp('jeecg-b/bridge', {
  retries: 0,
  getContext: () => {
    const user = sessionName.value
    return {
      sessionKey: sessionKey.value ?? undefined,
      user: user === 'none' ? undefined : { name: user, from: 'jeecg-a' },
      token: user === 'none' ? undefined : appProps.value.token,
    } as Record<string, unknown>
  },
})

watch(
  () => route.fullPath,
  () => {
    historyLen.value = window.history.length
  },
  { immediate: true },
)
onMounted(() => {
  historyLen.value = window.history.length
})

function handleSessionChange(): void {
  events.value.push(`session→${sessionName.value}`)
}

function handleReady(): void {
  mountCount.value++
  events.value.push(`ready#${mountCount.value}@${String(sessionKey.value)}`)
}

function handleRemount(): void {
  events.value.push('manual-remount')
  const current = sessionName.value
  sessionName.value = 'none'
  window.setTimeout(() => {
    sessionName.value = current === 'none' ? 'alice' : (current as 'alice' | 'bob')
  }, 50)
}
</script>

<style scoped>
.fed-bridge-container { border: 1px dashed #722ed1; border-radius: 6px; padding: 8px; min-height: 480px; }
</style>
