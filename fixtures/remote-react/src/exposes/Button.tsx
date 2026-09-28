import { useState } from 'react'

export interface ButtonProps {
  label: string
  onClick?: () => void
}

/** 可交互远程按钮：useState 计数（Hooks 单实例探针）+ props 回调透传 */
export default function Button({ label, onClick }: ButtonProps) {
  const [count, setCount] = useState(0)
  return (
    <div data-testid="remote-button-wrap">
      <button
        type="button"
        data-testid="remote-button"
        onClick={() => {
          setCount((c) => c + 1)
          onClick?.()
        }}
      >
        {label}：已点击 {count} 次
      </button>
      <span data-testid="remote-count">{count}</span>
    </div>
  )
}
