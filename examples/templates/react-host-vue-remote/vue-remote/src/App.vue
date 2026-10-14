<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import type { BridgeVueProps } from './application'
const props = defineProps<BridgeVueProps>()
const route = useRoute()
const router = useRouter()
const mountTime = ref(new Date().toLocaleTimeString())
const count = ref(0)
onMounted(() => props.onReady?.())
</script>

<template>
  <section style="border:1px solid #42b883;border-radius:8px;padding:12px;font-family:sans-serif">
    <p style="font-weight:600;color:#42b883">Vue 子应用（挂载于 {{ mountTime }}）</p>
    <p data-testid="demo-vue-props">appProps.label = {{ props.label || '（未传）' }}</p>
    <p data-testid="demo-vue-route">路由：{{ route.path }}</p>
    <nav><button @click="router.push('/')">首页</button> <button @click="router.push('/about')">关于</button></nav>
    <button data-testid="demo-vue-counter" @click="count++">本地状态：{{ count }}</button>
    <RouterView />
  </section>
</template>
