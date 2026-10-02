<template>
  <DemoCard
    no="⑪"
    title="fallbackModule：单次调用的显式降级"
    description="loadRemote('sh-remote-a/no-such-module', { fallbackModule })——该模块不存在（MFU-006），失败后返回宿主本地兜底模块而不是抛错。runtime 仍会 console.error 原始错误并发出 fulgurjs:error 事件（卡片③可见 onRemoteError 记录）——显式兜底不是静默兜底。"
    api="loadRemote(spec, { fallbackModule: () => import('./fallbacks/storeFallback') })"
    source="host/src/cards/Card11Fallback.vue + host/src/fallbacks/storeFallback.ts"
  >
    <button class="btn" type="button" :disabled="busy" @click="loadWithFallback">加载不存在的模块（触发兜底）</button>
    <pre v-if="resultText" class="out">{{ resultText }}</pre>
    <p v-if="errorText" class="err">{{ errorText }}</p>
    <p class="note">
      不传 fallbackModule 时同样的加载会直接抛错（零静默兜底纪律）；传了 fallbackModule 则
      「错误事件照发、结果用兜底」。注意浏览器控制台会出现一条 runtime 打印的 console.error
      （原始 MFU-006 错误）——这是设计行为，用于保持失败可诊断。
    </p>
  </DemoCard>
</template>

<script setup lang="ts">
/** 卡片⑪：fallbackModule 显式降级 */
import { ref } from 'vue'
import { loadRemote } from '@fulgurjs/federation/runtime'
import DemoCard from './DemoCard.vue'
import { formatError } from '../demo/format'

const busy = ref(false)
const resultText = ref('')
const errorText = ref('')

async function loadWithFallback(): Promise<void> {
  busy.value = true
  resultText.value = ''
  errorText.value = ''
  try {
    const ns = await loadRemote('sh-remote-a/no-such-module', {
      fallbackModule: () => import('../fallbacks/storeFallback'),
    }) as Record<string, any>
    resultText.value = JSON.stringify(
      {
        实际服务方: ns.FALLBACK_SOURCE,
        headline: ns.HEADLINE,
        fallbackGreet: ns.fallbackGreet?.('宿主页面'),
        导出键: Object.keys(ns),
      },
      null,
      2,
    )
  } catch (err) {
    errorText.value = formatError(err)
  } finally {
    busy.value = false
  }
}
</script>
