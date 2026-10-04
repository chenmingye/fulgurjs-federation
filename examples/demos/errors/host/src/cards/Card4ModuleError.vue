<template>
  <CardShell
    :no="4"
    title="模块初始化异常（顶层 throw）"
    expect-code="MFU-001（底层为模块求值抛错）"
    principle="remote exposes './module-error'（模块求值期顶层 throw）→ remoteComponent 渲染 → 插件默认错误占位（真实占位语义：错误码 + 根因 + 重试加载/刷新页面重试）。"
  >
    <template #actions>
      <button :disabled="!canInject" data-testid="card4-inject" type="button" @click="injectFault()">注入故障（渲染 module-error）</button>
      <button :disabled="!canRecover" data-testid="card4-check" type="button" @click="checkPlaceholder()">检查默认占位（重试按钮存在）</button>
      <button :disabled="!canRecover" data-testid="card4-recover" type="button" @click="recover()">恢复（渲染 ClickButton）</button>
    </template>
    <template #stage>
      <div ref="stageEl" class="stage-box" data-testid="card4-stage">
        <component :is="FaultComp" v-if="showFault" />
        <component :is="GoodComp" v-if="showGood" />
      </div>
      <p v-if="domCheck" class="dom-check" data-testid="card4-dom-check">{{ domCheck }}</p>
    </template>
    <template #result>
      <p class="stage-note">
        「重试加载」点击后仍会失败并重新展示错误：模块求值必然抛错，运行时经 fulgurjs_retry
        变更 URL 真实重新拉取、再次命中同一注入。恢复目标为同一远程的正常组件。
      </p>
      <p v-if="successText" class="success" data-testid="card4-success">{{ successText }}</p>
    </template>
  </CardShell>
</template>

<script setup lang="ts">
/**
 * 卡 4 · 模块初始化异常（顶层 throw）。
 * 真实错误对象由插件默认占位展示（内部经 remoteComponent 的 error 管道）；
 * 本卡补一个 DOM 检查按钮，直接读占位上的 data-fulgurjs-error 错误码与
 * data-fulgurjs-retry / data-fulgurjs-reload 按钮存在性，验证「重试加载」存在。
 * 恢复：渲染同远程正常组件 ClickButton（真实可用，可点击计数）。
 */
import { computed, ref } from 'vue'
import { remoteComponent } from '@fulgurjs/federation/runtime'
import CardShell from '../components/CardShell.vue'

const FaultComp = remoteComponent('err-good/module-error', { retries: 0 })
const GoodComp = remoteComponent('err-good/ClickButton', { retries: 0 })

const showFault = ref(false)
const showGood = ref(false)
const domCheck = ref('')
const successText = ref('')
const stageEl = ref<HTMLElement | null>(null)

const canInject = computed(() => !showFault.value)
const canRecover = computed(() => showFault.value)

const injectFault = (): void => {
  domCheck.value = ''
  successText.value = ''
  showFault.value = true
}

const checkPlaceholder = (): void => {
  const root = stageEl.value
  if (!root) return
  const codeEl = root.querySelector('[data-fulgurjs-error]')
  const retryBtn = root.querySelector('[data-fulgurjs-retry]')
  const reloadBtn = root.querySelector('[data-fulgurjs-reload]')
  domCheck.value = [
    `占位错误码（data-fulgurjs-error）= ${codeEl?.getAttribute('data-fulgurjs-error') ?? '未找到'}`,
    `「重试加载」按钮存在 = ${retryBtn ? '是' : '否'}`,
    `「刷新页面重试」按钮存在 = ${reloadBtn ? '是' : '否'}`,
  ].join('；')
}

const recover = (): void => {
  domCheck.value = ''
  showGood.value = true
  successText.value = '恢复成功：err-good/ClickButton 已渲染（真实可用，可点击计数）'
}
</script>
