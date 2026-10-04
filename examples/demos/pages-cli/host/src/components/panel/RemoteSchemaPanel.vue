<template>
  <section class="pc-panel">
    <h2>③ remoteSchema <small>dev 由插件探针填充；未经过插件转换时如实为空表（README 如实声明）</small></h2>
    <pre class="pc-json">{{ schemaText }}</pre>
    <p class="pc-hint">
      语义：<code>import { remoteSchema } from '@fulgurjs/federation/runtime'</code> 的具名静态导入在
      dev 下被插件改写到探针虚拟模块——启动后拉取远程 dev manifest 生成
      <code>{ [remote]: { exposes: string[], exists: boolean } }</code>（本页面 R3 校验的数据源）。
      exists: false / 空表时校验器诚实跳过 R3，不误报。<br />
      Node 直接导入（不经 Vite 插件转换）恒为空对象 <code>{}</code>——
      examples/demos/pages-cli/scripts/run-cli-checks.sh 第 6 步对该语义做了真实断言；build 期同样诚实降级为空表。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { remoteSchema } from '@fulgurjs/federation/runtime'

const schemaText = computed(() => JSON.stringify(remoteSchema, null, 2))
</script>
