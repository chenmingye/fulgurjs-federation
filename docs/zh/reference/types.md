# 公共类型参考

类型用于描述当前公共 API。此页列出可导入的类型、字段及可选性；运行时默认值、调用顺序和错误处理见 [API 参考](api.md) 与 [配置参考](configuration.md)。`?` 表示可省略，不表示可在运行中任意改变。

下面签名中的关联类型由对应 API 的返回值推断；未列为公开导出的关联类型不应从 internal/src/dist 导入。

## FederationOptions

Vite 联邦插件配置.

导入入口：`@fulgurjs/federation`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `name` | no | `string` | 见对应 API 合同。 |
| `filename` | yes | `string` | 见对应 API 合同。 |
| `exposes` | yes | `Record<string, string \| ExposeHint>` | 见对应 API 合同。 |
| `setup` | yes | `string` | 可选远程初始化入口：相对本应用根目录的 TS/JS 模块路径。 模块须默认导出 `setup(context)`（应用级，容器首次加载业务模块前执行一次）， 可选具名导出 `onSession(context)`（会话级，按宿主 AppContext.sessionKey 去重执行）。 缺省时无初始化行为（普通 exposes 语义完全不变）。 |
| `remotes` | yes | `Record<string, string \| RemoteEntryConfig \| (() => Promise<any>)>` | 见对应 API 合同。 |
| `shared` | yes | `SharedConfig` | 见对应 API 合同。 |
| `shareScope` | yes | `string` | 见对应 API 合同。 |
| `manifest` | yes | `boolean \| Record<string, unknown>` | 见对应 API 合同。 |
| `runtimePlugins` | yes | `string[]` | 见对应 API 合同。 |
| `dts` | yes | `boolean \| { dir?: string; mode?: "source" \| "shim"; }` | 见对应 API 合同。 |
| `devSharedSelf` | yes | `boolean` | dev 下自身源码（含依赖，需配合 optimizeDeps.exclude）是否参与 shared 协商改写。 缺省按角色推断：提供 exposes/setup 的应用（纯 remote 与双向联邦）为 true——被宿主 消费的组件需协商到宿主实例；纯宿主（只配 remotes、无 exposes）为 false——自身 import 即自身 provide，避免巨型工程 TLA/循环依赖风险。显式配置永远优先。 |
| `devCorsOrigins` | yes | `string[] \| "*"` | dev 跨源访问策略（插件端点 /@fulgurjs-entry.js、/@fulgurjs-manifest.json 与 server.cors 共用同一来源）。缺省 = '*'（现状兼容：端点与 server.cors 全放开）；'*' = 显式全放开（不告警）； 数组 = 来源 allowlist（端点按 Origin 反射匹配，不匹配省略头；server.cors 传 { origin: [...] }， 用户显式配置的 server.cors 永远优先）。 |
| `devFsRoot` | yes | `boolean` | dev manifest 是否携带 fsRoot（remote 根目录本机绝对路径，宿主 dts 类型直连用）。 默认 true（现状兼容）；false 时不写入 manifest，宿主 dts 降级为 any 桩并给出提示。 fsRoot 是 dev-only 字段，永不进入 prod manifest。 |

## PageRouteLike

宿主页面记录：路由与远程模块映射.

