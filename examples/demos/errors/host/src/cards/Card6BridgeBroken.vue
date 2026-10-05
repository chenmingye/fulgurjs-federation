<template>
  <CardShell
    :no="6"
    title="非法桥接契约"
    expect-code="MFU-015"
    principle="createVueBridgeApp('err-good/bridge-broken')：该 expose 默认导出 {}（非 defineBridgeApp 产物，缺函数类型 mount/unmount）→ 契约校验抛 MFU-015 → 插件默认占位；恢复：切换合法桥接模块 err-good/bridge-good 同页重建挂载。"
  >
    <template #actions>
      <button :disabled="!canInject" data-testid="card6-inject" type="button" @click="injectFault()">注入故障（挂载 bridge-broken）</button>
      <button :disabled="!canRecover" data-testid="card6-recover" type="button" @click="recover()">恢复（切换 bridge-good）</button>
    </template>
    <template #stage>
      <div class="stage-row">
        <div class="stage-box" data-testid="card6-stage-default">
          <p class="stage-label">插件默认占位（真实占位语义，含恢复按钮）</p>
          <component :is="BridgeComp" v-if="BridgeComp" :key="stageKey" :app-props="{ label: 'card6', onReady: handleReady }" />
        </div>
        <div class="stage-box" data-testid="card6-stage-capture">
          <p class="stage-label">错误对象捕获（自定义 errorComponent 通道，展示真实错误对象）</p>
          <component :is="CaptureComp" v-if="CaptureComp" :key="stageKey" />
        </div>
      </div>
      <p>真实 mount 成功次数：<span data-testid="card6-mount-count">{{ mountCount }}</span>（恢复后 +1 即验证可用）</p>
    </template>
    <template #result>
      <ErrorView v-if="capturedError" :error="capturedError" label="捕获的真实错误对象" />
      <p v-if="successText" class="success" data-testid="card6-success">{{ successText }}</p>
    </template>
  </CardShell>
</template>

<script setup lang="ts">
/**
 * 卡 6 · 非法桥接契约 → MFU-015。
 * 双实例展示：左列为插件默认占位（占位语义本体，含「重试加载 / 刷新页面重试」），
 * 右列用自定义 errorComponent（插件契约：只接收 error prop）捕获并展示真实错误对象。
 * 恢复：换 spec 切合法 bridge-good，:key 重建实例——onReady 计数 +1 即验证可用。
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
  mountSpec('err-good/bridge-broken')
  phase.value = 'fault'
}

const recover = (): void => {
  mountSpec('err-good/bridge-good')
  successText.value = '恢复成功：合法契约 bridge-good 已挂载（见上方蓝色子应用面板）'
  phase.value = 'recovered'
}
</script>
