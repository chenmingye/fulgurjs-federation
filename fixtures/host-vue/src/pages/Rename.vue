<template>
  <div data-testid="page-rename">
    <p data-testid="rename-result">{{ result }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// remotes 配置为 shop: 'remote-a@...'（webpack 语法 + 键重命名语义）
const utils = await import('shop/utils')
const result = ref(utils.default('shop-rename'))
</script>
