import { useContext, useEffect, useState } from 'react'
import ThemeContext from '../exposes/theme-context'
import { fetchGreeting } from '../api'

/** 远程页面：经宿主联邦加载。读取共享 Context（同一 expose 实例）与远程自身数据 */
export default function Home() {
  const theme = useContext(ThemeContext)
  const [greeting, setGreeting] = useState('…')
  // 本地交互状态：HMR 兼容组件更新后必须保留（R11 状态保留断言的载体）
  const [clicks, setClicks] = useState(0)
  useEffect(() => {
    let alive = true
    void fetchGreeting(theme.account).then((g) => {
      if (alive) setGreeting(g)
    })
    return () => { alive = false }
  }, [theme.account])
  return (
    <div data-testid="remote-home">
      <h2>remote-react / Home</h2>
      <p data-testid="home-theme">theme:{theme.theme}</p>
      <p data-testid="home-account">account:{theme.account}</p>
      <p data-testid="home-greeting">{greeting}</p>
      <p>
        <button type="button" data-testid="home-count" onClick={() => setClicks((c) => c + 1)}>
          计数 {clicks}
        </button>{' '}
        <button
          type="button"
          data-testid="home-refresh"
          onClick={() => { void fetchGreeting(theme.account).then(setGreeting) }}
        >
          重新问候
        </button>
      </p>
    </div>
  )
}
