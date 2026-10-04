<template>
  <section class="card">
    <h2 class="card-title"><span class="card-no">{{ no }}</span>{{ title }}</h2>
    <p class="card-desc">{{ description }}</p>
    <p class="card-api"><b>API：</b><code>{{ api }}</code><template v-if="source">　·　<b>源码：</b><code>{{ source }}</code></template></p>
    <div><slot /></div>
  </section>
</template>

<script setup lang="ts">
/** 演示卡片外壳：统一标题 / 说明 / API 与源码位置标注 */
defineProps<{
  no: string
  title: string
  description: string
  api: string
  source?: string
}>()
</script>
