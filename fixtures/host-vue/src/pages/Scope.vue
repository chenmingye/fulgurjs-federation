<template>
  <div data-testid="page-scope">
    <h2>Share Scope 实时状态</h2>
    <table data-testid="scope-table" border="1">
      <thead>
        <tr><th>scope</th><th>shareKey</th><th>version</th><th>from</th><th>eager</th><th>loaded</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.scope + row.key + row.version" :data-testid="`scope-${row.key}-${row.version}`">
          <td>{{ row.scope }}</td>
          <td>{{ row.key }}</td>
          <td>{{ row.version }}</td>
          <td>{{ row.from }}</td>
          <td>{{ row.eager }}</td>
          <td>{{ row.loaded }}</td>
        </tr>
      </tbody>
    </table>
    <h2>Remotes 状态</h2>
    <pre data-testid="remotes-info">{{ remotesInfo }}</pre>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const rows = ref<Array<Record<string, unknown>>>([])
const remotesInfo = ref('')

function collect() {
  const scope = (window as any).__FULGURJS_SCOPE__ ?? {}
  const out: Array<Record<string, unknown>> = []
  for (const [scopeName, byName] of Object.entries<Record<string, Record<string, any>>>(scope)) {
    for (const [key, versions] of Object.entries(byName)) {
      for (const [version, entry] of Object.entries(versions)) {
        out.push({ scope: scopeName, key, version, from: entry.from, eager: entry.eager, loaded: !!entry.loaded })
      }
    }
  }
  rows.value = out
  remotesInfo.value = JSON.stringify((window as any).__FULGURJS_INFO__?.remotes ?? {}, null, 2)
}

onMounted(() => {
  collect()
  setInterval(collect, 500)
})
</script>
