<script setup lang="ts">
/**
 * examples/templates/showcase/vue-remote/src/pages/Locked.vue — 锁定页（守卫放行后才可见）。
 * 前往本页的导航会被宿主守卫（Vue：异步 beforeEach；React：useBlocker）拦截，等待「继续/取消」。
 */
import { useRouter } from 'vue-router'
import { reportNav } from '../child-bus'

const router = useRouter()

const handleBack = (): void => {
  reportNav('子应用 Link', 'push', '/orders')
  void router.push('/orders')
}
</script>

<template>
  <section class="demo-page">
    <h3 class="demo-page-title">锁定页（子应用路由 /locked）</h3>
    <p>你能看到本页，说明宿主守卫选择了「继续」。</p>
    <p><button @click="handleBack">回工单列表</button></p>
  </section>
</template>

<style scoped>
.demo-page { padding: 8px 0; }
.demo-page-title { margin: 4px 0; }
</style>
