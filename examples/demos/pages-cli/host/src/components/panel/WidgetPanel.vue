<template>
  <section class="pc-panel">
    <h2>⑦ 远程组件直渲染对照 <small>remoteComponent（页面适配器之外的普通组件通道）</small></h2>
    <div class="pc-row">
      <StatCard label="联邦错误码" value="44" />
      <StatCard label="远程 exposes" value="5" />
      <StatCard />
    </div>

    <p class="pc-hint">
      <code>const StatCard = remoteComponent('pc-remote/widgets/stat-card')</code> ——
      defineAsyncComponent + loadRemote 的标准封装，工厂必须放模块顶层（不能在 render 内重复调用）；
      首次渲染才加载，失败时内置三段式错误占位（错误码 + 根因 + 修法 + 重试按钮）。
      页面走 createHostPages（页面表/路由/保活），普通组件走 remoteComponent——两条通道互补。
    </p>
  </section>
</template>

<script setup lang="ts">
import { remoteComponent } from '@fulgurjs/federation/runtime'

// 工厂放模块顶层：模块求值时只创建包装组件，不触发任何远程加载
const StatCard = remoteComponent('pc-remote/widgets/stat-card')
</script>
