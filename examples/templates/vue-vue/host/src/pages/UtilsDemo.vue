<template>
  <div>
    <h2>普通 TS 模块调用</h2>
    <p>调用 vue-remote 暴露的 <code>./utils</code> 模块（loadRemote 返回模块命名空间，显式调用其导出）：</p>
    <p v-if="error" data-testid="demo-utils-error" style="color: #c45656">调用失败：{{ error }}</p>
    <ul v-else-if="result" data-testid="demo-utils-result">
      <li>sumNumbers(2, 3, 7) = {{ result.sum }}</li>
      <li>DEMO_ANSWER = {{ result.answer }}</li>
      <li>formatPrice(12.5) = {{ result.price }}</li>
    </ul>
    <p v-else>加载中…</p>
    <button data-testid="demo-utils-reload" @click="load">重新调用</button>
    <section data-testid="demo-types-guide">
      <h3>远程类型提示：像使用本地代码一样</h3>
      <p>打开 <code>host/src/type-demo.ts</code>，在 <code>utils.</code> 后触发补全，或悬停查看函数参数和返回值。</p>
      <p>下面的详情组件来自远程，<code>id</code> 和 <code>tab</code> 都是字符串。把本文件中的 <code>id="7"</code> 改成 <code>:id="7"</code>，编辑器和类型检查会提示错误；体验后请还原。</p>
      <RemoteDetail id="7" tab="type-demo" />
      <p>执行 <code>pnpm --dir host typecheck</code> 可检查正确调用和五条错误示例。错误示例不在浏览器中执行；移除其中一行的 <code>@ts-expect-error</code> 后再检查，就能看到具体诊断。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { loadRemote } from '@fulgurjs/federation/runtime'
import { remoteComponent } from '@fulgurjs/federation/vue'

const RemoteDetail = remoteComponent('vue-remote/pages/DetailPage')

// 普通 TS 模块同样走 loadRemote：类型来自插件同步的远程声明（src/fulgurjs/types），
// 入口字符串拼错会在编译期报错——不再需要手写接口或手动泛型

const result = ref<{ sum: number; answer: number; price: string } | null>(null)
const error = ref('')

async function load(): Promise<void> {
  error.value = ''
  try {
    const utils = await loadRemote('vue-remote/utils')
    result.value = {
      sum: utils.sumNumbers(2, 3, 7),
      answer: utils.DEMO_ANSWER,
      price: utils.formatPrice(12.5),
    }
  } catch (e) {
    error.value = String((e as Error)?.message ?? e)
  }
}

onMounted(load)
</script>
