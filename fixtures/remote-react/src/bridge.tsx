/**
 * React 子应用桥接契约（fixtures/remote-react）。
 * 宿主经 loadRemote('remote-react/bridge') 取本模块默认导出，整站挂载/卸载。
 * memory 路由两条页面，验证 BR02（Vue 宿主嵌 React 子应用、子应用内部路由切换生效）。
 * 组件实现在 bridge-ui.tsx（组件文件可 Fast Refresh；本契约文件的修改自动整页刷新）。
 */
import { MemoryRouter } from 'react-router-dom'
import { defineBridgeApp } from '@fulgurjs/federation/react'
import { BridgeRoot, Counter, OnReady } from './bridge-ui'

export default defineBridgeApp((props) => (
  <MemoryRouter>
    <OnReady onReady={(props as any).onReady} />
    <Counter />
    <BridgeRoot {...props} />
  </MemoryRouter>
))