导入入口：`@fulgurjs/federation`, `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `route` | no | `string` | 宿主路由路径（:param 段） |
| `spec` | yes | `string` | 显式 spec（缺省走推导） |
| `name` | yes | `string` | 其余字段（name/title/...）由宿主自由扩展，校验器按需读取 |

## ShareEntry

共享依赖的一个提供方记录.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `version` | no | `string` | 见对应 API 合同。 |
| `get` | no | `() => Promise<any>` | 见对应 API 合同。 |
| `from` | no | `string` | 见对应 API 合同。 |
| `eager` | no | `boolean` | 见对应 API 合同。 |
| `loaded` | yes | `boolean` | 见对应 API 合同。 |
| `value` | yes | `any` | 首次 loadShare 成功后缓存的实例值；getLoadedShare 同步查询与 CJS 垫片依赖它 |
| `pendingGet` | yes | `Promise<any>` | 进行中的 get()：并发 loadShare 共享同一次加载，落定后清除（失败后允许重新加载） |

## ShareScope

按依赖键组织的共享版本表.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

```ts
export type ShareScope = Record<string, Record<string, ShareEntry>>
```

## ShareScopeMap

按作用域组织的共享依赖集合.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

```ts
export type ShareScopeMap = Record<string, ShareScope>
```

## RemoteConfig

远程容器的运行时注册配置.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `name` | no | `string` | 见对应 API 合同。 |
| `entry` | no | `string` | 见对应 API 合同。 |
| `shareScope` | yes | `string` | 见对应 API 合同。 |
| `timeout` | yes | `number` | 加载超时 ms，默认 15000。注意：超时只代表"调用方不再等待"，浏览器不会取消已发出的 动态 import——下一次调用复用同一条 in-flight 记录，不会重复初始化同一容器。 |
| `retries` | yes | `number` | 失败重试次数，默认 2（上限 10；配置期与运行时注册均校验，非法当场抛错） |
| `fallback` | yes | `string[]` | 备用 remoteEntry 地址（首个失败后依次尝试） |
| `breaker` | yes | `{ threshold?: number; resetMs?: number; }` | 见对应 API 合同。 |
| `promise` | yes | `() => Promise<any>` | promise-based remote：运行时解析出容器或容器地址（其解析同样受 timeout 约束） |
| `manifestUrl` | yes | `string` | 内部：远程自报的发布路径（preload 用） |

## LoadShareOptions

加载共享依赖时的版本与作用域条件.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `requiredVersion` | yes | `string \| false` | 见对应 API 合同。 |
| `singleton` | yes | `boolean` | 见对应 API 合同。 |
| `strictVersion` | yes | `boolean` | 见对应 API 合同。 |
| `shareKey` | yes | `string` | 见对应 API 合同。 |
| `shareScope` | yes | `string` | 见对应 API 合同。 |
| `fallback` | yes | `() => Promise<any>` | 本地副本兜底（webpack shared.import） |
| `localVersion` | yes | `string` | 内部：本地副本的版本号（fallback 回写共享作用域与 CJS 垫片 pin 使用；不参与快照键） |

## LoadRemoteOptions

远程加载重试、作用域与消费应用选项.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `shareScope` | yes | `string` | 见对应 API 合同。 |
| `retries` | yes | `number` | 见对应 API 合同。 |
| `fallbackModule` | yes | `() => any` | 见对应 API 合同。 |
| `consumerApp` | yes | `unknown` | 发起本次加载的消费方应用实例（框架适配器自动传入，业务代码不用手填）： Vue 侧 remoteComponent 捕获当前渲染 app；远程 setup 声明的 globalComponents 会在每次加载时幂等注册到它（桥接子应用每次挂载新建 app 也能拿到注册）。 宿主页面适配器（createHostPages）、React 侧与手动 loadRemote 均不传—— 页面场景组件解析走宿主自身全局注册表，React 无全局注册表概念。 运行时只在当次调用内消费该引用，不保存、不感知具体框架类型。 |

## PreloadRemoteOptions

预载或预取远程资源.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `mode` | yes | `"preload" \| "prefetch"` | 见对应 API 合同。 |

## RuntimePlugin

具名运行时 hook 插件.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `name` | yes | `string` | 见对应 API 合同。 |
| `init` | yes | `(hooks: RuntimeHooks) => void` | 见对应 API 合同。 |

## RuntimeHooks

远程加载与共享裁决钩子.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `resolveShare` | yes | `(shareInfo: { shareKey: string; shareScope: string; requiredVersion?: string \| false; picked?: ShareEntry; available: ShareEntry[]; }) => void \| ShareEntry \| Promise<void \| ShareEntry>` | 覆写共享版本裁决结果：返回 ShareEntry 即生效 |
| `beforeLoadRemote` | yes | `(info: { remote: string; module: string; }) => void` | 见对应 API 合同。 |
| `afterLoadRemote` | yes | `(info: { remote: string; module: string; module_ns?: any; }) => void` | 见对应 API 合同。 |
| `onRemoteError` | yes | `(info: { remote: string; error: FgError; }) => void` | 见对应 API 合同。 |

## RemoteDebugInfo

远程容器加载诊断快照.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `entry` | no | `string` | 见对应 API 合同。 |
| `status` | no | `"idle" \| "loading" \| "loaded" \| "failed"` | 见对应 API 合同。 |
| `lastLoadMs` | yes | `number` | 见对应 API 合同。 |
| `error` | yes | `string` | 见对应 API 合同。 |
| `setup` | yes | `"failed" \| "none" \| "pending" \| "ready"` | setup 生命周期状态：none=未配置 / pending=执行中 / ready=应用级已完成 / failed=失败可重试 |

## FgRuntime

框架无关运行时对象.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `shareScopeMap` | no | `ShareScopeMap` | 见对应 API 合同。 |
| `initSharing` | no | `(scopeName?: string) => ShareScopeMap` | 见对应 API 合同。 |
| `registerShare` | no | `(scopeName: string, name: string, version: string, get: () => Promise<any>, opts?: { from?: string; eager?: boolean; loaded?: boolean; }) => void` | 见对应 API 合同。 |
| `registerRemotes` | no | `(list: RemoteConfig[]) => void` | 见对应 API 合同。 |
| `registerRemote` | no | `(remote: RemoteConfig) => void` | 见对应 API 合同。 |
| `registerPlugins` | no | `(list: RuntimePlugin[]) => void` | 见对应 API 合同。 |
| `loadShare` | no | `(name: string, opts?: LoadShareOptions) => Promise<any>` | 见对应 API 合同。 |
| `loadShareSync` | no | `(name: string, opts: LoadShareOptions) => { kind: "ready" \| "local"; value?: any; }` | 见对应 API 合同。 |
| `prepareShares` | no | `(requests: { name: string; opts: LoadShareOptions; }[]) => Promise<void>` | 见对应 API 合同。 |
| `getLoadedShare` | no | `(name: string, opts?: LoadShareOptions) => any` | 见对应 API 合同。 |
| `pinLoadedShare` | no | `(name: string, opts: LoadShareOptions, localVersion: string, instance: unknown) => void` | 见对应 API 合同。 |
| `loadRemote` | no | `<T = Record<string, any>>(spec: string, opts?: LoadRemoteOptions) => Promise<T>` | 见对应 API 合同。 |
| `getContainer` | no | `(name: string) => Promise<any>` | 见对应 API 合同。 |
| `preloadRemote` | no | `(spec: string, opts?: PreloadRemoteOptions) => Promise<void>` | 见对应 API 合同。 |
| `parseSpec` | no | `(spec: string) => { remote: string; module: string; }` | 见对应 API 合同。 |
| `clearSessionState` | no | `() => void` | 见对应 API 合同。 |

## RemoteSetupContext

setup/onSession 收到的上下文.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `appContext` | no | `Readonly<Record<string, any>>` | 见对应 API 合同。 |
| `sessionKey` | yes | `string` | 见对应 API 合同。 |
| `signal` | no | `AbortSignal` | 见对应 API 合同。 |

## RemoteSetupModule

远程 setup 模块及组件注册合同.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `default` | no | `(ctx: RemoteSetupContext) => void \| Promise<void>` | 见对应 API 合同。 |
| `onSession` | yes | `(ctx: RemoteSetupContext) => void \| Promise<void>` | 见对应 API 合同。 |
| `globalComponents` | yes | `Record<string, unknown>` | 远程暴露面依赖的「宿主全局注册组件」声明（键=组件注册名，值=组件对象或零参 loader）： 组件联邦（remoteComponent）把远程组件渲染进消费方 app 上下文，模板里的 字符串标签（如 <a-divider>）按消费方 app 的全局注册表解析——消费方没注册就 渲染成死元素。提供方在此声明后，运行时在每次 loadRemote 时把它们幂等注册到 当次传入的 consumerApp 上；无 consumerApp（无组件上下文的手动加载）时静默跳过。 值推荐「零参 loader（() => import('./X.vue')）」：setup 模块保持零重依赖， 组件只在本框架消费方真实渲染时才加载——Vue 适配器注册时自动包 defineAsyncComponent； 静态组件值仍支持（同框架消费场景一步到位）。运行时对值原样透传，不做形状校验。 |

## AppContext

宿主提供给远程模块的应用与会话上下文.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `user` | no | `Record<string, any>` | 宿主登录用户原始形态（只读约定） |
| `getToken` | yes | `() => string` | 取最新 token（拉取式防过期；在使用时调用，避免持有过期 token 快照） |
| `store` | yes | `unknown` | 宿主 pinia 实例：子应用 useUserStore(ctx.store) 拿共享响应式状态 |
| `hostApp` | yes | `unknown` | 宿主 Vue App 实例（同 realm 直引用）：全局组件/指令注册目标 |
| `locale` | yes | `unknown` | EP locale 等 UI 配置（原 W4 字段） |
| `events` | yes | `Record<string, any>` | 事件/方法池：events.main.* 宿主提供、events.bpm.* / events.lowcode.* 子应用反向注册 |
| `sessionKey` | yes | `string` | 非敏感登录代次 ID：宿主每次成功登录/重新登录生成新值，token 刷新但会话未变时沿用。 远程 onSession 按它去重（同一代次只执行一次）。不是用户 ID、不是 token、不作为授权凭证。 远程声明了 onSession 时必填（缺省即 MFU-013）。 |

## PagesOptions

页面表验证选项.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `deriveSpec` | yes | `(route: string) => string` | 带参路由的缺省 spec 推导规则（宿主私有约定，如 (route) => `pages/${route 去前缀去 :参}`）。 缺省 = 去掉首段（远程前缀）+ 剥 :参 段（无 pages/ 前缀）—— 推导只需在全部条目间自洽即可保持冲突判定成立。 |
| `remotes` | yes | `Record<string, string>` | 路由前缀 → remote 名（R3 用：{'/remote-a/': 'remote-a'}）；缺省跳过 R3 |
| `schema` | yes | `Record<string, RemoteSchemaEntry>` | remote exposes 清单（dev 由 virtual:fulgurjs-remote-schema 提供）；缺省跳过 R3 |
| `strict` | yes | `boolean` | false = ERROR 降级 console.error（默认 true = throw） |

## PageViolation

页面表校验结果条目.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `rule` | no | `"R1" \| "R2" \| "R3" \| "R4" \| "R5"` | 见对应 API 合同。 |
| `level` | no | `"error" \| "warn"` | 见对应 API 合同。 |
| `message` | no | `string` | 见对应 API 合同。 |

## RemoteSchemaEntry

一个远程 expose 的声明.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `exposes` | no | `string[]` | 该 remote 的 exposes 键清单（与 spec 同口径，剥 ./ 前缀比较） |
| `exists` | yes | `boolean` | manifest 是否成功拉取（false 时跳过该 remote 的 R3，诚实降级） |

## RemoteSchema

按 expose 键组织的声明表.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

```ts
export type RemoteSchema = Record<string, RemoteSchemaEntry>
```

## RemoteComponentOptions

Vue 远程组件加载与占位选项.

导入入口：`@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `loadingComponent` | yes | `Component` | 见对应 API 合同。 |
| `errorComponent` | yes | `Component` | 见对应 API 合同。 |
| `retries` | yes | `number` | 见对应 API 合同。 |
| `delay` | yes | `number` | 见对应 API 合同。 |
| `timeout` | yes | `number` | 见对应 API 合同。 |

