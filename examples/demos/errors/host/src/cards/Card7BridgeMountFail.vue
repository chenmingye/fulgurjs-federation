<template>
  <CardShell
    :no="7"
    title="桥接 mount 失败"
    expect-code="MFU-016（phase: mount）"
    principle="expose 'bridge-mount-fail' 用 defineBridgeApp 声明合法契约，但工厂在 mount 阶段同步抛错 → defineBridgeApp 包装为 MFU-016（details.phase=mount，根因保留原始错误）→ 插件默认占位；恢复：切换正常 bridge 模块。"
  >
    <template #actions>
      <button :disabled="!canInject" data-testid="card7-inject" type="button" @click="injectFault()">注入故障（挂载 bridge-mount-fail）</button>
      <button :disabled="!canRecover" data-testid="card7-recover" type="button" @click="recover()">恢复（切换 bridge-good）</button>
    </template>
    <template #stage>
      <div class="stage-row">
        <div class="stage-box" data-testid="card7-stage-default">
          <p class="stage-label">插件默认占位（真实占位语义，含恢复按钮）</p>
          <component :is="BridgeComp" v-if="BridgeComp" :key="stageKey" :app-props="{ label: 'card7', onReady: handleReady }" />
        </div>
        <div class="stage-box" data-testid="card7-stage-capture">
          <p class="stage-label">错误对象捕获（自定义 errorComponent 通道，展示真实错误对象）</p>
          <component :is="CaptureComp" v-if="CaptureComp" :key="stageKey" />
        </div>
      </div>
      <p>真实 mount 成功次数：<span data-testid="card7-mount-count">{{ mountCount }}</span>（mount 失败不计数；恢复后 +1 即验证可用）</p>
    </template>
    <template #result>
      <ErrorView v-if="capturedError" :error="capturedError" label="捕获的真实错误对象" />
      <p v-if="successText" class="success" data-testid="card7-success">{{ successText }}</p>
    </template>
  </CardShell>
</template>

<script setup lang="ts">
/**
 * 卡 7 · 桥接 mount 失败 → MFU-016（phase: mount）。
 * 工厂抛错发生在契约实例创建阶段：容器无半挂残留（defineBridgeApp 的清理语义），
 * 宿主 invalidate 时的 unmount 为 no-op（appsByEl 未登记），不会误触容器封锁。
 * 展示与恢复结构与卡 6 一致（默认占位 + 捕获通道 + 换 spec 恢复）。
 */
import { computed, ref, shallowRef, type Component } from 'vue'
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
import CardShell from '../components/CardShell.vue'
import ErrorView from '../components/ErrorView.vue'
import { createBridgeErrorCapture } from '../components/bridge-capture'

const phase = ref<'idle' | 'fault' | 'recovered'>('idle')
const BridgeComp = shallowRef<Component | null>(null)
const CaptureComp = shallowRef<Component | null>(null)
const stageKey = ref(0)
const mountCount = ref(0)
const capturedError = shallowRef<unknown>(undefined)
const successText = ref('')

const canInject = computed(() => phase.value === 'idle')
const canRecover = computed(() => phase.value === 'fault')

const handleReady = (): void => {
  mountCount.value += 1
}

const mountSpec = (spec: string): void => {
  BridgeComp.value = createVueBridgeApp(spec, { retries: 0 })
  CaptureComp.value = createVueBridgeApp(spec, { retries: 0, errorComponent: createBridgeErrorCapture((e) => (capturedError.value = e)) })
  stageKey.value += 1
}

const injectFault = (): void => {
  capturedError.value = undefined
  successText.value = ''
  mountSpec('err-good/bridge-mount-fail')
  phase.value = 'fault'
}

const recover = (): void => {
  mountSpec('err-good/bridge-good')
  successText.value = '恢复成功：合法契约 bridge-good 已挂载（见上方蓝色子应用面板）'
  phase.value = 'recovered'
}
</script>
