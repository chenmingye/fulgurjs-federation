<template>
  <div class="ns-panel">
    <div class="ns-panel-title">remote-a 组件（sh-remote-a/ContextPanel）——消费宿主 AppContext</div>
    <pre v-if="errorText" class="ns-error">{{ errorText }}</pre>
    <template v-else>
      <ul class="ns-panel-meta">
        <li>requireAppContext('user') → {{ userDisplay }}</li>
        <li>调用宿主函数 api.hello('sh-remote-a') → {{ helloResult }}</li>
      </ul>
    </template>
    <button class="ns-btn ns-btn-ghost" type="button" @click="read">重新读取 AppContext</button>
  </div>
</template>

<script setup lang="ts">
/**
 * remote-a 暴露的 AppContext 消费面板（演示卡片⑩）：
 * - requireAppContext('user')：显式校验读取，缺键抛 CC-001 三段式；
 * - getAppContext().api.hello(...)：context 携带的宿主函数引用，同 realm 直调。
 * 宿主点击「登出」（clearAppContext）后重新渲染本组件，会显示 CC-001 报错。
 */
import { ref } from 'vue'
import { getAppContext, requireAppContext } from '@fulgurjs/federation/runtime'

const userDisplay = ref('')
const helloResult = ref('')
const errorText = ref('')

function read(): void {
  errorText.value = ''
  try {
    const ctx = requireAppContext('user')
    userDisplay.value = JSON.stringify(ctx.user)
    const api = getAppContext().api as { hello?: (name: string) => string } | undefined
    helloResult.value = typeof api?.hello === 'function' ? api.hello('sh-remote-a') : '（宿主未提供 api.hello）'
  } catch (err) {
    const e = err as { code?: string; message?: string }
    errorText.value = `[${e.code ?? 'UNKNOWN'}] ${e.message ?? String(err)}`
  }
}

read()
</script>

<style scoped>
.ns-panel { font-size: 13px; line-height: 1.7; }
.ns-panel-title { font-weight: 600; margin-bottom: 6px; }
.ns-btn { border: 1px solid #1677ff; background: #1677ff; color: #fff; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; margin-right: 6px; }
.ns-btn-ghost { background: #fff; color: #1677ff; }
.ns-panel-meta { font-size: 12px; color: #5b6470; padding-left: 16px; margin: 8px 0; word-break: break-all; }
.ns-error { background: #fef3f2; color: #b42318; padding: 8px; border-radius: 6px; font-size: 12px; white-space: pre-wrap; }
</style>
