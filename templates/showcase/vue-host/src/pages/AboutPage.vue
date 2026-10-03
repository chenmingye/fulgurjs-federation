<script setup lang="ts">
/**
 * demo/bridge-router/vue-host/src/pages/AboutPage.vue — 关于页：场景与工程说明。
 */
</script>

<template>
  <section>
    <h2>关于</h2>
    <p>demo/bridge-router：4 个独立 npm 工程 —— react-remote(5333)、vue-host(5334)、vue-remote(5335)、react-host(5336)。</p>
    <ul>
      <li>vue-host（:5334）套 react-remote（:5333），桥接前缀 basePath=/br-react</li>
      <li>react-host（:5336）套 vue-remote（:5335），桥接前缀 basePath=/br-vue</li>
    </ul>
    <p>API 与源码对照、演示操作清单见 demo/bridge-router/README.md。</p>
  </section>
</template>
