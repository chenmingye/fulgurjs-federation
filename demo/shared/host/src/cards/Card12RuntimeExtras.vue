<template>
  <DemoCard
    no="⑫"
    title="运行时补充 API：initSharing / registerRemotes / getLoadedShare / pinLoadedShare / clearSessionState"
    description="这五个公开导出在前 11 张卡中没有独立消费位：initSharing 手动初始化共享作用域（返回值与 shareScopeMap 同一引用）；registerRemotes 批量注册动态远程；getLoadedShare / pinLoadedShare 同步快照与登记（以对象严格相等为证）；clearSessionState 清理远程会话代次（onSession 重跑为证）。"
    api="initSharing / registerRemotes / getLoadedShare / pinLoadedShare / clearSessionState（@fulgurjs/federation/runtime）"
    source="host/src/cards/Card12RuntimeExtras.vue、remote-a/src/fulgurjs/setup.ts"
  >
    <div class="x12-actions">
      <button class="btn" type="button" @click="runInitSharing" :disabled="busy">① initSharing('default')</button>
      <button class="btn" type="button" @click="runRegisterRemotes" :disabled="busy">② registerRemotes 批量注册</button>
      <button class="btn" type="button" @click="runLoadedShare" :disabled="busy">③ loadShare + getLoadedShare 严格相等</button>
      <button class="btn" type="button" @click="runPin" :disabled="busy">④ pinLoadedShare 收敛观测</button>
      <button class="btn ghost" type="button" @click="runClearSession" :disabled="busy">⑤ onSession → clearSessionState → 新代次</button>
    </div>

    <ol class="x12-log">
      <li v-for="(line, i) in logLines" :key="i" :class="line.kind">{{ line.text }}</li>
    </ol>
    <p v-if="error" class="err">出错：{{ error }}</p>
  </DemoCard>
</template>

<script setup lang="ts">
/**
 * 卡片⑫：前 11 卡未独立消费的五个公开运行时导出（API 矩阵核销专用，全部真调用真观测）。
 * - initSharing：幂等初始化；返回值与 shareScopeMap 引用全等。
 * - registerRemotes：批量注册（卡片④ registerRemote 的批量形态）——注册后 loadRemote 真实走通。
 * - getLoadedShare：同步快照取「已协商加载」实例——与 loadShare 结果严格相等（对象身份证据，
 *   不依赖相同字符串/Symbol 描述/人为 globalThis 标志）。
 * - pinLoadedShare：登记本地实例后 loadShare 收敛到同一份（严格相等）。
 * - clearSessionState：清空 setup 会话代次——配合 remote-a 的 onSession 记录观测新代次重跑。
 */
import { ref } from 'vue'
import {
  clearSessionState,
  getLoadedShare,
  initSharing,
  loadRemote,
  loadShare,
  provideAppContext,
  registerRemotes,
  shareScopeMap,
  version,
} from '@fulgurjs/federation/runtime'
import DemoCard from './DemoCard.vue'

type LineKind = 'ok' | 'info' | 'err'
const logLines = ref<Array<{ kind: LineKind; text: string }>>([])
const busy = ref(false)
const error = ref('')
const say = (kind: LineKind, text: string) => logLines.value.push({ kind, text })

async function runInitSharing(): Promise<void> {
  busy.value = true
  try {
    const returned = initSharing('default')
    const same = returned === shareScopeMap
    say(same ? 'ok' : 'err', `initSharing('default') 返回值 === shareScopeMap：${same ? '同一引用 ✓' : '不一致 ✗'}（runtime ${version}）`)
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = false
  }
}

interface SetupLogEntry { phase: string; sessionKey?: string; at: string }

