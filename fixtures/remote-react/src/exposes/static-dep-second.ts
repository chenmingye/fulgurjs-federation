// 与 static-dep-target 共同静态 import leaf，使 leaf 在生产构建中独立成 chunk（B 验证用）
import { LEAF_ANSWER } from './static-dep-leaf'

export const SECOND_ANSWER = LEAF_ANSWER + 1
