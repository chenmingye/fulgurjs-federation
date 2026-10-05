<!--
 * @FilePath: /fulgurjs-federation/fixtures/remote-a/src/exposes/FormSection.vue
 * @Description: 全局注册组件样例——只经 setup globalComponents 声明进入消费方注册表，
 * 不被任何 expose 直接 import（模拟业务表单依赖 app.use(X) 全局注册的真实形态）。
-->
<template>
  <fieldset data-testid="f-form-section" class="f-section">
    <legend>{{ title }}</legend>
    <slot />
  </fieldset>
</template>

<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<style scoped>
.f-section {
  border: 1px solid #d4380d;
  border-radius: 4px;
  padding: 8px 12px;
  margin: 0 0 12px;
}
.f-section legend {
  padding: 0 6px;
  color: #d4380d;
  font-weight: 600;
}
</style>
