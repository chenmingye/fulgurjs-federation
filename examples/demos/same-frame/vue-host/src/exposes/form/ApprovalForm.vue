<!--
 * @FilePath: /fulgurjs-federation/examples/demos/same-frame/vue-host/src/exposes/form/ApprovalForm.vue
 * @Description: 匿名「远程审批表单」——宿主（表单提供方）expose 的表单组件。
 * 演示「宿主 → 子应用 → 远程表单」三层链路中的最内层：表单模板使用字符串标签
 * <sf-form-section>（依赖提供方全局注册，不直接 import）；消费方子应用经
 * remoteComponent 挂载本组件时，setup 声明的 globalComponents 自动安装进
 * 子应用 app 注册表，标签正确解析（未安装则渲染为无样式死元素）。
-->
<template>
  <div class="sfh-approval-form" data-testid="sf-approval-form">
    <sf-form-section title="基本信息">
      <div class="sfh-field"><span class="sfh-label">工单编号</span><span>{{ ticket?.id }}</span></div>
      <div class="sfh-field"><span class="sfh-label">工单标题</span><span>{{ ticket?.title }}</span></div>
      <div class="sfh-field"><span class="sfh-label">提交人</span><span>{{ ticket?.owner }}</span></div>
    </sf-form-section>
    <sf-form-section title="审批意见">
      <div v-for="op in ticket?.opinions ?? []" :key="op.node" class="sfh-field">
        <span class="sfh-label">{{ op.node }}</span>
        <span>{{ op.text }}</span>
      </div>
      <p v-if="readonly" class="sfh-note">只读模式（disabled）：仅回显，不提供编辑操作。</p>
    </sf-form-section>
  </div>
</template>

<script setup lang="ts">
/**
 * 显式 props 合同：由消费方（子应用页面）传入；不读取 window/URL 全局状态。
 */
interface ApprovalFormProps {
  /** 工单数据（消费方从自己的 store 取） */
  ticket?: {
    id: string
    title: string
    owner: string
    opinions: { node: string; text: string }[]
  }
  /** 只读模式：详情回显 */
  readonly?: boolean
}
defineProps<ApprovalFormProps>()
</script>

<style scoped>
.sfh-field {
  display: flex;
  gap: 10px;
  margin: 2px 0;
}
.sfh-label {
  min-width: 88px;
  color: #595959;
}
.sfh-note {
  margin: 6px 0 0;
  color: #8c8c8c;
}
</style>