## HostPagesOptions

Vue 宿主页面适配选项.

导入入口：`@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `beforeLoad` | yes | `() => void \| Promise<void>` | 每次页面模块实际加载前执行（同步或异步）；宿主在此提供最新 context |
| `loadingComponent` | yes | `Component` | 加载期占位组件（骨架屏） |
| `errorComponent` | yes | `Component` | 错误占位组件（缺省 = 内置错误占位：错误码+根因+修法+重试加载/刷新页面重试；自定义时完全接管） |
| `delay` | yes | `number` | 骨架屏延迟 ms（默认 200，防闪） |
| `pages` | no | `PageRouteLike[]` | 页面表（宿主路由与布局共用的唯一数据源；definePages R1–R5 校验照常执行） |
| `remotePrefixes` | no | `Record<string, string>` | 路由前缀 → remote 名（最长前缀匹配；页面路由无匹配前缀时创建期即报错） |
| `deriveSpec` | yes | `(route: string) => string` | 缺省 spec 推导（缺省 = 去首段前缀 + 剥 :参数 段，同 definePages 默认） |
| `schema` | yes | `Record<string, RemoteSchemaEntry>` | 远程 exposes 清单（dev 由 remoteSchema 提供；build 为空表时按语义诚实降级） |
| `strict` | yes | `boolean` | ERROR 级校验失败是否 throw（默认 true） |
| `base` | yes | `string` | 站点 base 前缀（如 '/main'）：resolve 时先剥离再匹配路由空间 |

## HostPages

Vue 页面解析和组件创建对象.

导入入口：`@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `pages` | no | `PageRouteLike[]` | 原页面记录 |
| `resolve` | no | `(path: string) => ResolvedHostPage` | 路径 → 页面解析（兼容 base 前缀与深链；无匹配返回 null） |
| `component` | no | `(spec: string) => Component` | 按 spec 取异步页面组件（同 spec 复用；换登录代次后重建以触发会话同步） |
| `keepAliveNames` | no | `string[]` | 保活白名单：keepAlive 页面的组件 name（与实际被 KeepAlive 缓存的包装组件一致） |

