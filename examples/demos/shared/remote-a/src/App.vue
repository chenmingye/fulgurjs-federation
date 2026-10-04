<template>
  <div class="selfcheck">
    <h1>sh-remote-a 自检页</h1>
    <ul class="selfcheck-list">
      <li>容器名：<b>sh-remote-a</b>（dev 端口 5343）</li>
      <li>声明依赖：nanostores <b>0.11.4</b>（与宿主相同）、vue ^3.5.13</li>
      <li>exposes：./store、./CounterPanel、./ContextPanel、./demo-consumer、./utils</li>
      <li>独立运行时协商命中本应用自己的 nanostores 0.11.4；被宿主消费时协商命中宿主实例</li>
    </ul>
    <CounterPanel />
    <p class="selfcheck-hint">联邦消费方（examples/demos/shared/host）按 exposes 加载本应用模块；本页仅用于独立自检。</p>
  </div>
</template>

<script setup lang="ts">
import CounterPanel from './exposes/CounterPanel.vue'
</script>

<style>
.selfcheck { font-family: system-ui, -apple-system, 'PingFang SC', sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; color: #1f2329; }
.selfcheck h1 { font-size: 20px; }
.selfcheck-list { font-size: 13px; line-height: 2; color: #5b6470; }
.selfcheck-hint { font-size: 12px; color: #8a919f; margin-top: 16px; }
</style>
