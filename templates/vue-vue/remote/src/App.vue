<template>
  <div style="font-family: sans-serif; padding: 16px">
    <h1>vue-remote 独立运行</h1>
    <p>这是远程应用自己的壳，用于单独开发。联邦消费方（examples/vue/host）按 exposes 加载以下模块：</p>
    <ul>
      <li>./ClickButton —— 可点击计数按钮组件</li>
      <li>./utils —— 普通 TS 工具模块</li>
      <li>./pages/HomePage / ./pages/DetailPage —— 联邦页面</li>
    </ul>
    <ClickButton />
  </div>
</template>

<script setup lang="ts">
import ClickButton from './exposes/ClickButton.vue'
</script>
