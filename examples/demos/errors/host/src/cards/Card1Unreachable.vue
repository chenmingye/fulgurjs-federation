<template>
  <CardShell
    :no="1"
    title="远程不可用（连接拒绝）"
    expect-code="MFU-001"
    principle="registerRemote 指向无监听的 http://localhost:5999（retries:0、timeout:3000，promise remote 动态地址），loadRemote 真实发起跨源请求 → 连接拒绝 → 重试耗尽包装为 MFU-001。"
  >
    <template #actions>
      <button :disabled="!canInject" data-testid="card1-inject" type="button" @click="injectFault()">注入故障（指向 5999）</button>
      <button :disabled="!canRecover" data-testid="card1-recover" type="button" @click="recover()">恢复（改指 err-good 正确 entry）</button>
    </template>
    <template #stage>
      <p class="stage-note">
        注入 entry：<code>{{ UNREACHABLE_ENTRY }}</code><br />
        恢复 entry：<code>{{ ERR_GOOD_ENTRY }}</code>
      </p>
    </template>
    <template #result>
      <ErrorView v-if="error" :error="error" />
      <p v-if="successText" class="success" data-testid="card1-success">{{ successText }}</p>
    </template>
  </CardShell>
</template>

<script setup lang="ts">
/**
 * 卡 1 · 远程不可用（连接拒绝）→ MFU-001。
 * 恢复使用同名字远程的重复注册：registerRemote 重复注册时 entry/timeout/retries
 * 按最新配置刷新（运行时文档语义），随后 loadRemote 用新地址真实重新加载。
 * 恢复时容器自报名 err-good 与注册名 err-unreachable 不一致，因 promise remote
 * 仅告警不阻断（控制台一条 MFU-002 warn，属预期噪声）。
 */
import { computed, ref, shallowRef } from 'vue'
import { loadRemote, registerRemote } from '@fulgurjs/federation/runtime'
import { ERR_GOOD_ENTRY, UNREACHABLE_ENTRY, type UtilsModule } from '../shared'
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
  registerRemote({
    name: 'err-unreachable',
    entry: UNREACHABLE_ENTRY,
    promise: () => Promise.resolve(UNREACHABLE_ENTRY),
    retries: 0,
    timeout: 3000,
  })
  try {
    const utils = await loadRemote<UtilsModule>('err-unreachable/utils')
    successText.value = `意外成功：sumNumbers(2,3,5) = ${utils.sumNumbers(2, 3, 5)}（故障注入下不应出现）`
  } catch (e) {
    error.value = e
    phase.value = 'fault'
  }
}

const recover = async (): Promise<void> => {
  registerRemote({
    name: 'err-unreachable',
    entry: ERR_GOOD_ENTRY,
    promise: () => Promise.resolve(ERR_GOOD_ENTRY),
    retries: 0,
    timeout: 3000,
  })
  try {
    const utils = await loadRemote<UtilsModule>('err-unreachable/utils')
    successText.value = `恢复成功：sumNumbers(2,3,5) = ${utils.sumNumbers(2, 3, 5)}（同名远程已改指正确 entry，容器真实可用）`
    phase.value = 'recovered'
  } catch (e) {
    error.value = e
  }
}
</script>
