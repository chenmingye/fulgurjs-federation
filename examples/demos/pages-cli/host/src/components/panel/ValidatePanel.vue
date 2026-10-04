<template>
  <section class="pc-panel">
    <h2>② 页面表校验 <small>validatePages（R1–R5 独立导出，返回违例清单不抛错）</small></h2>

    <div class="pc-ok">
      真实页面表校验结果：<strong>{{ realSummary }}</strong>
      <span>（R1 剥参收敛 / R2 重复 spec / R3 spec 存在性 / R4 遮蔽重复 / R5 重名——逐项计数：{{ realCountsText }}）</span>
    </div>

    <div class="pc-row">
      <button type="button" @click="showInjected = !showInjected">
        {{ showInjected ? '隐藏注入违规演示' : '注入违规演示（内存构造，不污染真实页面表）' }}
      </button>
    </div>

    <template v-if="showInjected">
      <p class="pc-hint" style="margin-bottom: 8px">
        下表是内存里构造的一份「坏页面表」，跑的还是同一个 validatePages——真实页面表（上方）不受影响。
        构造点：无显式 spec 的参数页 /pc/orders/:id 推导出 orders 与列表页收敛（R1）且遮蔽列表页（R4）；
        dashboard 两条完全重复（R2/R4/R5）；ghost 的 spec 不在远程 exposes（R3，dev 有 schema 时报）。
      </p>
      <div class="pc-violation" :class="{ 'pc-violation--error': v.level === 'error' }" v-for="(v, i) in injectedViolations" :key="i">
        <strong>[{{ v.rule }} {{ v.level.toUpperCase() }}]</strong>
        <pre>{{ v.message }}</pre>
      </div>
      <p class="pc-hint">
        计数：error {{ injectedErrorCount }} / warn {{ injectedWarnCount }}。
        真实接入时 definePages（createHostPages 内部）对 ERROR 级默认 throw——启动瞬间即报，而不是运行时加载错组件。
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { remoteSchema, validatePages, type PageRouteLike } from '@fulgurjs/federation/runtime'
import { pages, remotePrefixes } from '../../fulgurjs/pages.data'

const RULES = ['R1', 'R2', 'R3', 'R4', 'R5'] as const

const realViolations = validatePages(pages, { remotes: remotePrefixes, schema: remoteSchema })
const realSummary = realViolations.length === 0 ? '校验通过（0 条违例）' : `发现 ${realViolations.length} 条违例`
const realCountsText = RULES.map(
  (rule) => `${rule}:${realViolations.filter((v) => v.rule === rule).length}`,
).join(' ')

// 注入违规演示：仅存在于本组件内存的坏页面表（真实页面表不受影响）。
const injectedPages: PageRouteLike[] = [
  { route: '/pc/orders/:id', name: 'PcOrdersDetail' },
  { route: '/pc/orders', name: 'PcOrders' },
  { route: '/pc/dashboard', spec: 'pages/dashboard', name: 'PcDashboard' },
  { route: '/pc/dashboard', spec: 'pages/dashboard', name: 'PcDashboard' },
  { route: '/pc/ghost', spec: 'pages/ghost', name: 'PcGhost' },
]
const injectedViolations = validatePages(injectedPages, { remotes: remotePrefixes, schema: remoteSchema })
const injectedErrorCount = injectedViolations.filter((v) => v.level === 'error').length
const injectedWarnCount = injectedViolations.filter((v) => v.level === 'warn').length

const showInjected = ref(false)
</script>
