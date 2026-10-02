<script setup lang="ts">
/**
 * demo/bridge-router/vue-host/src/ObsPanel.vue — URL 同步观测台（实时更新）。
 * 展示：宿主当前 URL（location.href）、子应用逻辑位置、history.length、
 * 子应用挂载计数、最近 10 条导航事件（带来源标注）。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { navLog, mountCount } from './demo-log'
import { BRIDGE_BASE_PATH } from './routing'

const route = useRoute()

const hostHref = ref(window.location.href)
const historyLength = ref(window.history.length)

const childLocation = computed(() => {
  const inPrefix = route.path === BRIDGE_BASE_PATH || route.path.startsWith(`${BRIDGE_BASE_PATH}/`)
  if (!inPrefix) return route.fullPath
  return route.fullPath.slice(BRIDGE_BASE_PATH.length) || '/'
})

const refresh = (): void => {
  hostHref.value = window.location.href
  historyLength.value = window.history.length
}

watch(() => route.fullPath, refresh)

const handlePop = (): void => { refresh() }
onMounted(() => window.addEventListener('popstate', handlePop))
onUnmounted(() => window.removeEventListener('popstate', handlePop))
</script>

<template>
  <section class="demo-obs">
    <h3 class="demo-obs-title">URL 同步观测台</h3>
    <p>宿主当前 URL：<code data-demo-host-url>{{ hostHref }}</code></p>
    <p>子应用逻辑位置：<code data-demo-child-location>{{ childLocation }}</code></p>
    <p>
      history.length：<code data-demo-history-length>{{ historyLength }}</code>
      ｜子应用 mount 次数：<code data-demo-mount-count>{{ mountCount }}</code>（路由切换应恒为 1）
    </p>
    <h4>最近导航事件（≤10 条，新在下）</h4>
    <ol class="demo-obs-log">
      <li v-for="entry in navLog" :key="entry.id">
        [{{ entry.time }}] {{ entry.source }} — {{ entry.detail }}
      </li>
      <li v-if="navLog.length === 0" class="demo-muted">（暂无事件）</li>
    </ol>
  </section>
</template>

<style scoped>
.demo-obs { border: 1px solid #d0e7ff; background: #f5faff; padding: 8px 12px; margin: 12px 0; border-radius: 4px; }
.demo-obs-title { margin: 6px 0; }
.demo-obs p { margin: 4px 0; }
h4 { margin: 6px 0 2px; }
.demo-obs-log { margin: 4px 0; padding-left: 20px; font-size: 13px; }
</style>
