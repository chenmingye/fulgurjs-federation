<template>
  <CardShell
    :no="9"
    title="setup 初始化异常"
    expect-code="MFU-012"
    principle="err-good 声明 federation({ setup })；宿主先把 globalThis.__FGX_FAIL_SETUP__ 置 true，再用运行时注册的 promise 远程 err-setup-bad（指向同一容器入口）触发全新生命周期：setup 读取该 flag 同步抛错 → MFU-012，__FULGURJS_INFO__ 中 setup=failed；恢复：清除 flag 后重试（只清失败阶段缓存，setup 从头重跑）。"
  >
    <template #actions>
      <button :disabled="!canInject" data-testid="card9-inject" type="button" @click="injectFault()">注入故障（flag=true 时 loadRemote）</button>
      <button :disabled="!canRecover" data-testid="card9-recover" type="button" @click="recover()">恢复（清除 flag 后重试）</button>
    </template>
    <template #stage>
      <p class="stage-note">
        机制：生命周期状态按远程名隔离（err-setup-bad 拥有独立 setupPromise），与正常远程 err-good
        互不影响；flag 仅在该次注入的调用窗口内置 true（finally 必清），不污染其他卡。
        promise remote 的名称自报差异仅产生一条 MFU-002 warn（预期噪声）。
      </p>
      <p>
        <code>__FULGURJS_INFO__.remotes['err-setup-bad'].setup</code> =
        <strong data-testid="card9-setup-status">{{ setupStatus }}</strong>
        （none / pending / ready / failed）
      </p>
    </template>
    <template #result>
      <ErrorView v-if="error" :error="error" />
      <p v-if="successText" class="success" data-testid="card9-success">{{ successText }}</p>
    </template>
  </CardShell>
</template>

<script setup lang="ts">
/**
 * 卡 9 · setup 初始化异常 → MFU-012 + debug.setup = failed。
 * 依据 runtime/index.ts 的生命周期实现选择真实可行路径：
 * - setup 默认导出在每次生命周期执行时读取 globalThis.__FGX_FAIL_SETUP__（注入开关）；
 * - 「err-setup-bad」为运行时注册的 promise 远程，指向 err-good 同一入口——容器模块
 *   复用，但 lifecycleStates 按远程名分键，因此拥有独立的 setup 执行机会；
 * - 注入 finally 必清 flag：setup 失败只影响本次注入窗口，不影响其他卡的 err-good 加载。
 * 恢复后 setup 重跑成功（应用级缓存已在失败时清除），debug.setup 变为 ready。
 */
import { computed, ref, shallowRef } from 'vue'
import { loadRemote, registerRemote } from '@fulgurjs/federation/runtime'
import { ERR_GOOD_ENTRY, type UtilsModule } from '../shared'
import CardShell from '../components/CardShell.vue'
import ErrorView from '../components/ErrorView.vue'

const FAULT_FLAG_KEY = '__FGX_FAIL_SETUP__'
const REMOTE_NAME = 'err-setup-bad'

const phase = ref<'idle' | 'fault' | 'recovered'>('idle')
const error = shallowRef<unknown>(undefined)
const successText = ref('')
const setupStatus = ref('（未读取）')

const canInject = computed(() => phase.value === 'idle')
const canRecover = computed(() => phase.value === 'fault')

const setFaultFlag = (value: boolean): void => {
  ;(globalThis as { __FGX_FAIL_SETUP__?: boolean })[FAULT_FLAG_KEY] = value
}

const readSetupStatus = (): void => {
  const info = (globalThis as { __FULGURJS_INFO__?: { remotes: Record<string, { setup?: string }> } }).__FULGURJS_INFO__
  setupStatus.value = info?.remotes?.[REMOTE_NAME]?.setup ?? '未知'
}

const registerRuntimeRemote = (): void => {
  registerRemote({
    name: REMOTE_NAME,
    entry: ERR_GOOD_ENTRY,
    promise: () => Promise.resolve(ERR_GOOD_ENTRY),
    retries: 0,
    timeout: 5000,
  })
}

const injectFault = async (): Promise<void> => {
  error.value = undefined
  successText.value = ''
  registerRuntimeRemote()
  setFaultFlag(true)
  try {
    const utils = await loadRemote<UtilsModule>(`${REMOTE_NAME}/utils`)
    successText.value = `意外成功：DEMO_ANSWER = ${utils.DEMO_ANSWER}（故障注入下不应出现）`
  } catch (e) {
    error.value = e
    phase.value = 'fault'
  } finally {
    setFaultFlag(false)
  }
  readSetupStatus()
}

const recover = async (): Promise<void> => {
  setFaultFlag(false)
  registerRuntimeRemote()
  try {
    const utils = await loadRemote<UtilsModule>(`${REMOTE_NAME}/utils`)
    successText.value = `恢复成功：DEMO_ANSWER = ${utils.DEMO_ANSWER}（setup 已重跑并真实通过）`
    phase.value = 'recovered'
  } catch (e) {
    error.value = e
  }
  readSetupStatus()
}
</script>
