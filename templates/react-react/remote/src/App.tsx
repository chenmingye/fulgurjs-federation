import ClickButton from './exposes/ClickButton'

/** 独立运行壳：联邦消费方按 exposes 加载下列模块 */
export default function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>react-remote 独立运行</h1>
      <ul>
        <li>./ClickButton —— 可点击计数按钮组件</li>
        <li>./utils —— 普通 TS 工具模块</li>
        <li>./pages/HomePage / ./pages/DetailPage —— 联邦页面</li>
      </ul>
      <ClickButton />
    </div>
  )
}
