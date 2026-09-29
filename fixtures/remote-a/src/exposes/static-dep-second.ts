// 与 StaticDep.vue 共同静态 import leaf，使 leaf 在生产构建中独立成 chunk（D2 恢复闭环用）
import { LEAF_ANSWER } from './static-dep-leaf'
export const SECOND_LEAF = LEAF_ANSWER + 1
