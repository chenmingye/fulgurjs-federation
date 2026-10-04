<template>
  <CardShell
    :no="5"
    title="strictVersion 版本冲突"
    expect-code="MFU-003"
    principle="loadShare('err-missing-lib', { requiredVersion:'^9.0.0', strictVersion:true, singleton:true })：共享作用域 default 中不存在该键且任何版本都不满足要求 → strictVersion 开启时抛 MFU-003（不开 strictVersion 时同条件抛 MFU-004，可对照）。"
  >
    <template #actions>
      <button :disabled="!canInject" data-testid="card5-inject" type="button" @click="injectFault()">注入故障（strictVersion 拒绝）</button>
      <button :disabled="!canRecover" data-testid="card5-recover" type="button" @click="recover()">恢复（提供本地副本 fallback）</button>
    </template>
    <template #stage>
      <p class="stage-note">
        注入调用：<code>loadShare('err-missing-lib', { requiredVersion: '^9.0.0', strictVersion: true, singleton: true })</code><br />
        恢复调用：同一 shareKey 增加 <code>fallback: () =&gt; ({ answer: 42 })</code>（文档修法「为 shared 配置可用的本地副本」）
      </p>
    </template>
    <template #result>
      <ErrorView v-if="error" :error="error" />
      <p v-if="successText" class="success" data-testid="card5-success">{{ successText }}</p>
    </template>
  </CardShell>
</template>

<script setup lang="ts">
/**
 * 卡 5 · strictVersion 版本冲突 → MFU-003。
 * 错误由共享协商内核真实抛出（selectShareEntry → SHARE_STRICT_VERSION），
 * 同时运行时会发 fulgurjs:error 事件（监视器登记为预期故障）。
 * 恢复：按错误文案给出的修法提供 fallback 本地副本，loadShare 成功返回。
 */
import { computed, ref, shallowRef } from 'vue'
import { loadShare } from '@fulgurjs/federation/runtime'
import { DEMO_ANSWER } from '../shared'
import CardShell from '../components/CardShell.vue'
import ErrorView from '../components/ErrorView.vue'

const phase = ref<'idle' | 'fault' | 'recovered'>('idle')
const error = shallowRef<unknown>(undefined)
const successText = ref('')

const canInject = computed(() => phase.value === 'idle')
const canRecover = computed(() => phase.value === 'fault')

const injectFault = async (): Promise<void> => {
  error.value = undefined
  successText.value = ''
  try {
    const lib = await loadShare('err-missing-lib', { requiredVersion: '^9.0.0', strictVersion: true, singleton: true })
    successText.value = `意外成功：${JSON.stringify(lib)}（故障注入下不应出现）`
  } catch (e) {
    error.value = e
    phase.value = 'fault'
  }
}

const recover = async (): Promise<void> => {
  try {
    const lib = (await loadShare('err-missing-lib', {
      requiredVersion: '^9.0.0',
      singleton: true,
      fallback: async () => ({ answer: DEMO_ANSWER }),
    })) as { answer: number }
    successText.value = `恢复成功：本地副本 answer = ${lib.answer}（loadShare 真实返回）`
    phase.value = 'recovered'
  } catch (e) {
    error.value = e
  }
}
</script>
