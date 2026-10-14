import { useMemo, useState } from 'react'
import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router-dom'
import { defineApplication, createReactBridgeRouter, createReactBridgeApp, createReactBridgeNavigation } from '@fulgurjs/federation/react'

interface Props { label?: string }
function Home() {
  const [count, setCount] = useState(0)
  return <><p>本应用计数：{count}</p><button onClick={() => setCount(value => value + 1)}>+1</button></>
}
const Child = createReactBridgeApp('application-react/bridge')

export default defineApplication<Props>((props, { mode, routing, signal }) => {
  function Layout() {
    return <section style={{ padding: 16, border: '1px solid #61dafb' }}>
      <h1>{props.label ?? mode} · {mode}</h1>
      <nav><Link to="/">首页</Link> | <Link to="/about">关于</Link>{mode === 'standalone' && <> | <Link to="/child">内嵌子应用</Link></>}</nav>
      <Outlet />
    </section>
  }
  const routes = [{ element: <Layout />, children: [
    { path: '/', element: <Home /> }, { path: '/about', element: <p>真实关于页</p> },
  ] }]
  if (mode === 'bridge') {
    const connection = createReactBridgeRouter(routing!, routes, { signal })
    return { element: connection.element, dispose: connection.dispose }
  }
  function Host() {
    const navigation = useMemo(() => createReactBridgeNavigation(router, { basename: import.meta.env.BASE_URL }), [])
    return <Child appProps={{ label: '内嵌 React' }} routing={{ basePath: '/child', navigation }} />
  }
  const router = createBrowserRouter([{ ...routes[0], children: [...routes[0].children, { path: '/child/*', element: <Host /> }] }], { basename: import.meta.env.BASE_URL })
  // 原生 data router 和 root 都由本代次释放，独立启动也不遗留监听。
  return { element: <RouterProvider router={router} />, dispose: () => router.dispose() }
}, { routing: true })
