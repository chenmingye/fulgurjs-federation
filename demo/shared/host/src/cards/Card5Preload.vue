<template>
  <DemoCard
    no="⑤"
    title="预载：preloadRemote 的 preload / prefetch 两种模式"
    description="预载目标 sh-remote-b/info——默认页面不消费该模块，因此每次点击都能看到 performance 资源时间线里真实新增的条目。preload（等待 CSS load/error）与 prefetch（低优先级、立即返回）各一按钮。"
    api="preloadRemote('sh-remote-b/info', { mode }) / performance.getEntriesByType('resource')"
    source="host/src/cards/Card5Preload.vue + remote-b/src/exposes/info.ts"
  >
    <button class="btn" type="button" :disabled="busy" @click="run('preload')">preload 模式预载 sh-remote-b/info</button>
    <button class="btn ghost" type="button" :disabled="busy" @click="run('prefetch')">prefetch 模式预载 sh-remote-b/info</button>
    <table v-if="results.length" class="grid-table">
      <thead>
        <tr><th>新增资源条目（:5345）</th><th style="width: 100px">耗时 ms</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in results" :key="row.url">
          <td style="word-break: break-all">{{ row.url }}</td>
          <td>{{ row.ms }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="lastMode" class="note">无新增资源条目——可能此前已预载过，或资源仍在低优先级队列中（prefetch 按浏览器空闲调度），可再次点击核对。</p>
    <p class="note">
      预载只下载不执行：注入 &lt;link rel="modulepreload"&gt; / &lt;link rel="stylesheet"&gt;，
      不会初始化容器、不触发 setup/onSession。仅传远程名 = 预载 manifest 中全部 exposes；
      传「远程/expose」= 只预载该 expose 的 chunk + CSS。
      预载失败不阻断业务（MFU-007 事件通道，可到卡片③看 onRemoteError）。
    </p>
  </DemoCard>
</template>

<script setup lang="ts">
/** 卡片⑤：preloadRemote 两种模式 + performance 资源增量对比 */
import { ref } from 'vue'
import { preloadRemote } from '@fulgurjs/federation/runtime'
import DemoCard from './DemoCard.vue'

interface ResourceRow {
  url: string
  ms: number
}

const busy = ref(false)
const results = ref<ResourceRow[]>([])
const lastMode = ref<'preload' | 'prefetch' | ''>('')

function snapshot(): ResourceRow[] {
  return performance
    .getEntriesByType('resource')
    .map((entry) => entry as PerformanceResourceTiming)
    .filter((entry) => entry.name.includes(':5345'))
    .map((entry) => ({ url: entry.name, ms: Math.round(entry.duration) }))
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run(mode: 'preload' | 'prefetch'): Promise<void> {
  busy.value = true
  lastMode.value = mode
  try {
    const before = new Set(snapshot().map((row) => row.url))
    await preloadRemote('sh-remote-b/info', { mode })
    // preload 已等待样式完成；prefetch 低优先级立即返回——稍等让 link 注入的资源进入时间线
    await wait(mode === 'prefetch' ? 1500 : 500)
    results.value = snapshot().filter((row) => !before.has(row.url))
  } finally {
    busy.value = false
  }
}
</script>