## ResolvedHostPage

页面解析结果及提取的路径参数.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `page` | no | `PageRouteLike` | 原页面记录（含宿主自由扩展字段 name/title/keepAlive/...） |
| `remote` | no | `string` | 命中的 remote 名 |
| `spec` | no | `string` | 完整加载 spec（`<remote>/<exposes 键>`，loadRemote 直用） |
| `params` | no | `Record<string, string>` | 路径参数（解码失败只让该次匹配失败，不让页面初始化崩溃） |

## BridgeApp

远程完整子应用的挂载/卸载合同.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `mount` | no | `(el: HTMLElement, props?: Record<string, unknown>, options?: BridgeMountOptions) => void \| Promise<void>` | 首次根提交完成时才算挂载成功；同一容器未卸载前重复 mount 是契约违例 |
| `unmount` | no | `(el: HTMLElement) => void` | 同步使当前挂载代次失效并清理已创建的 root；未知容器为 no-op |
| `routing` | yes | `BridgeRoutingProtocol` | 路由协议声明（URL 同步）：defineBridgeApp(工厂, { routing: true }) 时写入 { protocol: 1 }。宿主启用 routing 时必须存在且 protocol === 1（MFU-031）， 不允许静默退回 memory 假装深链成功。 |

## VueBridgeAppFactory

