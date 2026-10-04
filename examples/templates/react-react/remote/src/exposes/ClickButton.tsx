import { useState } from 'react'

/** 可点击计数按钮：本地 state 保存在远程组件内部（宿主消费时运行在宿主页面的 React 上） */
export default function ClickButton() {
  const [count, setCount] = useState(0)
  return (
    <button
      data-testid="demo-remote-button"
      style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: '#1677ff', color: '#fff', cursor: 'pointer' }}
      onClick={() => setCount((c) => c + 1)}
    >
      远程按钮（点击了 {count} 次）
    </button>
  )
}
