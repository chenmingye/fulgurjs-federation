/**
 * 远程类型注册表——唯一共享声明（静态文件，6.5.0 远程类型自动生成）。
 *
 * - `FgRemoteTypes`：三入口（/runtime、/vue、/react）与运行时内核共享的可增强接口。
 *   宿主工程生成的 registry 声明通过模块增强向这里登记
 *   `'<远程名>/<expose>': typeof import('<远程名>/<expose>')`；未同步任何类型时为空。
 * - `FgStaticEntry` / `FgRemoteModule`：注册表的纯函数类型（不参与增强）。
 *
 * 为什么是静态文件而不是构建产物：各入口的 dts 打包会把相对引用内联成私有副本，
 * 增强就到不了副本；跨入口共享必须落在包级子路径上（./internal/registry.js），且该
 * 文件在任何构建顺序下都可解析（无 dist 先后依赖）。形状保持极简与稳定。
 *
 * 分支顺序是原型冻结结果（见 testbed/runs/20261009-remote-types 原型 C）：
 * 1. `[keyof FgRemoteTypes] extends [never]` 空注册表守卫必须最先——未同步任何类型时
 *    所有入口字符串放行（结果 unknown），不破坏未启用类型同步的工程；
 * 2. `string extends S` 动态守卫其次——业务变量承载的动态字符串永远放行；
 * 3. 已登记/未登记字面量区分；错误分支必须是**模板字面量类型**（never 分支在模块
 *    增强接口场景下会被 TS 延迟条件宽松规则放行，拼错不报错）。
 */
export interface FgRemoteTypes {}

/** 入口字符串的静态检查（loadRemote/remoteComponent/createXBridgeApp 的参数面共用模式） */
export type FgStaticEntry<S extends string> = [keyof FgRemoteTypes] extends [never]
  ? string
  : string extends S
    ? string
    : S extends keyof FgRemoteTypes
      ? S
      : `未知远程入口 ${S}：请核对该远程的 exposes，或运行 npx @fulgurjs/federation types 同步类型`

/**
 * 入口对应的模块类型：已登记 → 模块命名空间；未同步/动态 → unknown。
 * 动态分支显式化（不依赖 keyof 反查）——延迟条件在部分口径下会放宽成员访问。
 */
export type FgRemoteModule<S extends string> = [keyof FgRemoteTypes] extends [never]
  ? unknown
  : string extends S
    ? unknown
    : S extends keyof FgRemoteTypes
      ? FgRemoteTypes[S]
      : unknown

/**
 * 显式类型参数的「自动」标记：字符串 API 的类型参数默认值。
 * `loadRemote('x')` 未给泛型 → 按注册表推导；`loadRemote<MyModule>('x')` 显式给出
 * → 用户接管类型（老用法兼容——显式类型绑定到**第一个**类型参数，注册表推导让位）。
 * 用户不应实例化该类型。
 */
export type FgTypeAuto = { readonly __fulgurjsTypeAuto: true }
