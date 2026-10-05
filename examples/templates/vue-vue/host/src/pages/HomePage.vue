<template>
  <div>
    <h2>宿主首页</h2>
    <p>下面的按钮来自 vue-remote（<code>./ClickButton</code> expose）。
      仅在进入本页时按需加载——首页不会批量预取未访问的远程页面。</p>
    <RemoteButton />
  </div>
</template>

<script setup lang="ts">
import { remoteComponent } from '@fulgurjs/federation/vue'

// remoteComponent：首次渲染才真正加载远程模块；失败时插件呈现默认错误占位
// （含「重试加载 / 刷新页面重试」），无需自己实现错误组件。
const RemoteButton = remoteComponent('vue-remote/ClickButton')
</script>
