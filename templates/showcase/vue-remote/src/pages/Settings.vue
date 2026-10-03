<script setup lang="ts">
/**
 * demo/bridge-router/vue-remote/src/pages/Settings.vue — 设置页（本地状态表单，状态刻意不进 URL）。
 * v-model 直写模块级 settings-store：路由往返后仍保留 → 佐证子应用 store 未重建。
 */
import { settingsState } from '../settings-store'
</script>

<template>
  <section class="demo-page">
    <h3 class="demo-page-title">设置（子应用路由 /settings，本地状态）</h3>
    <div class="demo-form">
      <label>昵称：<input v-model="settingsState.nickname" /></label>
      <label><input v-model="settingsState.notifyEnabled" type="checkbox" /> 接收通知</label>
      <label>
        主题：
        <select v-model="settingsState.theme">
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </select>
      </label>
    </div>
    <p class="demo-muted">
      本表单为子应用本地状态（不在 URL 中）。路由往返后设置仍在 → 子应用未重挂、store 未重建。
    </p>
  </section>
</template>

<style scoped>
.demo-page { padding: 8px 0; }
.demo-page-title { margin: 4px 0; }
.demo-form { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; max-width: 320px; }
.demo-muted { color: #666; font-size: 13px; margin: 4px 0; }
</style>
