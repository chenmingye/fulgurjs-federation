import { useEffect, useRef, useState } from 'react'
import { createBrowserRouter, Link, RouterProvider, useLocation } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import { createReactBridgeApp } from '@fulgurjs/federation/react'
import { createReactBridgeNavigation } from '@fulgurjs/federation/react'
import { provideAppContext, version as runtimeVersion } from '@fulgurjs/federation/react'

provideAppContext({
  sessionKey: 'react-host:alice',
  user: { name: 'alice', from: 'react-host' },
  token: 'fakeToken1',
})

const BridgeJeecgB = createReactBridgeApp('jeecg-b/bridge', {
  retries: 0,
  getContext: () => ({
    sessionKey: 'react-host:alice',
    user: { name: 'alice', from: 'react-host' },
    token: 'fakeToken1',
  }),
})

function Home(): React.ReactNode {
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h2>React 宿主（react-host, 5374）</h2>
      <p>runtime version：{runtimeVersion} · 容器名 jeecg-react-host</p>
      <p>
        本页演示 <b>React 宿主嵌入完整 Vue 子应用（JeecgBoot 官方前端实例 B）</b>。
        <Link to="/jeecg-b" style={{ marginLeft: 8 }}>进入 Jeecg-B →</Link>
      </p>
      <p>URL 同步 basePath=/jeecg-b：B 内菜单/页签/路由变化都会写入本页浏览器历史。</p>
    </div>
  )
}

function BridgePage(): React.ReactNode {
  const loc = useLocation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [mountCount, setMountCount] = useState(0)
  useEffect(() => {
    // 真实观测：容器内出现子应用根节点即计一次（路由变化不应增加）
    const el = containerRef.current
    if (!el) return
    const mo = new MutationObserver(() => {
      if (el.querySelector('[data-jeecg-bridge-root]') || el.firstElementChild) setMountCount((n) => n + 1)
    })
    mo.observe(el, { childList: true, subtree: false })
    return () => mo.disconnect()
  }, [])
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <p style={{ margin: '0 0 8px' }}>
        <Link to="/">← 宿主首页</Link>
        <span style={{ marginLeft: 12 }}>宿主位置：<code>{loc.pathname}</code></span>
        <span style={{ marginLeft: 12 }}>容器内容变更事件：<b>{mountCount}</b></span>
      </p>
      <div ref={containerRef} data-fulgurjs="react-host-embeds-jeecg-b" style={{ border: '2px dashed #722ed1', borderRadius: 10, padding: 8, minHeight: 520 }}>
        <BridgeJeecgB
          appProps={{ token: 'fakeToken1', user: 'alice', depth: 0, onReady: () => setMountCount((n) => n + 1) }}
          sessionKey="react-host:alice"
          routing={{ basePath: '/jeecg-b', navigation: navPort }}
        />
      </div>
    </div>
  )
}

const router = createBrowserRouter(
  [
    { path: '/', element: <Home /> },
    { path: '/jeecg-b/*', element: <BridgePage /> },
  ],
  // 子目录部署：RR7 的 location.pathname 含 basename，宿主导航端口依赖剥前缀后的逻辑路径
  { basename: '/jeecg-react-host' },
)

// 宿主导航端口：读 createBrowserRouter 实例（data router，RR7 协议要求）
// 子目录部署（basename /jeecg-react-host）：端口必须同源传 basename，否则 getLocation 返回带前缀路径，
// 通道前缀匹配失败 → 子应用导航全部被拒、宿主地址不更新（showcase routing.ts 同款口径）
const navPort = createReactBridgeNavigation(router, { basename: '/jeecg-react-host' })

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
