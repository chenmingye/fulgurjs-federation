<template>
  <div data-testid="demo-remote-detail">
    <h3>vue-remote / 详情页</h3>
    <p data-testid="demo-detail-id">路由参数 id：{{ props.id ?? '(无)' }}</p>
    <p data-testid="demo-detail-tab">query 参数 tab：{{ props.tab ?? '(无)' }}</p>
  </div>
</template>

<script setup lang="ts">
// 页面参数由宿主路由传入（宿主把 route.params + route.query 作为 props 透传）
const props = defineProps<{ id?: string; tab?: string }>()
</script>
