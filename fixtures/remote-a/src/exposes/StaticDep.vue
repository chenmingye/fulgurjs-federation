<template>
  <div data-testid="static-dep-value">static-dep:{{ n }}</div>
</template>

<script setup lang="ts">
// 静态 import leaf：生产构建中 leaf 独立成 chunk，是「静态子依赖失败」注入的靶点
import { LEAF_ANSWER } from './static-dep-leaf'
const n = LEAF_ANSWER
</script>
