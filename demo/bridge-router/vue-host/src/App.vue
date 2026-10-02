<script setup lang="ts">
/**
 * demo/bridge-router/vue-host/src/App.vue — 宿主根布局：顶部导航 + 守卫横幅 + RouterView。
 * 「工单列表 / 设置」是直接跳子应用深链的菜单项：宿主 router.push 到 basePath 下的路径。
 */
import { RouterView, useRouter } from 'vue-router'
import GuardBanner from './GuardBanner.vue'
import { logNav } from './demo-log'

interface MenuItem {
  label: string
  path: string
}

const router = useRouter()

const menus: MenuItem[] = [
  { label: '首页', path: '/' },
  { label: '关于', path: '/about' },
  { label: '桥接演示页', path: '/br-react' },
  { label: '工单列表', path: '/br-react/orders' },
  { label: '设置', path: '/br-react/settings' },
]

const handleMenu = (item: MenuItem): void => {
  logNav('宿主菜单', `push ${item.path}`)
  void router.push(item.path)
}
</script>

<template>
  <div class="demo-shell">
    <GuardBanner />
    <nav class="demo-nav" aria-label="宿主导航">
      <button v-for="item in menus" :key="item.path" @click="handleMenu(item)">{{ item.label }}</button>
    </nav>
    <RouterView />
  </div>
</template>

<style>
/* 演示全局基础样式（非 scoped）：宿主与子应用同页渲染，统一观感 */
body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; margin: 0; }
.demo-shell { padding: 12px; max-width: 960px; margin: 0 auto; }
.demo-nav { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid #ddd; margin-bottom: 12px; flex-wrap: wrap; }
.demo-nav button { cursor: pointer; }
.demo-row { display: flex; gap: 8px; align-items: center; margin: 8px 0; flex-wrap: wrap; }
.demo-muted { color: #666; font-size: 13px; }
code { background: #f4f4f5; padding: 1px 4px; border-radius: 3px; }
</style>
