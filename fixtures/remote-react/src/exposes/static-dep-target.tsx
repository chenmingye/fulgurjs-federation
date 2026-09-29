import { useState } from 'react'
// 静态依赖（独立 leaf 模块 → 生产构建拆出独立 chunk）：专测「expose 的静态依赖
// chunk 失败」恢复边界——facade 经 __fgR 重试换 URL 重取，leaf 的 URL 不变。
import { LEAF_ANSWER } from './static-dep-leaf'

export default function StaticDepTarget(): React.ReactNode {
  const [n] = useState(LEAF_ANSWER)
  return <p data-testid="static-dep-value">static-dep:{n}</p>
}
