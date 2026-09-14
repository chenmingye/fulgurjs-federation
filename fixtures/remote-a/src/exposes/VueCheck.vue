<template>
  <span data-testid="vue-check" :data-version="version">{{ result }}</span>
</template>

<script setup lang="ts">
import { isReactive, version } from 'vue'

const props = defineProps<{ state: unknown }>()
// 若 host 与 remote 的 vue 不是同一实例，isReactive 的判定会跨实例失效
const result = `isReactive:${isReactive(props.state)};vue:${version}`
</script>
