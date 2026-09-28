import { useState } from 'react'

export interface ButtonProps {
  label: string
  onClick?: () => void
}

export default function Button({ label, onClick }: ButtonProps) {
  const [count, setCount] = useState(0)
  return (
    <button type="button" onClick={() => { setCount((c) => c + 1); onClick?.() }}>
      {label}：已点击 {count} 次
    </button>
  )
}
