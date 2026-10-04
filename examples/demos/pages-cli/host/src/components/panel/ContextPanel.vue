<template>
  <section class="pc-panel">
    <h2>④ AppContext 与会话 <small>provideAppContext / clearAppContext / requireAppContext（README §9/§10）</small></h2>

    <div class="pc-row">
      <button type="button" @click="switchSession">切换会话（生成新 sessionKey）</button>
      <button type="button" @click="clearContext">清空上下文（clearAppContext）</button>
      <button type="button" @click="restoreContext">恢复上下文（重新 provide）</button>
      <button type="button" @click="refresh">刷新面板</button>
    </div>

    <dl class="pc-kv">
      <dt>当前 sessionKey</dt>
      <dd><code>{{ sessionKey ?? '（空——已清空）' }}</code></dd>
      <dt>context 键清单</dt>
      <dd><code>{{ contextKeys.join('、') || '（空）' }}</code></dd>
    </dl>

    <h3 style="font-size: 13px; margin: 8px 0 6px">远程 setup/onSession 调用记录（globalThis.__PC_SETUP_LOG__，console-free）</h3>
    <table v-if="setupLog.length" class="pc-table">
      <thead>
        <tr><th>时间</th><th>阶段</th><th>sessionKey</th><th>user</th></tr>
      </thead>
      <tbody>
        <tr v-for="(entry, i) in setupLog" :key="i">
          <td>{{ entry.at }}</td>
          <td>{{ entry.kind }}</td>
          <td><code>{{ entry.sessionKey ?? '—' }}</code></td>
          <td>{{ entry.user ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="pc-hint">暂无记录——首次 loadRemote 任意 pc-remote 模块后出现：setup 一条（应用级一次）+ onSession 一条（当前代次）。</p>

    <p class="pc-hint">
      操作清单：① 打开「订单列表」→ 出现 setup + onSession 各一条；② 「切换会话」→ 重新进入任一远程页
      （组件缓存按代次重建）→ onSession 再跑一条，setup 不重复；③ 「清空上下文」→ 已加载过的页面重新进入时，
      页面内 requireAppContext 抛 CC-001（去订单列表页看）；此时首次加载一个未打开过的远程页会得到
      MFU-013 占位（声明了 onSession 却缺 sessionKey），错误占位里点「重试加载」无效，先「恢复上下文」再重试即恢复。
    </p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { getAppContext } from '@fulgurjs/federation/runtime'
import { clearDemoContext, provideDemoContext } from '../../fulgurjs/host/bridge'

interface PcSetupLogEntry {
  at: string
  kind: 'setup' | 'onSession'
  sessionKey?: string
  user?: string
}

const sessionKey = ref<string | undefined>()
const contextKeys = ref<string[]>([])
const setupLog = ref<PcSetupLogEntry[]>([])

function readSetupLog(): PcSetupLogEntry[] {
  return ((globalThis as unknown as { __PC_SETUP_LOG__?: PcSetupLogEntry[] }).__PC_SETUP_LOG__ ?? []).slice()
}

function refresh(): void {
  const ctx = getAppContext() as Record<string, unknown>
  contextKeys.value = Object.keys(ctx)
  sessionKey.value = typeof ctx.sessionKey === 'string' ? ctx.sessionKey : undefined
  setupLog.value = readSetupLog()
}

function switchSession(): void {
  provideDemoContext()
  refresh()
}

function clearContext(): void {
  clearDemoContext()
  refresh()
}

function restoreContext(): void {
  provideDemoContext('s-demo-001-restored')
  refresh()
}

refresh()
</script>
