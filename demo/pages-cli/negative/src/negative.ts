/**
 * 负向用例（本工程长期处于「预期编译失败」状态，由 `npm run verify` 管理）：
 * tsc --noEmit 必须失败，且错误信息包含下列三类预期关键字（verify.mjs 逐条断言）。
 *
 * 1) 引用不存在的远程模块类型 —— 'pc-remote/pages/ghost' 从未被远程 exposes，
 *    类型桩不存在 → TS2307（真实工程等价于 exposes 键拼错 / 远程未提供）
 * 2) 引用存在模块上不存在的导出 —— fetchOrderss 拼写错误 → TS2305/2724
 *    （真实工程等价于远程页面改了导出而宿主没同步）
 * 3) definePages 传入非法结构 —— route 必须是 string、remotes 必须是 Record
 *    （用 @fulgurjs/federation/runtime 的类型在编译期拦截，README §3）
 */

// ── 1) 不存在的远程模块类型：预期 TS2307 Cannot find module ──
import { fetchGhostOrders } from 'pc-remote/pages/ghost'
export const ghostLoader = fetchGhostOrders

// ── 2) 存在模块上的不存在导出：预期 TS2305 has no exported member ──
import { fetchOrderss } from 'pc-remote/pages/orders'
export const typoLoader = fetchOrderss

// ── 3) definePages / validatePages 非法结构：预期 not assignable / does not satisfy ──
import { definePages, validatePages } from '@fulgurjs/federation/runtime'

export const badPages = definePages([{ route: 404 }])
export const badOptions = validatePages([], { remotes: '/pc' })
