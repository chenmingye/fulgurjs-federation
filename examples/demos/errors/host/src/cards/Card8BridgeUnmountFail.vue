<template>
  <CardShell
    :no="8"
    title="桥接 unmount 异常（容器持久封锁）"
    expect-code="MFU-016（phase: unmount）"
    principle="expose 'bridge-unmount-fail' 的契约 mount 正常、unmount 必然抛错；宿主把受控 sessionKey 从 sess-A 换为 sess-B 触发真实卸载 → MFU-016（phase:unmount）→ 插件按 BN09 语义持久封锁该容器：默认占位的「重试加载」消失，只剩「刷新页面重试」；再换会话不会重挂。"
  >
    <template #actions>
      <button :disabled="!canInject" data-testid="card8-inject" type="button" @click="injectFault()">注入故障（挂载，会话 sess-A）</button>
      <button :disabled="!canTrigger" data-testid="card8-unmount" type="button" @click="triggerUnmount()">触发卸载（会话换为 sess-B）</button>
      <button :disabled="!canTrigger" data-testid="card8-check" type="button" @click="checkBlockade()">检查封锁占位（DOM 证据）</button>
      <button :disabled="!canTrigger" data-testid="card8-verify" type="button" @click="verifyBlockade()">换会话再试（sess-C，预期计数不增）</button>
      <button data-testid="card8-reload" type="button" @click="reloadPage()">恢复：整页刷新（唯一恢复路径）</button>
    </template>
    <template #stage>
      <div ref="stageEl" class="stage-box" data-testid="card8-stage">
        <component :is="BridgeComp" v-if="BridgeComp" :key="stageKey" :session-key="sk" :app-props="{ label: 'card8', onReady: handleReady }" />
      </div>
      <p>真实 mount 成功次数：<span data-testid="card8-mount-count">{{ mountCount }}</span>（封锁后换会话不应增加）</p>
      <p v-if="domCheck" class="dom-check" data-testid="card8-dom-check">{{ domCheck }}</p>
    </template>
    <template #result>
      <div v-if="blockadeLog" class="log-view">
        <p class="log-title">真实错误对象（插件 console.error 诊断通道，监视器登记为预期故障）：</p>
        <pre class="log-body">{{ blockadeLog }}</pre>
      </div>
      <p class="stage-note">
        封锁语义：unmount 抛错后容器清理状态不确定，同页「重试加载」与换会话都不得在原容器重挂
        （重试按钮消失、mount 计数不增）；唯一恢复路径是整页刷新（占位上的「刷新页面重试」与本卡按钮同效）。
      </p>
    </template>
  </CardShell>
</template>

<script setup lang="ts">
/**
 * 卡 8 · 桥接 unmount 异常 → MFU-016（phase: unmount）+ 容器持久封锁（BN09）。
 * 卸载由受控 sessionKey 换代驱动（插件 watch sessionKey → start → invalidate →
 * contract.unmount 抛错）；真实错误对象经插件的 console.error 诊断输出，
 * 由未预期错误监视器的「预期登记」通道捕获展示。
 * getContext 提供与受控 sessionKey 一致的快照，避免 MFU-017 干扰本卡主路径。
 */
import { computed, nextTick, ref, shallowRef, type Component } from 'vue'
import { createVueBridgeApp } from '@fulgurjs/federation/bridge/vue'
import { findExpectedByKeyword } from '../error-monitor'
import CardShell from '../components/CardShell.vue'

const BridgeComp = shallowRef<Component | null>(null)
const stageKey = ref(0)
const sk = ref<string | null>('sess-A')
const mountCount = ref(0)
const domCheck = ref('')
const stageEl = ref<HTMLElement | null>(null)

const phase = ref<'idle' | 'mounted' | 'blocked' | 'verified'>('idle')

const canInject = computed(() => phase.value === 'idle')
const canTrigger = computed(() => phase.value === 'mounted' || phase.value === 'blocked' || phase.value === 'verified')

/** 插件对 unmount 失败的诊断输出（含完整 MFU-016 错误对象文本） */
const blockadeLog = computed(() => findExpectedByKeyword('桥接应用卸载失败')?.text ?? '')

const handleReady = (): void => {
  mountCount.value += 1
}

const injectFault = (): void => {
  domCheck.value = ''
  sk.value = 'sess-A'
  mountCount.value = 0
  BridgeComp.value = createVueBridgeApp('err-good/bridge-unmount-fail', {
    retries: 0,
    getContext: () => ({ sessionKey: sk.value ?? undefined, userName: 'errors-demo' }),
  })
  stageKey.value += 1
  phase.value = 'mounted'
}

const triggerUnmount = async (): Promise<void> => {
  sk.value = 'sess-B'
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 100))
  phase.value = 'blocked'
  checkBlockade()
}

const checkBlockade = (): void => {
  const root = stageEl.value
  if (!root) return
  const codeEl = root.querySelector('[data-fulgurjs-error]')
  const retryBtn = root.querySelector('[data-fulgurjs-retry]')
  const reloadBtn = root.querySelector('[data-fulgurjs-reload]')
  const statusEl = root.querySelector('[data-fulgurjs-bridge-status]')
  domCheck.value = [
    `占位错误码 = ${codeEl?.getAttribute('data-fulgurjs-error') ?? '未找到'}`,
    `「重试加载」按钮 = ${retryBtn ? '仍存在（封锁未生效！）' : '已消失'}`,
    `「刷新页面重试」按钮 = ${reloadBtn ? '存在' : '不存在'}`,
    `桥接容器状态 = ${statusEl?.getAttribute('data-fulgurjs-bridge-status') ?? '未知'}`,
  ].join('；')
}

const verifyBlockade = async (): Promise<void> => {
  const countBefore = mountCount.value
  sk.value = 'sess-C'
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 100))
  checkBlockade()
  domCheck.value += `；换会话 sess-C 后 mount 计数 = ${mountCount.value}（封锁前 ${countBefore}，预期不增）`
  phase.value = 'verified'
}

const reloadPage = (): void => {
  window.location.reload()
}
</script>

<style scoped>
.log-view {
  border: 1px solid #ffa39e;
  background: #fff1f0;
  border-radius: 6px;
  padding: 8px 10px;
}
.log-title {
  margin: 0 0 4px;
  font-weight: 600;
  font-size: 13px;
}
.log-body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  line-height: 1.6;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
</style>
