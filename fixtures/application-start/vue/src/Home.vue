<script setup lang="ts">
import { inject } from 'vue'
import { counterKey } from './counter'
const useCounter = inject(counterKey)
if (!useCounter) throw new Error('应用装配没有提供 counter。')
const counter = useCounter()
async function increment() { await Promise.resolve(); useCounter!().count++ }
</script>
<template><p>本应用计数：{{ counter.count }}</p><button @click="increment">异步 +1</button></template>
