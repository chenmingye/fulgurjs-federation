<template>
  <DemoCard
    no="③"
    title="运行时插件 hooks"
    description="main.ts 已通过 registerPlugins 注册 demo-hooks 插件：beforeLoadRemote / afterLoadRemote / onRemoteError / resolveShare 四类 hook 全部记录到 globalThis.__HOOK_LOG__。点击下方按钮触发一次真实加载，观察日志。"
    api="registerPlugins([{ name, init(hooks) }])"
    source="host/src/main.ts + host/src/demo/hooksPlugin.ts"
  >
    <button class="btn" type="button" @click="loadUtils">加载远程模块（sh-remote-a/utils）</button>
    <button class="btn ghost" type="button" @click="clearLog">清空日志</button>
    <p v-if="moduleKeys" class="ok">模块导出键：{{ moduleKeys }}</p>
    <p v-if="errorText" class="err">{{ errorText }}</p>
    <table class="grid-table">
      <thead>
        <tr><th style="width: 110px">时间</th><th style="width: 150px">hook</th><th>记录</th></tr>
      </thead>
      <tbody>
        <tr v-for="(entry, idx) in log" :key="`${entry.time}-${idx}`">
          <td>{{ entry.time }}</td>
          <td>{{ entry.hook }}</td>
          <td style="word-break: break-all">{{ entry.detail }}</td>
        </tr>
        <tr v-if="log.length === 0">
          <td colspan="3">暂无记录——点击上方按钮触发加载；卡片⑧的 strictVersion 冲突、卡片⑪的兜底也会进入 onRemoteError 日志。</td>
        </tr>
      </tbody>
    </table>
    <p class="note">
      hook 契约：beforeLoadRemote / afterLoadRemote 为观测 hook（自身抛错只告警、不改写加载结果）；
      resolveShare 为决策 hook（显式返回 ShareEntry 才覆写裁决，本演示只记录返回 void）。
    </p>
  </DemoCard>
</template>

<script setup lang="ts">
/** 卡片③：运行时插件 hook 日志（读 globalThis.__HOOK_LOG__） */
import { ref } from 'vue'
import { loadRemote } from '@fulgurjs/federation/runtime'
import DemoCard from './DemoCard.vue'
import { formatError } from '../demo/format'
import { appendHookLog, clearHookLog, readHookLog, type HookLogEntry } from '../demo/hooksPlugin'

const log = ref<HookLogEntry[]>([])
const moduleKeys = ref('')
const errorText = ref('')

function readLog(): void {
  log.value = [...readHookLog()].slice(-30).reverse()
}

async function loadUtils(): Promise<void> {
  errorText.value = ''
  appendHookLog('页面操作', '点击「加载远程模块」→ loadRemote("sh-remote-a/utils")')
  try {
    const ns = await loadRemote('sh-remote-a/utils') as Record<string, unknown>
    moduleKeys.value = Object.keys(ns).join('、')
  } catch (err) {
    errorText.value = formatError(err)
  }
  readLog()
}

function clearLog(): void {
  clearHookLog()
  readLog()
}
</script>
