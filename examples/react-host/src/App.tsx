/**
 * react-host：一个文件看清 React 宿主的联邦用法。
 * ① 每个应用根目录一份 fulgurjs.config.ts（纯数据）；vite.config.ts 调 federation(fulgurjsConfig)
 * ② React 应用统一从 '@fulgurjs/federation/react' 导入（通用运行时 + React 适配 API）
 * ③ remoteComponent 工厂放模块顶层（首次渲染才加载）；页面用 createReactHostPages + component(spec)
 */
import { Link, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import {
  createReactHostPages,
  remoteComponent,
  remoteSchema,
  useLoadRemote,
} from '@fulgurjs/federation/react'
import { pages, remotePrefixes } from './federation/pages.data'

// 页面表（纯数据 + dev schema；R1–R5 校验与 Vue 完全一致）
const hp = createReactHostPages({ pages, remotePrefixes, schema: remoteSchema })

// 普通远程组件：模块顶层创建，不能在 render 内重复调用工厂
const RemoteButton = remoteComponent<{ label: string; onClick?: () => void }>('remote-react/Button', {
  fallback: <p>正在加载远程按钮…</p>,
})

// 页面组件：与 Vue 相同动词 component(spec)；路由层用 element 渲染
const RemoteHome = hp.component('remote-react/pages/home')
const RemoteDetail = hp.component<{ id: string; tab?: string }>('remote-react/pages/detail')

/** 普通远程模块：useLoadRemote（data/error/loading/reload；错误无默认占位，由宿主决定 UI） */
function UtilsPanel() {
  type Utils = { formatMoney(v: number, currency?: string): string }
  const { data, error, loading, reload } = useLoadRemote<Utils>('remote-react/utils')
  if (loading) return <p>utils 加载中…</p>
  if (error) return <button onClick={() => void reload()}>utils 加载失败，重试</button>
  return (
    <p>
      12.5 → {data?.formatMoney(12.5)}（<button onClick={() => void reload()}>reload</button>）
    </p>
  )
}

function DetailRoute() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  return <RemoteDetail id={id ?? ''} tab={sp.get('tab') ?? undefined} />
}

export default function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>react-host（fulgurjs example）</h1>
      <nav>
        <Link to="/">首页</Link> · <Link to="/remote-react/home">远程首页</Link> ·{' '}
        <Link to="/remote-react/detail/42?tab=basic">远程参数页</Link>
      </nav>
      <Routes>
        <Route path="/" element={<main>
          <p>宿主首页（远程组件按需加载）</p>
          <RemoteButton label="远程按钮" onClick={() => console.log('clicked')} />
          <UtilsPanel />
        </main>} />
        <Route path="/remote-react/home" element={<RemoteHome />} />
        <Route path="/remote-react/detail/:id" element={<DetailRoute />} />
      </Routes>
    </div>
  )
}
