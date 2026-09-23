<template>
  <section data-testid="remote-counter" style="border: 1px solid #58b; padding: 12px">
    <p data-testid="remote-count">remote count: {{ count }} (x2 = {{ double }}, {{ refKind }})</p>
    <button data-testid="remote-inc" @click="count++">remote +1</button>
  </section>
</template>

<style scoped>
/* scoped CSS：manifest exposes[].css 收录与 loadRemote 样式预载的回归素材 */
p[data-testid='remote-count'] {
  background: #fef08a;
  padding: 4px 8px;
  border-radius: 4px;
}
</style>

<script setup lang="ts">
// 故意不 import ref/computed/isRef：由 unplugin-auto-import 注入（D6-4 缺陷场景）。
// 注入若绕过门面化，会静态绑定本应用本地 vue 副本 → 与宿主协商实例形成双响应性系统。
const count = ref(0)
const double = computed(() => count.value * 2)
const refKind = isRef(count) ? 'ref-ok' : 'ref-bad'
// 把注入来源的 ref/computed 暴露给测试，供与宿主侧做同实例比对
;(globalThis as any).__probe_remote_vue = { ref, computed }
</script>
