/**
 * 远程类型注册表的查询类型（6.5.0 远程类型自动生成）。
 *
 * FgRemoteTypes 本体声明在公共 /runtime 入口（runtime-entry.ts）——它是宿主生成
 * registry.d.ts 模块增强的目标；本文件只提供三个公开字符串 API 共用的「入口分类
 * 检查」与「模块默认导出提取」，/vue、/react 入口的工厂签名从这里取类型。
 *
 * 分支顺序是原型冻结结果（见 testbed/runs/20261009-remote-types 原型 C）：
 * 1. `[keyof FgRemoteTypes] extends [never]` 空注册表守卫必须最先——未同步任何类型时
 *    所有入口字符串放行（结果 unknown），不破坏未启用类型同步的工程；
 * 2. `string extends S` 动态守卫其次——业务变量承载的动态字符串永远放行；
 * 3. 之后才是已登记/未登记字面量的区分；错误分支必须是**模板字面量类型**
 *    （never 分支在模块增强接口场景下会被 TS 延迟条件宽松规则放行，拼错不报错）。
 * 组件形态检查的联合**必须显式加括号**：`=> any | Fn` 会被解析为返回类型联合。
 */
// 包自引用（type-only）：见 runtime/index.ts 同款说明——注册表接口必须跨入口共享同一声明
import type { FgRemoteTypes } from '@fulgurjs/federation/internal/registry.js'
import type { BridgeApp } from './bridge-core'

/** 模块命名空间类型 → default 导出类型（无 default → never） */
export type FgModuleDefault<M> = M extends { default: infer D } ? D : never

/** 「像组件」的形态面：构造函数（DefineComponent/类组件）或函数组件 */
export type FgComponentLike = (abstract new (...args: any) => any) | ((...args: any[]) => any)

/**
 * remoteComponent 的入口检查：组件暴露的 default 须为组件形态。
 * 注意无 default 的模块 FgModuleDefault=never，而 never extends 一切恒真——必须先
 * 判定「确实存在 default 且其为组件形态」，否则普通模块会冒充组件入口通过。
 */
export type FgComponentEntry<S extends string> = [keyof FgRemoteTypes] extends [never]
  ? string
  : string extends S
    ? string
    : S extends keyof FgRemoteTypes
      ? FgRemoteTypes[S] extends { default: infer D }
        ? D extends FgComponentLike
          ? S
          : `非组件入口 ${S}：remoteComponent 只接受默认导出为组件的暴露项（普通模块用 loadRemote）`
        : `非组件入口 ${S}：remoteComponent 只接受默认导出为组件的暴露项（普通模块用 loadRemote）`
      : `未知远程入口 ${S}：请核对该远程的 exposes，或运行 npx @fulgurjs/federation types 同步类型`

/**
 * createVueBridgeApp / createReactBridgeApp 的入口检查：default 须满足 BridgeApp 契约
 * （无 default 的 never extends 陷阱同 FgComponentEntry——先判定 default 存在）。
 */
export type FgBridgeEntry<S extends string> = [keyof FgRemoteTypes] extends [never]
  ? string
  : string extends S
    ? string
    : S extends keyof FgRemoteTypes
      ? FgRemoteTypes[S] extends { default: infer D }
        ? D extends BridgeApp
          ? S
          : `非桥接入口 ${S}：桥接工厂只接受远程 defineBridgeApp 的默认导出（普通组件用 remoteComponent）`
        : `非桥接入口 ${S}：桥接工厂只接受远程 defineBridgeApp 的默认导出（普通组件用 remoteComponent）`
      : `未知远程入口 ${S}：请核对该远程的 exposes，或运行 npx @fulgurjs/federation types 同步类型`

/** 桥接提供方声明的 props（defineBridgeApp<P> 的 phantom 标记 → 宿主侧提取） */
export type FgBridgePropsOf<B> = B extends { __fgBridgeProps?: infer P } ? P : Record<string, unknown>

/**
 * 桥接 appProps 推导：注册表入口 → default → phantom props；未声明具体 props 的远程
 * 得到诚实的 Record<string, unknown>；非桥接入口为 never（入口检查已先行报错）。
 */
export type FgBridgeAppProps<S extends string> = S extends keyof FgRemoteTypes
  ? FgRemoteTypes[S] extends { default: infer D }
    ? D extends BridgeApp
      ? FgBridgePropsOf<D>
      : never
    : never
  : Record<string, unknown>
