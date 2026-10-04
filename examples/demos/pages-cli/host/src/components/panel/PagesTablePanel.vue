<template>
  <section class="pc-panel">
    <h2>① 页面表与路由解析 <small>createHostPages（definePages 校验后原样返回，不改写任何字段）</small></h2>
    <table class="pc-table">
      <thead>
        <tr><th>route</th><th>name</th><th>title</th><th>keepAlive</th><th>解析出的 spec（resolve）</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.route">
          <td><code>{{ row.route }}</code></td>
          <td>{{ row.name }}</td>
          <td>{{ row.title }}</td>
          <td>{{ row.keepAlive ? 'true' : '—' }}</td>
          <td><code>{{ row.spec }}</code></td>
        </tr>
      </tbody>
    </table>
    <div class="pc-row">
      <span>resolve 试用（含 base 剥离/参数解码/query）：</span>
      <code>hostPages.resolve('/pc/orders/42')</code>
      <span>→</span>
      <code>{{ sampleResolve }}</code>
    </div>
    <p class="pc-hint">
      keepAliveNames（KeepAlive include 白名单，包装组件名 Fulgurjs_&lt;remote&gt;_&lt;spec&gt;）：
      <code>{{ hostPages.keepAliveNames.join('、') || '（无）' }}</code>
      。路由注册见 src/main.ts——同一份页面表即路由来源。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { hostPages } from '../../fulgurjs/host/pages'

const rows = hostPages.pages.map((page) => ({
  route: page.route,
  name: typeof page.name === 'string' ? page.name : '—',
  title: typeof page.title === 'string' ? page.title : '—',
  keepAlive: page.keepAlive === true,
  spec: hostPages.resolve(page.route)?.spec ?? '（解析失败）',
}))

const sampleResolve = computed(() => JSON.stringify(hostPages.resolve('/pc/orders/42')))
</script>
