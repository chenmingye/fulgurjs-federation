/**
 * demo/bridge-router/react-remote/src/pages/Settings.tsx — 设置页（本地状态表单，状态刻意不进 URL）。
 * 修改直写模块级 settings-store（write-through）：路由往返后仍保留 → 佐证子应用 store 未重建。
 */
import { useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { settingsState } from '../settings-store'

export default function Settings(): ReactElement {
  const [nickname, setNickname] = useState(settingsState.nickname)
  const [notifyEnabled, setNotifyEnabled] = useState(settingsState.notifyEnabled)
  const [theme, setTheme] = useState(settingsState.theme)

  const handleNicknameChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setNickname(event.target.value)
    settingsState.nickname = event.target.value
  }

  const handleNotifyChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setNotifyEnabled(event.target.checked)
    settingsState.notifyEnabled = event.target.checked
  }

  const handleThemeChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    setTheme(event.target.value as 'light' | 'dark')
    settingsState.theme = event.target.value as 'light' | 'dark'
  }

  return (
    <section style={{ padding: '8px 0' }}>
      <h3 style={{ margin: '4px 0' }}>设置（子应用路由 /settings，本地状态）</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0', maxWidth: 320 }}>
        <label>昵称：<input value={nickname} onChange={handleNicknameChange} /></label>
        <label>
          <input type="checkbox" checked={notifyEnabled} onChange={handleNotifyChange} /> 接收通知
        </label>
        <label>
          主题：
          <select value={theme} onChange={handleThemeChange}>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
      </div>
      <p style={{ color: '#666', fontSize: 13, margin: '4px 0' }}>
        本表单为子应用本地状态（不在 URL 中）。路由往返后设置仍在 → 子应用未重挂、store 未重建。
      </p>
    </section>
  )
}