创建独立 Vue 应用的工厂.

导入入口：`@fulgurjs/federation/vue`.

```ts
export type VueBridgeAppFactory = ( props: Record<string, unknown>, ctx?: VueBridgeAppContext, ) => VueApp | Promise<VueApp>
```

## VueBridgeAppOptions

Vue 宿主桥接的加载与上下文选项.

导入入口：`@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `loadingComponent` | yes | `Component` | 加载 pending 占位组件（默认无占位节点） |
| `errorComponent` | yes | `Component` | 加载/挂载失败占位（完全接管，契约不变：只接收 error prop；默认内置中文诊断 + 两条恢复操作） |
| `retries` | yes | `number` | 透传现行 loadRemote 的重试选项（0-10 整数），不另叠自动重试 |
| `timeout` | yes | `number` | 本次桥接加载等待上限 ms；不取消已发出的共享请求，迟到结果一律丢弃 |
| `getContext` | yes | `() => Partial<AppContext> & Record<string, unknown>` | 无副作用的同步 getter：首次、重试及换会话的实际加载前返回本次所需上下文快照 |

## VueBridgeRouterConnection

Vue 子应用 memory 路由连接与就绪/释放.

导入入口：`@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `ready` | no | `Promise<void>` | 必须 await ready 后再 app.use(router)，初始错误会拒绝此 Promise。 |
| `dispose` | no | `() => void` | 见对应 API 合同。 |

