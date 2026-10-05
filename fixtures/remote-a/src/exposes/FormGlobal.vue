<!--
 * @FilePath: /fulgurjs-federation/fixtures/remote-a/src/exposes/FormGlobal.vue
 * @Description: 依赖全局注册组件的远程表单样例（6.1.0 globalComponents 回归）。
 * 模板只写字符串标签 <f-form-section>（模拟业务表单的 <a-divider>/<a-button>——
 * 依赖提供方 app 的全局注册，不直接 import）；消费方拿到注册前它会渲染成无样式死元素。
-->
<template>
  <div data-testid="form-global-root">
    <f-form-section title="基本信息">表单字段区</f-form-section>
    <f-form-section title="审批意见">审批内容区</f-form-section>
  </div>
</template>

<script setup lang="ts">
// 故意不 import FormSection：全局标签解析是本用例的被测行为
</script>
