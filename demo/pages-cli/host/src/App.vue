<template>
  <div class="pc-shell">
    <header class="pc-header">
      <h1>页面清单、类型与 CLI（pc-host · :5364）</h1>
      <nav class="pc-nav">
        <RouterLink to="/">诊断面板</RouterLink>
        <RouterLink to="/pc/orders">订单列表（远程）</RouterLink>
        <RouterLink to="/pc/orders/42?tab=basic">订单详情 :id（远程）</RouterLink>
        <RouterLink to="/pc/dashboard">数据看板 keepAlive（远程）</RouterLink>
      </nav>
    </header>
    <main class="pc-main">
      <!-- keepAliveNames = 页面表 keepAlive: true 条目的包装组件名，与实际缓存一致 -->
      <RouterView v-slot="{ Component, route }">
        <KeepAlive :include="hostPages.keepAliveNames">
          <component :is="Component" :key="route.fullPath" />
        </KeepAlive>
      </RouterView>
    </main>
  </div>
</template>

<script setup lang="ts">
import { hostPages } from './fulgurjs/host/pages'
</script>

<style>
body {
  margin: 0;
  background: #f6f8fa;
  color: #243b53;
  font-family: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
}
#app {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 16px 32px;
}
a {
  color: #2464c5;
}
code {
  background: #eef2f7;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 12px;
  word-break: break-all;
}
pre {
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
.pc-header h1 {
  font-size: 20px;
  margin: 20px 0 8px;
}
.pc-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}
.pc-main {
  min-height: 240px;
}
.pc-panel {
  background: #fff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 14px;
}
.pc-panel > h2 {
  font-size: 15px;
  margin: 0 0 10px;
}
.pc-panel small {
  color: #627d98;
  font-weight: 400;
}
.pc-kv {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 6px 12px;
  margin: 0 0 10px;
}
.pc-kv dt {
  color: #627d98;
}
.pc-kv dd {
  margin: 0;
}
.pc-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.pc-table {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 10px;
}
.pc-table th,
.pc-table td {
  border: 1px solid #e2e8f0;
  padding: 5px 10px;
  text-align: left;
  font-size: 13px;
}
.pc-table th {
  background: #f0f4f8;
}
.pc-hint {
  color: #627d98;
  font-size: 12px;
  line-height: 1.7;
  margin: 6px 0 0;
}
.pc-error {
  border: 1px solid #f3c1c1;
  background: #fef0f0;
  color: #b03a3a;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
  font-size: 13px;
  line-height: 1.7;
}
.pc-ok {
  border: 1px solid #bce0c5;
  background: #eef8f0;
  color: #2b6e3f;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 10px;
  font-size: 13px;
}
.pc-json {
  background: #0f2438;
  color: #cfe3f5;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  max-height: 320px;
  overflow: auto;
  margin: 0 0 10px;
}
.pc-violation {
  border: 1px solid #f0d9a0;
  background: #fdf7e7;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 8px;
  font-size: 12px;
  line-height: 1.7;
}
.pc-violation--error {
  border-color: #f3c1c1;
  background: #fef0f0;
}
</style>
