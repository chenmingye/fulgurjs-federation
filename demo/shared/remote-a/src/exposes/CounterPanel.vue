<template>
  <div class="ns-panel">
    <div class="ns-panel-title">remote-a 组件（sh-remote-a/CounterPanel）</div>
    <div class="ns-panel-count">计数：{{ count }}</div>
    <button class="ns-btn" type="button" @click="bumpCounter(1)">+1</button>
    <button class="ns-btn" type="button" @click="bumpCounter(5)">+5</button>
    <button class="ns-btn ns-btn-ghost" type="button" @click="resetCounter">清零</button>
    <ul class="ns-panel-meta">
      <li>实例标识：{{ instanceTag }}</li>
      <li>本组件 import 的 atom === store 导出工厂：{{ factorySame ? '一致（singleton 协商生效）' : '不一致' }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * remote-a 暴露的计数面板：静态引用 ../shared/counter（与 './store' expose 是同一模块实例）。
 * 被宿主加载时，本组件对 nanostores 的导入经共享协商收敛到作用域中已加载的宿主实例。
 */
import { onUnmounted, ref } from 'vue'
import { atom } from 'nanostores'
import { counter, bumpCounter, resetCounter, NS_INSTANCE, atomFactory } from '../shared/counter'

const count = ref(counter.get())
const instanceTag = String(NS_INSTANCE)
const factorySame = atom === atomFactory
// nanostores 0.11 API：subscribe 立即回调一次并返回退订函数（旧版 .sub 已移除）
const unsubscribe = counter.subscribe((value: number) => { count.value = value })

onUnmounted(() => unsubscribe())
</script>

<style scoped>
.ns-panel { font-size: 13px; line-height: 1.7; }
.ns-panel-title { font-weight: 600; margin-bottom: 6px; }
.ns-panel-count { font-size: 18px; font-weight: 700; color: #1677ff; margin: 6px 0; }
.ns-btn { border: 1px solid #1677ff; background: #1677ff; color: #fff; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; margin-right: 6px; }
.ns-btn-ghost { background: #fff; color: #1677ff; }
.ns-panel-meta { font-size: 12px; color: #5b6470; padding-left: 16px; margin: 8px 0 0; word-break: break-all; }
</style>
