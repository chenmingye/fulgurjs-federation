import { useContext, useEffect, useState } from 'react'
import ThemeContext from '../exposes/theme-context'
import { fetchGreeting } from '../api'

/** 远程页面：经宿主联邦加载。读取共享 Context（同一 expose 实例）与远程自身数据 */
export default function Home() {
  const theme = useContext(ThemeContext)
  const [greeting, setGreeting] = useState('…')
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
    </div>
  )
}
