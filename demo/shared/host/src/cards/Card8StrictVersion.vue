<template>
  <DemoCard
    no="⑧"
    title="loadShare 选项与 strictVersion 版本冲突"
    description="作用域中的 nanostores 是 0.11.4 / 0.6.0。声明 requiredVersion '^9.0.0' + strictVersion: true + singleton: true 的 loadShare 会命中真实运行时错误（MFU-003：strictVersion 版本不满足）；旁边的正常 loadShare 作为对照。"
    api="loadShare('nanostores', { requiredVersion: '^9.0.0', strictVersion: true, singleton: true })"
    source="host/src/cards/Card8StrictVersion.vue"
  >
    <button class="btn warn" type="button" :disabled="busy" @click="conflictLoad">冲突加载（^9.0.0 + strictVersion）</button>
    <button class="btn" type="button" :disabled="busy" @click="normalLoad">正常 loadShare（对照）</button>
    <pre v-if="conflictText" class="err">{{ conflictText }}</pre>
    <pre v-if="normalText" class="out">{{ normalText }}</pre>
    <p class="note">
      singleton 裁决规则：忽略 requiredVersion 的过滤作用、保证全页单实例（已加载版本优先）；
      requiredVersion 只影响冲突告警（MFU-010）与 strictVersion 抛错（MFU-003）。
      冲突错误同时经 onRemoteError hook 与 window fulgurjs:error 事件发出——卡片③可见记录。
    </p>
  </DemoCard>
</template>

<script setup lang="ts">
/** 卡片⑧：strictVersion 冲突捕获真实错误；正常 loadShare 对照 */
import { ref } from 'vue'
import { loadShare } from '@fulgurjs/federation/runtime'
import DemoCard from './DemoCard.vue'
import { errorSummary } from '../demo/format'

const busy = ref(false)
const conflictText = ref('')
const normalText = ref('')

async function conflictLoad(): Promise<void> {
  busy.value = true
  conflictText.value = ''
  try {
    await loadShare('nanostores', { requiredVersion: '^9.0.0', strictVersion: true, singleton: true })
    conflictText.value = '意外成功（不应发生：作用域中没有满足 ^9.0.0 的版本）'
  } catch (err) {
    const summary = errorSummary(err)
    conflictText.value = `捕获真实运行时错误\n错误码：${summary.code}\n错误名：${summary.name}\n消息：\n${summary.message}`
  } finally {
    busy.value = false
  }
}

async function normalLoad(): Promise<void> {
  busy.value = true
  normalText.value = ''
  try {
    const ns = (await loadShare('nanostores')) as Record<string, unknown>
    normalText.value = JSON.stringify(
      {
        'typeof ns.atom': typeof ns.atom,
        'typeof ns.computed': typeof ns.computed,
        说明: '正常协商命中 0.11.4（sh-host 提供），与卡片①使用的是同一实例',
      },
      null,
      2,
    )
  } catch (err) {
    normalText.value = `意外失败：${errorSummary(err).message}`
  } finally {
    busy.value = false
  }
}
</script>
