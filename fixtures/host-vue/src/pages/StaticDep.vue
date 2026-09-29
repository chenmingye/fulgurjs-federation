<template>
  <div data-testid="page-static-dep">
    <button data-testid="static-dep-load" @click="loaded = true">load remote-a/StaticDep</button>
    <component :is="Comp" v-if="loaded" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { remoteComponent } from '@fulgurjs/federation/runtime'

// 经 remoteComponent 加载：失败时走插件默认错误占位（重试加载/刷新页面重试）
const Comp = remoteComponent('remote-a/StaticDep')
const loaded = ref(false)
</script>
