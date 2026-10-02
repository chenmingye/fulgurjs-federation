<template>
  <DemoCard
    no="⑥"
    title="parseSpec / unwrapDefault / getRuntime"
    description="三个基础运行时工具的真实行为：spec 解析结构、ESM/CJS default interop、运行时单例方法面与调试信息。"
    api="parseSpec(spec) / unwrapDefault(ns) / getRuntime() / version"
    source="host/src/cards/Card6ApiUtils.vue"
  >
    <h3 class="sub-title">parseSpec：spec = '远程名/Expose键'</h3>
    <input v-model="spec" class="spec-input" type="text" />
    <button class="btn" type="button" @click="runParse">解析</button>
    <pre class="out">{{ parseResult }}</pre>

    <h3 class="sub-title">unwrapDefault：ESM/CJS default interop</h3>
    <button class="btn" type="button" @click="runUnwrap">运行 unwrapDefault 对比</button>
    <pre class="out">{{ unwrapResult }}</pre>

    <h3 class="sub-title">getRuntime：运行时单例与调试面</h3>
    <button class="btn ghost" type="button" @click="readRuntimeInfo">刷新运行时信息</button>
    <pre class="out">{{ runtimeText }}</pre>
    <table v-if="remotesRows.length" class="grid-table">
      <thead>
        <tr><th>远程</th><th>entry</th><th>status</th><th>加载耗时 ms</th><th>setup</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in remotesRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td style="word-break: break-all">{{ row.entry }}</td>
          <td>{{ row.status }}</td>
          <td>{{ row.lastLoadMs ?? '—' }}</td>
          <td>{{ row.setup }}</td>
        </tr>
      </tbody>
    </table>
    <p class="note">
      说明：getRuntime() 单例本体没有 debugInfo 字段；运行时调试面是 window.__FULGURJS_INFO__
      （remotes 状态 / errors 历史）与 window.__FULGURJS_SCOPE__（共享协商），上表即读取 __FULGURJS_INFO__.remotes。
    </p>
  </DemoCard>
</template>

<script setup lang="ts">
/** 卡片⑥：parseSpec / unwrapDefault / getRuntime 与调试面（window.__FULGURJS_INFO__） */
import { ref } from 'vue'
import { getRuntime, loadRemote, parseSpec, unwrapDefault, version } from '@fulgurjs/federation/runtime'
import DemoCard from './DemoCard.vue'

const spec = ref('sh-remote-b/RemoteCounter')
const parseResult = ref('点击「解析」查看结构')
const unwrapResult = ref('点击按钮运行对比')
const runtimeText = ref('点击「刷新运行时信息」')
const remotesRows = ref<Array<{ name: string; entry: string; status: string; lastLoadMs?: number; setup?: string }>>([])

function runParse(): void {
  parseResult.value = JSON.stringify(parseSpec(spec.value), null, 2)
}

function runUnwrap(): void {
  const withDefault = { default: { tag: 'default 导出的对象' }, named: 1 }
  const plainNamespace = { tag: '普通命名空间（无 default）', named: 2 }
  unwrapResult.value = JSON.stringify(
    {
      'unwrapDefault({ default: {...} })': unwrapDefault(withDefault),
      'unwrapDefault({ 无 default })': unwrapDefault(plainNamespace),
      'unwrapDefault(undefined)': unwrapDefault(undefined),
    },
    null,
    2,
  )
}

async function readRuntimeInfo(): Promise<void> {
  const runtime = getRuntime()
  const info = (globalThis as Record<string, any>).__FULGURJS_INFO__
  runtimeText.value = JSON.stringify(
    {
      'typeof getRuntime()': typeof runtime,
      'getRuntime() === globalThis.__FULGURJS_RUNTIME__': runtime === (globalThis as Record<string, any>).__FULGURJS_RUNTIME__,
      '方法面（单例为冻结对象）': Object.keys(runtime),
      'version': version,
    },
    null,
    2,
  )
  remotesRows.value = Object.entries(info?.remotes ?? {}).map(([name, debug]) => {
    const d = debug as { entry: string; status: string; lastLoadMs?: number; setup?: string }
    return { name, entry: d.entry, status: d.status, lastLoadMs: d.lastLoadMs, setup: d.setup }
  })
}

// 预取一次 store 模块，保证 remotes 表有真实状态可看（静默失败不打扰演示）
void loadRemote('sh-remote-a/store').catch(() => {})
</script>

<style scoped>
.sub-title { font-size: 13px; margin: 14px 0 8px; color: #1f2329; }
</style>
