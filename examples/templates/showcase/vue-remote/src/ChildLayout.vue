<script setup lang="ts">
/**
 * examples/templates/showcase/vue-remote/src/ChildLayout.vue — 子应用根布局：导航演示按钮 + RouterView。
 * push/replace 走被 connectVueBridgeRouter 接管的 router.push/replace（经通道同步宿主 URL）；
 * go 委托宿主浏览器历史，不创建第二条独立历史。
 */
import { RouterView, useRouter } from 'vue-router'
import { getMountCount, reportNav } from './child-bus'

const router = useRouter()

const handlePushDemo = (): void => {
  const target = router.resolve('/orders?q=演示&page=2').fullPath
  reportNav('子应用 push/replace', 'push', target)
  void router.push(target)
}

const handleReplaceDemo = (): void => {
  reportNav('子应用 push/replace', 'replace', '/settings')
  void router.replace('/settings')
}

const handleGoBack = (): void => {
  reportNav('子应用 go', 'go', '-1')
  router.go(-1)
}

const handleGoForward = (): void => {
  reportNav('子应用 go', 'go', '1')
  router.go(1)
}
</script>

<template>
  <section class="demo-child">
    <p class="demo-child-title">
      <strong>Vue 子应用</strong>（受控 memory 路由）· 本会话挂载次数：{{ getMountCount() }}
    </p>
    <div class="demo-row">
      <button @click="handlePushDemo">子应用 push /orders?q=演示&amp;page=2</button>
      <button @click="handleReplaceDemo">子应用 replace /settings</button>
      <button @click="handleGoBack">子应用 go(-1)</button>
      <button @click="handleGoForward">子应用 go(1)</button>
    </div>
    <RouterView />
  </section>
</template>

<style scoped>
.demo-child { border-top: 1px dashed #ccc; margin-top: 8px; padding-top: 8px; }
.demo-child-title { margin: 4px 0; }
.demo-row { display: flex; gap: 8px; align-items: center; margin: 8px 0; flex-wrap: wrap; }
.demo-row button { cursor: pointer; }
</style>
