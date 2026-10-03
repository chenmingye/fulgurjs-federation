<template>
  <div data-testid="demo-remote-home">
    <h3>vue-remote / 首页</h3>
    <p>这是由 vue-remote 暴露的联邦页面，渲染在宿主的路由出口内。</p>
    <ClickButton />
  </div>
</template>

<script setup lang="ts">
import ClickButton from '../ClickButton.vue'
</script>
