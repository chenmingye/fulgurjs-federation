<script setup lang="ts">
/**
 * 折叠诊断面板：mount/unmount/会话切换计数 + 最近事件日志 + 当前 AppContext 快照 JSON。
 * 全部真实数据：计数由子应用 onReady/onGone 回调与会话操作推进；日志由宿主动作与
 * runtime 的 fulgurjs:error window 事件写入；快照实时读取页面级 AppContext 单例。
 */
import { computed } from 'vue'
import { getAppContext } from '@fulgurjs/federation/runtime'
import { bridgeDiag } from '../diagnostics'

defineProps<{ note?: string }>()

const contextJson = computed(() => {
  // 依赖事件日志长度：任何宿主/子应用事件落账后重新求值快照
  void bridgeDiag.logs.length
  try {
    const ctx = getAppContext() as Record<string, unknown>
    return JSON.stringify(
      ctx,
      (_key: string, value: unknown) => (typeof value === 'function' ? `ƒ ${(value as { name?: string }).name || 'anonymous'}()` : value),
      2,
    )
  } catch (e) {
    return `读取失败：${e instanceof Error ? e.message : String(e)}`
  }
})
</script>

<template>
  <details class="sfh-details">
    <summary>诊断面板（真实数据：计数 / 事件日志 / AppContext 快照）</summary>
    <p class="sfh-diag-counts">
      mount 计数：<b data-testid="diag-mount-count">{{ bridgeDiag.mountCount }}</b>
      · unmount 计数：<b data-testid="diag-unmount-count">{{ bridgeDiag.unmountCount }}</b>
      · 会话切换计数：<b data-testid="diag-session-count">{{ bridgeDiag.sessionSwitchCount }}</b>
    </p>
    <p v-if="note" class="sfh-diag-note">{{ note }}</p>
    <h4>最近事件日志（新 → 旧）</h4>
    <ol class="sfh-diag-logs">
      <li v-if="bridgeDiag.logs.length === 0">（暂无事件）</li>
      <li v-for="entry in bridgeDiag.logs" :key="entry.seq">
        <span class="sfh-diag-time">{{ entry.time }}</span>
        <span class="sfh-diag-kind">[{{ entry.kind }}]</span>
        {{ entry.message }}
      </li>
    </ol>
    <h4>当前 AppContext 快照 JSON（getAppContext 实时读取）</h4>
    <pre class="sfh-diag-json" data-testid="diag-context-json">{{ contextJson }}</pre>
  </details>
</template>