## BridgeHostRouting

宿主导航端口与子应用路径前缀.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `basePath` | no | `string` | 宿主路由视角的静态绝对路径，如 "/approval"；同页各同步实例不得相同或重叠 |
| `navigation` | no | `BridgeHostNavigation` | 见对应 API 合同。 |

## ReactBridgeAppOptions

React 宿主桥接的加载与上下文选项.

导入入口：`@fulgurjs/federation/react`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `fallback` | yes | `ReactNode` | 加载 pending 占位（默认 null） |
| `error` | yes | `ReactNode \| BridgeErrorFallback` | 加载/挂载失败占位；默认内置中文诊断 + 「重试加载 / 刷新页面重试」 |
| `retries` | yes | `number` | 透传现行 loadRemote 的重试选项（0-10 整数），不另叠自动重试 |
| `timeout` | yes | `number` | 本次桥接加载等待上限 ms；不取消已发出的共享请求，迟到结果一律丢弃 |
| `getContext` | yes | `() => Partial<AppContext> & Record<string, unknown>` | 无副作用的同步 getter：首次、重试及换会话的实际加载前返回本次所需上下文快照 |

## BridgeErrorFallback

React 桥接错误占位回调.

导入入口：`@fulgurjs/federation/react`.

```ts
export type BridgeErrorFallback = (error: unknown, retry: () => void) => ReactNode
```

## ReactRemoteComponentOptions

React 远程组件加载与占位选项.

导入入口：`@fulgurjs/federation/react`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `fallback` | yes | `ReactNode` | 本次加载 pending 时的占位（区别于失败占位）；默认 null |
| `error` | yes | `ReactNode \| RemoteErrorFallback` | 加载失败或子树渲染错误的展示；默认内置中文占位（错误码+根因+修法+重试加载/刷新页面重试） |
| `retries` | yes | `number` | 透传现行 loadRemote 的重试选项（0-10 整数），不另叠自动重试 |
| `timeout` | yes | `number` | 本次组件加载等待上限 ms；不提供则沿用 loadRemote 自身超时。不取消已发出的共享请求 |

## RemoteErrorFallback

React 加载失败的占位回调.

导入入口：`@fulgurjs/federation/react`.

```ts
export type RemoteErrorFallback = (error: unknown, retry: () => void) => ReactNode
```

## UseLoadRemoteOptions

React 模块加载 hook 选项.

导入入口：`@fulgurjs/federation/react`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `shareScope` | yes | `string` | 透传 loadRemote 的 shareScope |
| `retries` | yes | `number` | 透传 loadRemote 的重试次数（0-10 整数） |
| `fallbackModule` | yes | `() => any` | 用户显式配置的失败兜底模块（透传 loadRemote.fallbackModule）：配置后加载失败返回 兜底值而不写 error。这是显式声明的行为，不是静默成功——README 已说明。 |

