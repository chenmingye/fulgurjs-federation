// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { createElement, useState } from 'react'
import { defineBridgeApp } from '../src/bridge-app-react'

// 保留真实 renderer，只改变 CJS/ESM 导出形状，覆盖 Vite 6 + React 18 生产者形态。
vi.mock('react-dom/client', async (importOriginal) => ({
  createRoot: undefined,
  default: await importOriginal<typeof import('react-dom/client')>(),
}))

it('default-only renderer 完成真实提交、Hooks 交互与卸载', async () => {
  function Counter() {
    const [count, setCount] = useState(0)
    return createElement('button', { onClick: () => setCount(count + 1) }, `计数：${count}`)
  }
  const el = document.createElement('div')
  document.body.appendChild(el)
  const contract = defineBridgeApp(() => createElement(Counter))
  try {
    await contract.mount(el, {})
    expect(el.textContent).toBe('计数：0')
    el.querySelector('button')!.click()
    await vi.waitFor(() => expect(el.textContent).toBe('计数：1'))
    contract.unmount(el)
    expect(el.childElementCount).toBe(0)
  } finally {
    contract.unmount(el)
    el.remove()
  }
})