async function runRegisterRemotes(): Promise<void> {
  busy.value = true
  try {
    registerRemotes([{ name: 'sh-remote-b-dyn', entry: 'http://localhost:5345/@fulgurjs-entry.js', timeout: 8000, retries: 1 }])
    const mod = (await loadRemote('sh-remote-b-dyn/store')) as { increment?: () => number }
    const value = typeof mod?.increment === 'function' ? mod.increment() : JSON.stringify(mod)?.slice(0, 60)
    say('ok', `registerRemotes 注册 sh-remote-b-dyn → loadRemote('sh-remote-b-dyn/store') 走通：${String(value)}`)
  } catch (e) {
    say('err', `registerRemotes/loadRemote 失败：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    busy.value = false
  }
}

async function runLoadedShare(): Promise<void> {
  busy.value = true
  try {
    const viaLoad = await loadShare('nanostores')
    const snapshot = getLoadedShare('nanostores', { shareScope: 'default', shareKey: 'nanostores', requiredVersion: false, singleton: true })
    const same = viaLoad === snapshot
    say(same ? 'ok' : 'err', `getLoadedShare 同步快照 === loadShare 结果：${same ? '严格相等 ✓（对象身份证据）' : '不一致 ✗'}`)
  } catch (e) {
    say('err', `loadShare/getLoadedShare 失败：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    busy.value = false
  }
}

async function runPin(): Promise<void> {
  busy.value = true
  try {
    const sentinel = { __pinnedProbe: `pin-${Date.now()}`, greet: (n: string) => `pinned:${n}` }
    pinShare('sh-pin-probe', sentinel)
    const got = (await loadShare('sh-pin-probe', { shareScope: 'default', shareKey: 'sh-pin-probe', requiredVersion: false })) as unknown
    const same = got === (sentinel as unknown)
    say(same ? 'ok' : 'err', `pinLoadedShare 登记 → loadShare 收敛到登记实例：${same ? '严格相等 ✓' : '不一致 ✗'}`)
  } catch (e) {
    say('err', `pin/loadShare 失败：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    busy.value = false
  }
}

async function runClearSession(): Promise<void> {
  busy.value = true
  try {
    const g = globalThis as { __SH_SETUP_LOG__?: SetupLogEntry[] }
    const before = (g.__SH_SETUP_LOG__ ?? []).length
    provideAppContext({ sessionKey: `demo-s1-${Date.now()}` })
    await loadRemote('sh-remote-a/utils')
    await new Promise((r) => setTimeout(r, 100))
    const mid = (g.__SH_SETUP_LOG__ ?? []).slice(before)
    say('info', `首次加载：setup/onSession 记录 +${mid.length} 条（${mid.map((m) => m.phase).join('→') || '无'}）`)
    clearSessionState()
    provideAppContext({ sessionKey: `demo-s2-${Date.now()}` })
    await loadRemote('sh-remote-a/utils')
    await new Promise((r) => setTimeout(r, 100))
    const after = (g.__SH_SETUP_LOG__ ?? []).slice(before + mid.length)
    const reran = after.some((m) => m.phase === 'onSession')
    say(reran ? 'ok' : 'err', `clearSessionState 后新代次 onSession 重跑：${reran ? '已观测 ✓' : '未观测到 ✗'}（记录 ${JSON.stringify(after.map((m) => `${m.phase}:${m.sessionKey ?? '-'}`))}）`)
  } catch (e) {
    say('err', `clearSessionState 观测失败：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    busy.value = false
  }
}

// pinLoadedShare 需要完整 SharedHint 形参；此处与卡片内探针共用一组口径
import { pinLoadedShare } from '@fulgurjs/federation/runtime'
function pinShare(key: string, ns: unknown): void {
  pinLoadedShare(key, { shareScope: 'default', shareKey: key, requiredVersion: false }, '0.0.0-probe', ns as Record<string, unknown>)
}
</script>

<style scoped>
.x12-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 10px; }
.x12-log { margin: 0; padding-left: 20px; display: grid; gap: 4px; font-size: 13px; }
.x12-log li.ok { color: #1677ff; }
.x12-log li.info { color: #555; }
.x12-log li.err { color: #c45656; }
</style>
