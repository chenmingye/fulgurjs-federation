<template>
  <DemoCard
    no="⑦"
    title="别名共享 shareKey：宿主本地模块注册为 'lib-alias'"
    description="宿主 main.ts 用 registerShare 把本地模块 lib/greeting.ts 以共享键 'lib-alias'、版本 1.0.0 注册进 default 作用域；remote-a 的消费模块用 loadShare('lib-alias') 取到的就是宿主这份。"
    api="registerShare('default', 'lib-alias', '1.0.0', get, { from }) / loadShare('lib-alias')"
    source="host/src/main.ts + remote-a/src/exposes/demoConsumer.ts"
  >
    <button class="btn" type="button" :disabled="busy" @click="consume">经 remote-a 消费 lib-alias</button>
    <pre v-if="resultText" class="out">{{ resultText }}</pre>
    <p v-if="errorText" class="err">{{ errorText }}</p>
    <p class="note">
      'lib-alias' 是纯粹的运行时注册（非 npm 包、非构建期 shared 配置）——消费方 loadShare 只认
      共享作用域里的键。注册发生在 main.ts（页面加载即生效），消费发生在 remote-a 的模块里，
      两者经页面级运行时单例看到同一份注册表。
    </p>
  </DemoCard>
</template>

<script setup lang="ts">
/** 卡片⑦：shareKey 别名共享——宿主注册，remote-a 消费 */
import { ref } from 'vue'
import { loadRemote } from '@fulgurjs/federation/runtime'
import DemoCard from './DemoCard.vue'
import { formatError } from '../demo/format'

const busy = ref(false)
const resultText = ref('')
const errorText = ref('')

async function consume(): Promise<void> {
  busy.value = true
  resultText.value = ''
  errorText.value = ''
  try {
    const consumer = (await loadRemote('sh-remote-a/demo-consumer')) as Record<string, any>
    const result = await consumer.consumeLibAlias()
    resultText.value = JSON.stringify(result, null, 2)
  } catch (err) {
    errorText.value = formatError(err)
  } finally {
    busy.value = false
  }
}
</script>
