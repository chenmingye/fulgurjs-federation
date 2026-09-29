import ClickButton from '../ClickButton'

/** 联邦页面：渲染在宿主的路由出口内 */
export default function HomePage() {
  return (
    <div data-testid="demo-remote-home">
      <h3>react-remote / 首页</h3>
      <p>这是由 react-remote 暴露的联邦页面。</p>
      <ClickButton />
    </div>
  )
}
