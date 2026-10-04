<template>
  <div style="font-family: sans-serif; padding: 16px">
    <h1>pc-remote 独立运行</h1>
    <p>
      这是远程应用自己的壳，用于单独开发。联邦消费方（examples/demos/pages-cli/host，端口 5364）按 exposes
      加载以下模块：
    </p>
    <ul>
      <li>./pages/orders / ./pages/orders-detail / ./pages/dashboard —— 联邦页面</li>
      <li>./widgets/stat-card —— 普通组件（remoteComponent 直渲染）</li>
      <li>./setup —— setup 生命周期文件的公开对照键（可加载 ≠ 生命周期执行）</li>
    </ul>
    <StatCard label="联邦接口数" value="44" />
  </div>
</template>

<script setup lang="ts">
import StatCard from './widgets/StatCard.vue'
</script>
