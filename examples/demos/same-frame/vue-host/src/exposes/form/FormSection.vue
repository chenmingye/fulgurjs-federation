<!--
 * @FilePath: /fulgurjs-federation/examples/demos/same-frame/vue-host/src/exposes/form/FormSection.vue
 * @Description: 表单分节组件——只经 setup globalComponents 声明进入消费方注册表，
 * 模拟业务里依赖 app.use(X) 全局注册的 UI 组件（如 <a-divider>）的真实形态：
 * 不被 expose 的表单组件直接 import。
-->
<template>
  <fieldset class="sfh-form-section" data-testid="sf-form-section">
    <legend>{{ title }}</legend>
    <slot />
  </fieldset>
</template>

<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<style scoped>
.sfh-form-section {
  border: 1px solid #d4380d;
  border-radius: 4px;
  padding: 10px 12px;
  margin: 0 0 14px;
}
.sfh-form-section legend {
  padding: 0 6px;
  color: #d4380d;
  font-weight: 600;
}
</style>
