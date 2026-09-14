<template>
  <span data-testid="vue-check-b" :data-version="version">{{ result }}</span>
</template>

<script setup lang="ts">
import { isReactive, version } from 'vue34'

const props = defineProps<{ state: unknown }>()
const result = `isReactive:${isReactive(props.state)};vue:${version}`
</script>
