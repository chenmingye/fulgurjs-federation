<script setup lang="ts">
defineProps<{ label: string; mode: 'standalone' | 'bridge' }>()
</script>
<template>
  <section style="padding:16px;border:1px solid #42b883">
    <h1>{{ label }} · {{ mode }}</h1>
    <nav><RouterLink to="/">首页</RouterLink> | <RouterLink to="/about">关于</RouterLink> | <RouterLink v-if="mode === 'standalone'" to="/child">内嵌子应用</RouterLink></nav>
    <RouterView />
  </section>
</template>
