/**
 * 共享计数 store —— 演示场景①「实例身份一致」的共享模块本体。
 *
 * 本文件经 exposes['./store'] 对外提供，宿主卡片、remote-a 组件、remote-b 组件三处
 * 都引用它：联邦保证同一页面只有一份模块实例（loadRemote 结果缓存 + expose 单 chunk）。
 * 它导入的 nanostores 经 shared singleton 协商——三处最终用的是同一份 nanostores 实例。
 */
import { atom } from 'nanostores'

const g = globalThis as Record<string, unknown>

// 共享模块实例标识：本模块每次被求值（=页面上多出一份实例）都会创建一个新 Symbol。
// 三处打印 String(NS_INSTANCE) 完全相同 = 三处引用同一份模块实例。
g.__NS_INSTANCE__ ??= Symbol('nanostores')

// 求值次数观测：正常恒为 1；若单例被破坏出现多实例，该数字会大于 1。
g.__NS_EVAL_COUNT__ = (typeof g.__NS_EVAL_COUNT__ === 'number' ? g.__NS_EVAL_COUNT__ : 0) + 1

export const NS_INSTANCE: symbol = g.__NS_INSTANCE__ as symbol

/** nanostores 的 atom 工厂原样导出：消费方用「自己 import 的 atom === 它」验证协商收敛到同一实例 */
export const atomFactory = atom

export const counter = atom(0)

export function bumpCounter(delta = 1): void {
  counter.set(counter.get() + delta)
}

export function resetCounter(): void {
  counter.set(0)
}
