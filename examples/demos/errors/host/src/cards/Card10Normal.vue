<template>
  <CardShell
    :no="10"
    title="正常对照（无故障基线）"
    expect-code="无错误"
    principle="加载 remote-good 正常组件 err-good/ClickButton 成功（走同一 loadRemote / setup 生命周期），同时展示页面顶部「未预期错误监视器」的实时计数——全部故障卡操作完成后，未预期计数应保持 0。"
  >
    <template #actions>
      <button :disabled="!canInject" data-testid="card10-load" type="button" @click="loadNormal()">加载正常组件（ClickButton）</button>
    </template>
    <template #stage>
      <div class="stage-box" data-testid="card10-stage">
        <component :is="NormalComp" v-if="showNormal" />
      </div>
    </template>
    <template #result>
      <ErrorView v-if="error" :error="error" label="加载失败（正常基线不应出现）" />
      <p>
        未预期 console.error / onerror / unhandledrejection 计数：
        <strong :class="{ bad: monitor.unexpected.length > 0, ok: monitor.unexpected.length === 0 }" data-testid="card10-unexpected-count">
          {{ monitor.unexpected.length }}
        </strong>
      </p>
      <p>预期故障登记（fulgurjs:error 事件与插件诊断输出，不计入未预期）：{{ monitor.expected.length }} 条</p>
      <p v-if="successText" class="success" data-testid="card10-success">{{ successText }}</p>
    </template>
  </CardShell>
</template>

<script setup lang="ts">
/**
 * 卡 10 · 正常对照：无故障基线。
 * 加载路径与故障卡完全一致（loadRemote 生命周期 → 默认渲染），用于对照「成功长什么样」；
 * 先经 loadRemote 真实验证成功（同一 Promise 缓存，不产生重复网络请求）再声明成功，
 * 同时回显未预期错误监视器计数——所有预期故障都应只进「预期登记」，
 * 未预期计数保持 0 即整页错误隔离成立。
 */
import { computed, ref, shallowRef } from 'vue'
import { loadRemote, remoteComponent } from '@fulgurjs/federation/vue'
import { monitor } from '../error-monitor'
import CardShell from '../components/CardShell.vue'
import ErrorView from '../components/ErrorView.vue'

const NormalComp = remoteComponent('err-good/ClickButton', { retries: 0 })

const showNormal = ref(false)
const successText = ref('')
const error = shallowRef<unknown>(undefined)

const canInject = computed(() => !showNormal.value)

const loadNormal = async (): Promise<void> => {
  error.value = undefined
  successText.value = ''
  try {
    await loadRemote('err-good/ClickButton')
    showNormal.value = true
    successText.value = 'err-good/ClickButton 加载并渲染成功：远程组件在宿主页面真实可用（可点击计数）'
  } catch (e) {
    error.value = e
  }
}
</script>

<style scoped>
.bad {
  color: #cf1322;
}
.ok {
  color: #389e0d;
}
</style>
