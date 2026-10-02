<template>
  <CardShell
    :no="2"
    title="模块不存在"
    expect-code="MFU-006"
    principle="对正常注册的 err-good 调 loadRemote('err-good/no-such-module')：容器加载成功、但 dev 容器入口的 get() 对未 exposes 的键抛 MFU-006（运行时对带 code 的领域错误原样穿透）。"
  >
    <template #actions>
      <button :disabled="!canInject" data-testid="card2-inject" type="button" @click="injectFault()">注入故障（加载 no-such-module）</button>
      <button :disabled="!canRecover" data-testid="card2-recover" type="button" @click="recover()">恢复（加载 err-good/utils）</button>
    </template>
    <template #stage>
      <p class="stage-note">注入 spec：<code>err-good/no-such-module</code>（远程 exposes 清单中不存在）；恢复 spec：<code>err-good/utils</code></p>
    </template>
    <template #result>
      <ErrorView v-if="error" :error="error" />
      <p v-if="successText" class="success" data-testid="card2-success">{{ successText }}</p>
    </template>
  </CardShell>
</template>

<script setup lang="ts">
/**
 * 卡 2 · 模块不存在 → MFU-006。
 * 恢复：加载同一远程真实存在的 utils 模块并真实调用其函数（验证可用）。
 */
import { computed, ref, shallowRef } from 'vue'
import { loadRemote } from '@fulgurjs/federation/runtime'
import { type UtilsModule } from '../shared'
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
    const ghost = await loadRemote('err-good/no-such-module')
    successText.value = `意外成功：${JSON.stringify(Object.keys(ghost ?? {}))}（故障注入下不应出现）`
  } catch (e) {
    error.value = e
    phase.value = 'fault'
  }
}

const recover = async (): Promise<void> => {
  try {
    const utils = await loadRemote<UtilsModule>('err-good/utils')
    successText.value = `恢复成功：formatPrice(42) = ${utils.formatPrice(42)}（同一远程的正确模块真实可用）`
    phase.value = 'recovered'
  } catch (e) {
    error.value = e
  }
}
</script>
