<template>
  <DemoCard
    no="⑨"
    title="运行时 registerShare：动态注册 demo-share"
    description="页面运行时注册共享键 demo-share（get 返回带时间戳的对象，from 'host-runtime'），再由 remote-a 的消费模块 loadShare('demo-share') 取到并展示。"
    api="registerShare('default', 'demo-share', '1.0.0', get, { from: 'sh-host' }) / loadShare('demo-share')"
    source="host/src/cards/Card9RegisterShare.vue + remote-a/src/exposes/demoConsumer.ts"
  >
    <button class="btn" type="button" @click="registerDemoShare">注册 demo-share</button>
    <button class="btn" type="button" :disabled="!registered || busy" @click="consume">经 remote-a 消费 demo-share</button>
    <p v-if="registered" class="ok">已注册：default.demo-share@1.0.0（可在卡片②的 shareScopeMap 中看到）</p>
    <pre v-if="resultText" class="out">{{ resultText }}</pre>
    <p v-if="errorText" class="err">{{ errorText }}</p>
    <p class="note">
      首次消费后实例被缓存（「已加载版本永不替换」）：再次消费返回同一对象，value 字段不会变化——
      这正是共享语义；需要新值请换版本号重新注册。
    </p>
  </DemoCard>
</template>

<script setup lang="ts">
/** 卡片⑨：运行时 registerShare + 远程消费 */
import { ref } from 'vue'
import { loadRemote, registerShare } from '@fulgurjs/federation/runtime'
import DemoCard from './DemoCard.vue'
import { formatError } from '../demo/format'

const registered = ref(false)
const busy = ref(false)
const resultText = ref('')
const errorText = ref('')

function registerDemoShare(): void {
  registerShare(
    'default',
    'demo-share',
    '1.0.0',
    () => Promise.resolve({ value: Date.now(), from: 'host-runtime' }),
    { from: 'sh-host' },
  )
  registered.value = true
}

async function consume(): Promise<void> {
  busy.value = true
  errorText.value = ''
  try {
    const consumer = (await loadRemote('sh-remote-a/demo-consumer')) as Record<string, any>
    const result = await consumer.consumeDemoShare()
    resultText.value = JSON.stringify(result, null, 2)
  } catch (err) {
    errorText.value = formatError(err)
  } finally {
    busy.value = false
  }
}
</script>
