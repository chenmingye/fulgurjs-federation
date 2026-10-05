import { createHostPages, remoteSchema } from '@fulgurjs/federation/vue'
import { pages, remotePrefixes } from '../pages.data'
import PcSkeleton from '../../components/PcSkeleton.vue'
import { pushTrace } from './trace'

/**
 * 宿主页面适配器（README §10.1 完整接线）：
 * - 页面表经 definePages R1–R5 校验（ERROR 默认 throw，dev overlay 直接可见）；
 * - schema: remoteSchema —— dev 由插件探针填充（R3 校验数据源）；build/Node 直导入恒为
 *   空表，校验器诚实降级（R3 跳过，README 如实声明）；
 * - beforeLoad：每次页面模块实际加载前执行（宿主在此提供最新 context）；
 * - loadingComponent + delay 200：骨架屏占位（首次冷加载通常超 200ms，时序面板可见）；
 * - 组件缓存会话感知：sessionKey 变化（换账号/清空后重新提供）自动重建组件，
 *   下一次渲染重新走 beforeLoad → loadRemote → 新代次 onSession。
 */
export const hostPages = createHostPages({
  pages,
  remotePrefixes,
  schema: remoteSchema,
  beforeLoad: () => {
    pushTrace({ source: 'host', label: 'beforeLoad：远程页面模块加载前' })
  },
  loadingComponent: PcSkeleton,
  delay: 200,
})
