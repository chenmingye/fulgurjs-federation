<!--
 * @FilePath: /fulgurjs-federation/fixtures/host-vue/src/pages/FormGlobal.vue
 * @Description: 消费依赖全局注册组件的远程表单（6.1.0 globalComponents 测试页）。
 * remoteComponent 自动捕获当前渲染 app 传入 loadRemote；远程 setup 声明的
 * globalComponents 在每次加载时幂等注册——刷新（新 app 实例）后仍应正确解析。
-->
<template>
  <div data-testid="page-form-global">
    <button data-testid="form-global-load" @click="loaded = true">load remote-a/FormGlobal</button>
    <button data-testid="form-global-unload" @click="loaded = false">unload</button>
    <component :is="Comp" v-if="loaded" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { remoteComponent } from '@fulgurjs/federation/vue'

const Comp = remoteComponent('remote-a/FormGlobal')
const loaded = ref(false)
</script>
