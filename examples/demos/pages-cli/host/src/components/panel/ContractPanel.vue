<template>
  <section class="pc-panel">
    <h2>⑤ 宿主页面表 ↔ 远程 manifest 契约 <small>呼应 CLI check-pages 的核对逻辑</small></h2>

    <p v-if="state === 'unreachable'" class="pc-error">
      远程 dev manifest 不可达（{{ manifestUrl }}）——远程 dev server 未启动时如实展示，不假装通过。
      CLI 侧对应「无法验证」（unverified）语义；manifest 来源可显式指定：
      <code>npx @fulgurjs/federation check-pages --manifest pc-remote=&lt;路径或URL&gt;</code>。
    </p>

    <template v-if="state === 'ready'">
      <p class="pc-hint" style="margin-bottom: 6px">
        远程 dev manifest（{{ manifestUrl }}）exposes 键与宿主页面表 spec 逐条对照——
        这正是 <code>fulgurjs check-pages</code> 自动化的核对（本面板只读 dev manifest 做实时演示；
        CLI 还支持 --site/prod 推导与本地 dist 文件，且报告「无法验证」而非假装通过）。
      </p>
      <table class="pc-table">
        <thead>
          <tr><th>宿主页面</th><th>spec（normSpec 后）</th><th>在远程 exposes 中？</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.route">
            <td><code>{{ row.route }}</code></td>
            <td><code>{{ row.spec }}</code></td>
            <td>{{ row.hit ? '✓ 一致' : '✗ 缺失（R3/MFU-006 语义）' }}</td>
          </tr>
        </tbody>
      </table>
      <pre class="pc-json">远程 exposes（{{ exposes.length }}）：{{ JSON.stringify(exposes, null, 2) }}</pre>
    </template>

    <p class="pc-hint">
      契约的两侧：宿主 fulgurjs.config.ts 具名导出 hostPages（本应用 src/fulgurjs/pages.data.ts——
      与运行时 createHostPages 同一份数据模块）；远程 fulgurjs.config.ts 也具名导出同构 hostPages
      （examples/demos/pages-cli/remote/src/fulgurjs/pages.data.ts，内容一致表达「同源」）。分别在两个工程根目录跑
      <code>npx @fulgurjs/federation explain</code> 可以看到两侧的页面 spec 映射；
      <code>npx @fulgurjs/federation check-pages --manifest pc-remote=http://localhost:5363/fulgurjs-manifest.json</code>
      则在宿主侧自动完成本面板的对照（远程 dist 已构建时，脚本会改用本地 dist 的 prod manifest 真实核对）。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import fulgurjsConfig from '../../../fulgurjs.config.ts'
import { pages, remotePrefixes } from '../../fulgurjs/pages.data'
import { hostPages } from '../../fulgurjs/host/pages'

type ManifestState = 'loading' | 'ready' | 'unreachable'

const state = ref<ManifestState>('loading')
const exposes = ref<string[]>([])

// dev manifest URL 由 remotes 的 dev 地址推导（与运行时/CLI 同一拼接语义：<dev>/@fulgurjs-manifest.json）
const manifestUrl = computed(() => {
  const remote = fulgurjsConfig.remotes?.['pc-remote']
  const dev =
    typeof remote === 'string'
      ? remote
      : typeof remote === 'object' && remote !== null
        ? (remote.dev ?? '')
        : ''
  return `${dev.replace(/\/+$/, '')}/@fulgurjs-manifest.json`
})

const rows = computed(() =>
  pages.map((page) => {
    // resolve().spec 是「远程名/spec」限定形态；对照远程 exposes 键时按 remotePrefixes 剥离远程名前缀
    const qualified = (hostPages.resolve(page.route)?.spec ?? '').replace(/^[./]+/, '')
    const spec = Object.values(remotePrefixes).reduce(
      (s, name) => (s.startsWith(name + '/') ? s.slice(name.length + 1) : s),
      qualified,
    )
    return { route: page.route, spec, hit: exposes.value.includes(spec) }
  }),
)

onMounted(async () => {
  try {
    const res = await fetch(manifestUrl.value)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // manifest v1 的 exposes 是数组形态（{ name, src, file }[]）；兼容旧 Record 形态（键 → src）
    const manifest = (await res.json()) as { exposes?: Record<string, unknown> | Array<{ name?: string }> }
    const exposeList = Array.isArray(manifest.exposes)
      ? manifest.exposes.map((entry) => String(entry?.name ?? ''))
      : Object.keys(manifest.exposes ?? {})
    exposes.value = exposeList.map((key) => key.replace(/^[./]+/, ''))
    state.value = 'ready'
  } catch {
    state.value = 'unreachable'
  }
})
</script>
