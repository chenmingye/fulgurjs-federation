<script setup lang="ts">
/**
 * 远程表单页：「宿主 → 子应用 → 远程表单」三层链路的最内层消费点。
 * 子应用（本工程）经 remoteComponent 反向加载宿主暴露的审批表单（sf-vue-host/form/ApprovalForm），
 * 并以显式 props 传入业务数据——表单不读 window/URL 全局状态。
 * 表单模板里的 <sf-form-section> 依赖提供方全局注册：宿主 setup 的 globalComponents
 * 声明会在本组件加载时自动安装进本子应用 app（桥接态每次挂载新建 app 也能拿到）。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { remoteComponent } from '@fulgurjs/federation/vue'
import { getTicket, STATUS_LABELS } from '../store/tickets'

const RemoteApprovalForm = remoteComponent('sf-vue-host/form/ApprovalForm', { retries: 1 })

const route = useRoute()
const ticket = computed(() => {
  const id = Number(route.params.id ?? 101)
  const t = getTicket(Number.isFinite(id) ? id : 101)
  return {
    id: `TK-${t?.id ?? 101}`,
    title: t?.title ?? '登录页验证码不显示',
    owner: t?.assignee ?? '张伟',
    opinions: [
      { node: '提交节点', text: `状态：${STATUS_LABELS[t?.status ?? 'open']}` },
      { node: '一审（组长）', text: '信息完整，同意进入审批。' },
      { node: '二审（平台）', text: '按常规工单处理，注意回归范围。' },
    ],
  }
})
</script>

<template>
  <section class="sfc-remote-form">
    <h2>远程表单（宿主提供 · 子应用内嵌）</h2>
    <p class="sfc-note">
      本页属于子应用：表单组件来自宿主 sf-vue-host（remoteComponent 反向消费）。
      表单内分节线 <code>&lt;sf-form-section&gt;</code> 只在宿主的全局注册里声明——
      若消费方 app 没拿到注册，会渲染成无样式死元素；正确行为是看到带橙色边框的分节。
    </p>
    <RemoteApprovalForm :ticket="ticket" readonly />
  </section>
</template>

<style scoped>
.sfc-remote-form {
  padding: 12px 0;
}
.sfc-note {
  color: #595959;
}
</style>
