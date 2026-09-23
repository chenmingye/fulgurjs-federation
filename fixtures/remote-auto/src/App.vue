<template>
  <main style="font-family: sans-serif; padding: 16px">
    <h1>remote-auto（独立运行壳）</h1>
    <p>联邦消费请走 host-auto（5110）；本页仅验证独立模式可自举。</p>
    <Counter />
  </main>
</template>

<script setup lang="ts">
import Counter from './exposes/Counter.vue'
</script>
