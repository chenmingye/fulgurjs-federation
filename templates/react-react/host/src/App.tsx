import { remoteComponent } from '@fulgurjs/federation/react'

// remoteComponent：首次渲染才真正加载远程模块；失败时插件呈现默认错误占位
// （含「重试加载 / 刷新页面重试」），无需自己实现错误组件。
const RemoteButton = remoteComponent('react-remote/ClickButton')

/** 宿主首页：演示单个远程组件消费（按需懒加载） */
export default function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h2>宿主首页</h2>
      <p>
        下面的按钮来自 react-remote（<code>./ClickButton</code> expose）。
        仅在进入本页时按需加载——首页不会批量预取未访问的远程页面。
      </p>
      <RemoteButton />
    </div>
  )
}
