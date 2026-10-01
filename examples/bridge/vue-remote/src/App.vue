<script setup lang="ts">
import { ref } from 'vue'

// 子应用自身的页面组件（独立运行态与桥接态共用）
const count = ref(0)
</script>

<template>
  <div>
    <button data-testid="demo-vue-counter" @click="count++">本地状态：{{ count }}</button>
  </div>
</template>
