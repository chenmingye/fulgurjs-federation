<template>
  <section class="card">
    <header class="card-head">
      <h3 class="card-title">卡 {{ no }} · {{ title }}</h3>
      <span class="code-chip">预期错误码：{{ expectCode }}</span>
    </header>
    <p class="card-principle"><strong>注入原理：</strong>{{ principle }}</p>
    <div class="card-actions">
      <slot name="actions" />
    </div>
    <div class="card-stage">
      <slot name="stage" />
    </div>
    <div class="card-result">
      <slot name="result" />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 故障卡外壳：统一编号、标题、预期错误码徽标、注入原理说明与三个内容区
 * （操作按钮 / 注入舞台 / 结果展示）。纯展示容器，无业务逻辑。
 */
defineProps<{
  no: number
  title: string
  expectCode: string
  principle: string
}>()
</script>