## UseLoadRemoteResult

React hook 的数据、错误、状态与重试.

导入入口：`@fulgurjs/federation/react`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `data` | no | `Module` | 加载成功后的模块命名空间；开始新尝试（包括 reload）时清空，失败时为 undefined |
| `error` | no | `unknown` | 失败原因；无错误时恒为 undefined（统一空值） |
| `loading` | no | `boolean` | 是否有请求在途 |
| `reload` | no | `() => Promise<void>` | 清空旧数据并重新走加载生命周期；卸载后调用不发起请求。成功模块复用缓存，Promise<void> 正常结束（不抛） |

## RemoteErrorBoundaryProps

React 渲染错误边界属性.

导入入口：`@fulgurjs/federation/react`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `children` | yes | `ReactNode` | 见对应 API 合同。 |
| `fallback` | yes | `ReactNode \| ((args: { error: unknown; reset: () => void; }) => ReactNode)` | 错误占位：节点或 ({ error, reset }) 渲染函数；默认内置中文占位 |
| `onError` | yes | `(error: unknown, info: ErrorInfo) => void` | 渲染异常回调（error + React componentStack 信息） |
| `resetKeys` | yes | `readonly unknown[]` | 任一项变化时重置边界状态（受控重试的常用形态：传 [retryEpoch]） |

## ReactHostPagesOptions

React 宿主页面适配选项.

导入入口：`@fulgurjs/federation/react`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `beforeLoad` | yes | `() => void \| Promise<void>` | 每次页面模块实际加载尝试前执行（同步或异步）；宿主在此提供最新 context |
| `fallback` | yes | `ReactNode` | 页面加载 pending 占位（同 remoteComponent.fallback） |
| `error` | yes | `ReactNode \| RemoteErrorFallback` | 页面加载/渲染错误占位（同 remoteComponent.error） |
| `retries` | yes | `number` | 透传 loadRemote 重试（0-10 整数） |
| `timeout` | yes | `number` | 单次页面组件加载等待上限 ms（同 remoteComponent.timeout） |
| `pages` | no | `PageRouteLike[]` | 页面表（宿主路由与布局共用的唯一数据源；definePages R1–R5 校验照常执行） |
| `remotePrefixes` | no | `Record<string, string>` | 路由前缀 → remote 名（最长前缀匹配；页面路由无匹配前缀时创建期即报错） |
| `deriveSpec` | yes | `(route: string) => string` | 缺省 spec 推导（缺省 = 去首段前缀 + 剥 :参数 段，同 definePages 默认） |
| `schema` | yes | `Record<string, RemoteSchemaEntry>` | 远程 exposes 清单（dev 由 remoteSchema 提供；build 为空表时按语义诚实降级） |
| `strict` | yes | `boolean` | ERROR 级校验失败是否 throw（默认 true） |
| `base` | yes | `string` | 站点 base 前缀（如 '/main'）：resolve 时先剥离再匹配路由空间 |

## ReactHostPages

React 页面解析和组件创建对象.

导入入口：`@fulgurjs/federation/react`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `pages` | no | `PageRouteLike[]` | 原页面记录 |
| `resolve` | no | `(path: string) => ResolvedHostPage` | 路径 → 页面解析（base 前缀、最长前缀、参数解码、R1–R5 语义与 Vue 完全一致） |
| `component` | no | `<P = Record<string, unknown>>(spec: string) => ComponentType<P>` | 按 spec 取页面组件（同 spec 同登录代次复用；新非空 sessionKey 到来时重建以触发 onSession） |

## ReactBridgeAppFactory

创建 React 子应用元素的工厂.

导入入口：`@fulgurjs/federation/react`.

```ts
export type ReactBridgeAppFactory = (props: Record<string, unknown>, ctx?: ReactBridgeAppContext) => ReactElement
```

