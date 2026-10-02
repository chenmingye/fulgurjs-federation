<template>
  <button class="demo-btn" data-testid="err-good-button" type="button" @click="count++">
    err-good 远程按钮（点击了 {{ count }} 次）
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 本地状态保存在远程组件内部；被宿主消费时运行在宿主页面的 Vue 实例上
const count = ref(0)
</script>

<style scoped>
.demo-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #1677ff;
  color: #fff;
  cursor: pointer;
}
</style>
