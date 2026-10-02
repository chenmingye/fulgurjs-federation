<template>
  <div class="selfcheck">
    <h1>sh-remote-b 自检页</h1>
    <ul class="selfcheck-list">
      <li>容器名：<b>sh-remote-b</b>（dev 端口 5345）</li>
      <li>声明依赖：nanostores <b>0.6.0</b>（旧版本，专用于演示版本协商）、vue ^3.5.13</li>
      <li>exposes：./RemoteCounter</li>
      <li>独立运行时使用本应用自己的 nanostores 0.6.0 副本；被宿主消费时 singleton 协商实际命中宿主提供的 0.11.4</li>
    </ul>
    <RemoteCounter />
    <p class="selfcheck-hint">
      下方组件尝试跨远程加载 sh-remote-a/store——独立打开本页时预期显示「无法跨远程加载」的诚实提示，属正常行为；
      在宿主页面（:5344）中该组件参与三方同实例演示。
    </p>
  </div>
</template>

<script setup lang="ts">
import RemoteCounter from './exposes/RemoteCounter.vue'
</script>

<style>
.selfcheck { font-family: system-ui, -apple-system, 'PingFang SC', sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; color: #1f2329; }
.selfcheck h1 { font-size: 20px; }
.selfcheck-list { font-size: 13px; line-height: 2; color: #5b6470; }
.selfcheck-hint { font-size: 12px; color: #8a919f; margin-top: 16px; line-height: 1.8; }
</style>
