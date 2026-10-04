<template>
  <section class="pc-panel">
    <h2>⑥ 加载时序 <small>真实 dev 时序打点（不做假慢速）——骨架屏 delay 200ms 后才出现</small></h2>
    <div class="pc-row">
      <button type="button" @click="clearTrace">清空时序记录</button>
      <span class="pc-hint">然后从顶部导航进入任一远程页面（首次加载最明显；dev 冷启动预构建窗口会拉长时序，属 DEV-010 暂态）。</span>
    </div>
    <table v-if="traceEvents.length" class="pc-table">
      <thead>
        <tr><th>相对时间</th><th>来源</th><th>事件</th></tr>
      </thead>
      <tbody>
        <tr v-for="(event, i) in traceEvents" :key="i">
          <td>+{{ event.t - baseTime }}ms</td>
          <td>{{ event.source }}</td>
          <td>{{ event.label }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="pc-hint">暂无记录。</p>
    <p class="pc-hint">
      读法：骨架屏出现 = 该页异步组件加载超过了 createHostPages 的 delay 200ms（首次加载/换代重建时典型）；
      「远程页面 mounted」来自远程模块内部打点（globalThis.__PC_TRACE_PUSH__ 跨联邦共享，双方零 console）。
      已加载模块经 loadRemote 缓存复用，重复进入同页不再显示骨架屏——「切换会话」会重建组件缓存，可再次观察。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { clearTrace, traceEvents } from '../../fulgurjs/host/trace'

const baseTime = computed(() => traceEvents[0]?.t ?? 0)
</script>
