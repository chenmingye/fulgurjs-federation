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
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { loadRemote } from '@fulgurjs/federation/runtime'

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
