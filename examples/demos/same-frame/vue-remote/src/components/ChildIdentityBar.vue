<script setup lang="ts">
/**
 * 子应用身份栏：容器名 + 框架 + 当前内部路由 + 宿主会话（AppContext 快照读取）。
 * AppContext 仅在「被宿主桥接挂载」时由宿主桥写入；独立运行时降级显示，
 * 不产生控制台错误（getAppContext 失败属独立运行预期，静默降级）。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { getAppContext } from '@fulgurjs/federation/runtime'
import type { AppContext } from '@fulgurjs/federation/runtime'

const route = useRoute()

const sessionInfo = computed(() => {
  try {
    const ctx = getAppContext() as Partial<AppContext>
    const user = ctx.user as { name?: string } | undefined
    if (ctx.sessionKey) return `宿主会话 ${ctx.sessionKey} · 用户 ${user?.name ?? '—'}`
  } catch {
    /* 独立直开子应用页面：无宿主运行时，属预期降级 */
  }
  return '独立运行（无 AppContext）'
})
</script>

<template>
  <div class="sfc-bar">
    <span class="sfc-badge sfc-badge-child">子应用 sf-vue-remote</span>
    <span class="sfc-badge">框架 Vue</span>
    <span class="sfc-badge">内部路由 {{ route.fullPath }}</span>
    <span class="sfc-badge sfc-badge-session" data-testid="child-session">{{ sessionInfo }}</span>
  </div>
</template>
