<template>
  <DemoCard
    no="⑩"
    title="AppContext：跨应用传值与函数引用"
    description="宿主已 provideAppContext({ user, getToken, sessionKey, api: { hello } })。remote-a 的面板组件 requireAppContext('user') 读取用户快照、直调宿主函数引用 api.hello。「登出」（clearAppContext）后重新渲染面板 → CC-001 三段式报错；「重新提供」后恢复。"
    api="provideAppContext / getAppContext / requireAppContext / clearAppContext"
    source="host/src/demo/appContextBridge.ts + remote-a/src/exposes/ContextPanel.vue"
  >
    <button class="btn warn" type="button" @click="logout">登出（clearAppContext）</button>
    <button class="btn" type="button" @click="login">重新提供（provideAppContext）</button>
    <div class="inst-box" style="margin-top: 10px">
      <RemoteAContext :key="renderKey" />
    </div>
    <p class="note">
      数据语义 = 传输层快照 + 函数引用（非响应式，与乾坤 props 同语义）：user 是提供时快照；
      api.hello 是函数引用，每次调用执行宿主最新闭包。存储本体即 window.__FULGURJS_APP_CONFIG__。
    </p>
  </DemoCard>
</template>

<script setup lang="ts">
/** 卡片⑩：AppContext 提供 / 校验读取 / 函数引用直调 / 登出清理 */
import { ref } from 'vue'
import { clearAppContext, remoteComponent } from '@fulgurjs/federation/vue'
import DemoCard from './DemoCard.vue'
import { provideDemoContext } from '../demo/appContextBridge'

const RemoteAContext = remoteComponent('sh-remote-a/ContextPanel')
const renderKey = ref(0)

function logout(): void {
  clearAppContext()
  renderKey.value += 1
}

function login(): void {
  provideDemoContext()
  renderKey.value += 1
}
</script>
