<template>
  <div class="page">
    <header class="page-head">
      <h1>共享依赖与运行时能力（demo/shared）</h1>
      <p>
        宿主 <b>sh-host</b>（:5344）消费 <b>sh-remote-a</b>（:5343）与 <b>sh-remote-b</b>（:5345）。
        三端都安装真实第三方包 nanostores 并以
        <code>{ singleton: true, requiredVersion: false }</code> 参与共享协商：
        host/remote-a 声明 0.11.4（最新 0.x），remote-b 固定旧版 0.6.0——最终 singleton 裁决收敛到宿主实例。
      </p>
      <p>每个卡片都是真实操作：点击按钮触发真实 loadRemote / loadShare / registerRemote / preloadRemote，结果与错误均为运行时真实返回。</p>
    </header>
    <main class="cards">
      <Card1Instance />
      <Card2Scope />
      <Card3Hooks />
      <Card4DynamicRemote />
      <Card5Preload />
      <Card6ApiUtils />
      <Card7Alias />
      <Card8StrictVersion />
      <Card9RegisterShare />
      <Card10AppContext />
      <Card11Fallback />
      <Card12RuntimeExtras />
    </main>
  </div>
</template>

<script setup lang="ts">
/** demo/shared 演示宿主：11 张能力卡片（共享依赖协商 + 运行时 API 全景） */
import Card1Instance from './cards/Card1Instance.vue'
import Card2Scope from './cards/Card2Scope.vue'
import Card3Hooks from './cards/Card3Hooks.vue'
import Card4DynamicRemote from './cards/Card4DynamicRemote.vue'
import Card5Preload from './cards/Card5Preload.vue'
import Card6ApiUtils from './cards/Card6ApiUtils.vue'
import Card7Alias from './cards/Card7Alias.vue'
import Card8StrictVersion from './cards/Card8StrictVersion.vue'
import Card9RegisterShare from './cards/Card9RegisterShare.vue'
import Card10AppContext from './cards/Card10AppContext.vue'
import Card11Fallback from './cards/Card11Fallback.vue'
import Card12RuntimeExtras from './cards/Card12RuntimeExtras.vue'
</script>
