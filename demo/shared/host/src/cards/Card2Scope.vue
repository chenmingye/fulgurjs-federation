<template>
  <DemoCard
    no="②"
    title="共享作用域观测：shareScopeMap 实时快照"
    description="运行时共享注册表（share scope → 共享键 → 版本 → 提供方）实时展示。版本协商实际命中结果可在此核对：谁提供、哪个版本被 picked、哪份已加载。"
    api="getRuntime().shareScopeMap / window.__FULGURJS_SCOPE__"
    source="host/src/demo/scope.ts"
  >
    <ul class="decl-list">
      <li v-for="decl in DECLARED_NANOSTORES_VERSIONS" :key="decl.app">
        {{ decl.app }}（:{{ decl.port }}）声明 nanostores <b>{{ decl.version }}</b>——{{ decl.note }}
      </li>
    </ul>
    <details open>
      <summary>shareScopeMap 实时快照（每 1.5s 自动刷新；已裁剪 get 函数与模块实例 value，仅保留协商元数据）</summary>
      <pre class="scope-json">{{ text }}</pre>
    </details>
    <p class="note">
      预期：default.nanostores 下有 0.11.4（from sh-host，loaded: true）与 0.6.0（from sh-remote-b，未加载）两个候选；
      remote-a 声明的 0.11.4 因 first-wins（已注册版本永不替换）不会重复出现。
      singleton 裁决实际命中 0.11.4 ← sh-host，remote-b 的 0.6.0 注册后不被采用。
      等价调试出口：window.__FULGURJS_SCOPE__（与 shareScopeMap 是同一对象）。
    </p>
  </DemoCard>
</template>

<script setup lang="ts">
/** 卡片②：shareScopeMap 实时观测（定时刷新 + 快照裁剪避免循环引用） */
import { onMounted, onUnmounted, ref } from 'vue'
import { shareScopeMap } from '@fulgurjs/federation/runtime'
import DemoCard from './DemoCard.vue'
import { formatScope } from '../demo/scope'
import { DECLARED_NANOSTORES_VERSIONS } from '../demo/meta'

const text = ref('')
let timer: number | undefined

function refresh(): void {
  text.value = formatScope(shareScopeMap)
}

onMounted(() => {
  refresh()
  timer = window.setInterval(refresh, 1500)
})

onUnmounted(() => window.clearInterval(timer))
</script>
