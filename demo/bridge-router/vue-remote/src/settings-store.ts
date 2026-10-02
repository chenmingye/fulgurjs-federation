/**
 * demo/bridge-router/vue-remote/src/settings-store.ts — 设置页本地状态（模块级 reactive，刻意不写入 URL）。
 * 子应用 root 不重挂 → 模块不重建：路由往返后设置仍保留，佐证「内部状态跨路由保留」。
 */
import { reactive } from 'vue'

export interface SettingsState {
  nickname: string
  notifyEnabled: boolean
  theme: 'light' | 'dark'
}

export const settingsState = reactive<SettingsState>({ nickname: '张三', notifyEnabled: true, theme: 'light' })
