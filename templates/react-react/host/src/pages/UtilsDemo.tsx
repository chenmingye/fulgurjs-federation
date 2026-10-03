import type { ReactNode } from 'react'
import { useLoadRemote } from '@fulgurjs/federation/react'

interface RemoteUtils {
  DEMO_ANSWER: number
  sumNumbers: (...numbers: number[]) => number
  formatPrice: (yuan: number) => string
}

/** 普通 TS 模块调用演示：useLoadRemote 返回模块命名空间（loading/error/reload 内置） */
export default function UtilsDemo(): ReactNode {
  const { data, error, loading, reload } = useLoadRemote<RemoteUtils>('react-remote/utils')
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h2>普通 TS 模块调用</h2>
      {error ? (
        <p data-testid="demo-utils-error" style={{ color: '#c45656' }}>
          调用失败：{String((error as Error)?.message ?? error)}
        </p>
      ) : loading || !data ? (
        <p>加载中…</p>
      ) : (
        <ul data-testid="demo-utils-result">
          <li>sumNumbers(2, 3, 7) = {data.sumNumbers(2, 3, 7)}</li>
          <li>DEMO_ANSWER = {data.DEMO_ANSWER}</li>
          <li>formatPrice(12.5) = {data.formatPrice(12.5)}</li>
        </ul>
      )}
      <button data-testid="demo-utils-reload" onClick={() => void reload()}>重新调用</button>
    </div>
  )
}
