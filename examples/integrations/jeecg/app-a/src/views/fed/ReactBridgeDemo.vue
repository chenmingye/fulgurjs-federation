<template>
  <div class="fed-react-bridge">
    <a-card :bordered="false" size="small" class="fed-panel">
      <template #title>联邦演示 · Jeecg-A 嵌入 React-C（跨框架桥接）</template>
      <a-space direction="vertical" :size="6" style="width: 100%">
        <a-space wrap>
          <a-tag color="purple">宿主：jeecg-a（Vue）</a-tag>
          <a-tag color="volcano">子应用：react-c（React 19 完整子应用）</a-tag>
          <a-tag color="cyan">URL 同步 basePath=/fed/react</a-tag>
        </a-space>
        <div class="fed-bridge-container" data-fulgurjs="jeecg-a-embeds-react-c">
          <BridgeReactC :app-props="{ host: 'jeecg-a', user: 'alice', onReady: handleReady }"
            :routing="{ basePath: '/fed/react', navigation: navPort }" @ready="handleReady" />
        </div>
        <a-collapse ghost>
          <a-collapse-panel key="diag" header="诊断面板">
            <p>宿主路由：<code>{{ route.fullPath }}</code> · history.length：<b>{{ historyLen }}</b></p>
            <p>C 挂载次数：<b>{{ mountCount }}</b>（C 内路由变化不应增长）</p>
          </a-collapse-panel>
        </a-collapse>
      </a-space>
    </a-card>
  </div>
</template>

<script setup lang="ts">
/**
 * Jeecg-A 宿主桥接视图：嵌入 React 完整子应用 react-c（跨框架方向 Vue→React）。
 */
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createVueBridgeApp } from '@fulgurjs/federation/bridge/vue'
import { createVueBridgeNavigation } from '@fulgurjs/federation/bridge/router/vue'

const route = useRoute()
const router = useRouter()
const historyLen = ref(0)
const mountCount = ref(0)

const navPort = createVueBridgeNavigation(router)
const BridgeReactC = createVueBridgeApp('react-c/bridge', { retries: 0 })

watch(
  () => route.fullPath,
  () => { historyLen.value = window.history.length },
  { immediate: true },
)
onMounted(() => { historyLen.value = window.history.length })

function handleReady(): void {
  mountCount.value++
}
</script>

<style scoped>
.fed-bridge-container { border: 1px dashed #fa8c16; border-radius: 6px; padding: 8px; min-height: 480px; }
</style>
