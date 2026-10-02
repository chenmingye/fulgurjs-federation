<script setup lang="ts">
/**
 * 宿主布局：标题 + 身份徽标（宿主/远程/runtime version）+ 左侧菜单 + 内容区。
 * 子应用身份徽标由子应用自身渲染（被桥接挂载时显示在内容区容器内）。
 */
import { RouterLink, RouterView } from 'vue-router'
import IdentityBadges from './components/IdentityBadges.vue'
</script>

<template>
  <div class="sfh-layout">
    <header class="sfh-header">
      <h1>same-frame vue-host · 同框架完整子应用桥接（Vue 宿主）</h1>
      <IdentityBadges host-name="sf-vue-host" framework="Vue" />
    </header>
    <div class="sfh-body">
      <aside class="sfh-menu">
        <RouterLink to="/component-level">页面1 · 组件级联邦</RouterLink>
        <RouterLink to="/app-bridge">页面2 · 应用级桥接</RouterLink>
        <RouterLink to="/compare">页面3 · 对比说明</RouterLink>
      </aside>
      <main class="sfh-main">
        <RouterView />
      </main>
    </div>
  </div>
</template>
