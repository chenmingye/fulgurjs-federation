<template>
  <DemoCard
    no="④"
    title="动态远程注册：registerRemote + loadRemote"
    description="运行时注册远程（本演示按 spec 前缀映射入口地址，再 registerRemote 刷新注册），随后 loadRemote 加载模块并展示导出键列表。错误 spec 则展示真实运行时报错。"
    api="registerRemote({ name, entry }) / loadRemote(spec) / parseSpec"
    source="host/src/cards/Card4DynamicRemote.vue"
  >
    <input v-model="spec" class="spec-input" type="text" placeholder="spec 如 sh-remote-a/utils" />
    <button class="btn" type="button" :disabled="busy" @click="registerAndLoad">注册并加载</button>
    <button class="btn warn" type="button" :disabled="busy" @click="loadBadSpec">错误 spec（未注册远程）</button>
    <p v-if="resultText" class="ok">加载成功，导出键：{{ resultText }}</p>
    <pre v-if="errorSummaryText" class="err">{{ errorSummaryText }}</pre>
    <p class="note">
      重复注册同名远程是合法操作：entry/timeout/retries/breaker 参数按最新配置刷新，熔断计数状态保留（README 运行时 API 表）。
      「错误 spec」按钮加载未注册的 no-such-remote → 真实报错 MFU-008（未知远程应用）。
    </p>
  </DemoCard>
</template>

<script setup lang="ts">
/** 卡片④：运行时动态注册远程 + 加载；错误路径展示真实错误码 */
import { ref } from 'vue'
import { loadRemote, parseSpec, registerRemote } from '@fulgurjs/federation/runtime'
import DemoCard from './DemoCard.vue'
import { errorSummary, formatError } from '../demo/format'
import { REMOTE_ENTRY_BASES } from '../demo/meta'

const spec = ref('sh-remote-a/utils')
const busy = ref(false)
const resultText = ref('')
const errorSummaryText = ref('')

async function registerAndLoad(): Promise<void> {
  busy.value = true
  resultText.value = ''
  errorSummaryText.value = ''
  try {
    const { remote } = parseSpec(spec.value)
    const base = REMOTE_ENTRY_BASES[remote]
    if (!base) {
      throw new Error(`本演示未知的远程名 "${remote}"（仅支持 sh-remote-a / sh-remote-b）`)
    }
    // runtime registerRemote 的 entry 是完整入口地址（配置文件写法才会自动拼接 @fulgurjs-entry.js）
    registerRemote({ name: remote, entry: `${base}/@fulgurjs-entry.js`, shareScope: 'default' })
    const ns = await loadRemote(spec.value) as Record<string, unknown>
    resultText.value = Object.keys(ns).join('、')
  } catch (err) {
    errorSummaryText.value = formatError(err)
  } finally {
    busy.value = false
  }
}

async function loadBadSpec(): Promise<void> {
  busy.value = true
  resultText.value = ''
  errorSummaryText.value = ''
  try {
    await loadRemote('no-such-remote/utils')
    errorSummaryText.value = '意外成功（不应发生：no-such-remote 从未注册）'
  } catch (err) {
    const summary = errorSummary(err)
    errorSummaryText.value = `捕获真实运行时错误\n错误码：${summary.code}\n错误名：${summary.name}\n消息：\n${summary.message}`
  } finally {
    busy.value = false
  }
}
</script>
