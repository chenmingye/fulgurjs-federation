<template>
  <CardShell
    :no="3"
    title="超时（响应永不到达）"
    expect-code="MFU-001"
    principle="宿主 vite.config configureServer 注入 /fulgurjs-hang-entry.js 挂起中间件（不响应、不放行）；registerRemote 指向该地址 timeout:1500 → 运行时 withTimeout 先超时 → 包装为 MFU-001（原因：等待超过 1500 毫秒）。"
  >
    <template #actions>
      <button :disabled="!canInject" data-testid="card3-inject" type="button" @click="injectFault()">注入故障（指向挂起入口）</button>
      <button :disabled="!canRecover" data-testid="card3-recover" type="button" @click="recover()">恢复（改指 err-good 正确 entry）</button>
    </template>
    <template #stage>
      <p class="stage-note">
        注入 entry：<code>{{ HANG_ENTRY }}</code>（timeout 1500ms）<br />
        恢复 entry：<code>{{ ERR_GOOD_ENTRY }}</code>
      </p>
    </template>
    <template #result>
      <ErrorView v-if="error" :error="error" />
      <p v-if="successText" class="success" data-testid="card3-success">{{ successText }}</p>
    </template>
  </CardShell>
</template>

<script setup lang="ts">
/**
 * 卡 3 · 超时 → MFU-001（根因为 withTimeout 超时）。
 * 挂起中间件保持 HTTP 连接不响应；浏览器动态 import 无法取消，该 URL 的
 * in-flight 记录被运行时保留复用——因此每页生命周期只注入一次（按钮一次性）。
 * 恢复与卡 1 同法：同名字远程重复注册改指正确 entry。
 */
import { computed, ref, shallowRef } from 'vue'
import { loadRemote, registerRemote } from '@fulgurjs/federation/runtime'
import { ERR_GOOD_ENTRY, HANG_ENTRY, type UtilsModule } from '../shared'
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
    name: 'err-hang',
    entry: HANG_ENTRY,
    promise: () => Promise.resolve(HANG_ENTRY),
    retries: 0,
    timeout: 1500,
  })
  try {
    const utils = await loadRemote<UtilsModule>('err-hang/utils')
    successText.value = `意外成功：sumNumbers(1,2,3) = ${utils.sumNumbers(1, 2, 3)}（故障注入下不应出现）`
  } catch (e) {
    error.value = e
    phase.value = 'fault'
  }
}

const recover = async (): Promise<void> => {
  registerRemote({
    name: 'err-hang',
    entry: ERR_GOOD_ENTRY,
    promise: () => Promise.resolve(ERR_GOOD_ENTRY),
    retries: 0,
    timeout: 3000,
  })
  try {
    const utils = await loadRemote<UtilsModule>('err-hang/utils')
    successText.value = `恢复成功：sumNumbers(1,2,3) = ${utils.sumNumbers(1, 2, 3)}（同名远程已改指正确 entry，容器真实可用）`
    phase.value = 'recovered'
  } catch (e) {
    error.value = e
  }
}
</script>
