# 公共类型参考

类型用于描述当前公共 API。此页列出可导入的类型、字段及可选性；运行时默认值、调用顺序和错误处理见 [API 参考](api.md) 与 [配置参考](configuration.md)。`?` 表示可省略，不表示可在运行中任意改变。

下面签名中的关联类型由对应 API 的返回值推断；未列为公开导出的关联类型不应从 internal/src/dist 导入。

## FederationOptions

Vite 联邦插件配置.

导入入口：`@fulgurjs/federation`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `name` | no | `string` | 页面内唯一容器名，字母开头，后续仅字母/数字/下划线/点/连字符；必填。 |
| `filename` | yes | `string` | 生产容器入口文件名，默认 fulgurjs-remoteEntry.js；部署缓存规则与 doctor --entry 同步调整。 |
| `exposes` | yes | `Record<string, string \| ExposeHint>` | 对外暴露的模块键与真实源文件映射；组件和普通模块都可暴露。 |
| `setup` | yes | `string` | 可选初始化模块路径。default setup 函数可省略，但模块必须至少声明 default/onSession/globalComponents/pageProviders 中一项；按应用、会话或消费方的执行粒度见 [setup 合同](api.md#setuponsession-远程初始化生命周期)。 |
| `remotes` | yes | `Record<string, string \| RemoteEntryConfig \| (() => Promise<any>)>` | 远程配置；地址必须在实际使用的 dev/prod 环境可解析。 |
| `shared` | yes | `SharedConfig` | 参与协商的依赖键与消费条件；不自动创建或共享业务 store 实例。 |
| `shareScope` | yes | `string` | 共享分组名；不同作用域独立协商，默认 default。 |
| `manifest` | yes | `boolean \| Record<string, unknown>` | 默认开启生产清单；false 关闭，普通模块加载仍可使用，清单相关检查/预载能力受限。 |
| `runtimePlugins` | yes | `string[]` | 运行时插件模块路径数组，默认空；相对路径按应用根解析。 |
| `dts` | yes | `boolean \| { dir?: string; devCheck?: 'contract' \| 'implementation' }` | 远程类型自动生成与同步（见[配置参考](configuration.md)与[API · 远程类型](api.md#远程类型自动生成与同步)）。 |
| `devSharedSelf` | yes | `boolean` | dev 自身源码参与共享协商；省略时 exposes/setup 提供方为 true、纯消费方为 false。显式值优先；插件处理自身预构建接线，不要求所有工程手动 exclude 全部共享依赖。 |
| `devCorsOrigins` | yes | `string[] \| "*"` | dev 联邦 entry/manifest/types 端点的来源策略，默认 *；未显式配置 server.cors 时也用于 Vite 源码模块。显式 server.cors 仅覆盖 Vite 侧策略，不覆盖这些插件端点。非 loopback 的通配配置仍可提示 DEV-011；不配置生产 CORS。 |

## PageRouteLike

宿主页面记录：路由与远程模块映射.

导入入口：`@fulgurjs/federation`, `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `route` | no | `string` | 宿主路由路径（:param 段） |
| `spec` | yes | `string` | 显式 spec（缺省走推导） |
| `name` | yes | `string` | 宿主路由名称；可扩展 title/keepAlive 等业务字段，不代表插件自动注册路由。 |

## ShareEntry

共享依赖的一个提供方记录.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `version` | no | `string` | 提供的真实依赖版本号，用于版本协商；不能伪报版本绕过兼容检查。 |
| `get` | no | `() => Promise<any>` | 加载并返回该版本模块的工厂；成功结果由运行时复用。 |
| `from` | no | `string` | 提供方标识，用于裁决诊断和来源追踪。 |
| `eager` | no | `boolean` | 是否作为同步可用的本地共享副本；不表示业务模块自动预载。 |
| `loaded` | yes | `boolean` | 该提供条目是否已被使用；单例裁决优先复用已加载条目。 |
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
| `name` | no | `string` | 运行时注册名，与调用 spec 的远程前缀对应。 |
| `entry` | no | `string` | 远程容器入口 URL；运行时注册填写实际入口文件，不是业务页面地址。 |
| `shareScope` | yes | `string` | 共享分组名；不同作用域独立协商，默认 default。 |
| `timeout` | yes | `number` | 容器加载等待上限，默认 15000 ms；不取消浏览器动态 import。 |
| `retries` | yes | `number` | 失败重试次数，默认 2（上限 10；配置期与运行时注册均校验，非法当场抛错） |
| `fallback` | yes | `string[]` | 主入口失败后依次尝试的备用入口 URL 列表。 |
| `breaker` | yes | `{ threshold?: number; resetMs?: number; }` | 熔断阈值和恢复等待，默认 threshold=5、resetMs=30000；数值须为有限正数。 |
| `promise` | yes | `() => Promise<any>` | promise-based remote：运行时解析出容器或容器地址（其解析同样受 timeout 约束） |
| `manifestUrl` | yes | `string` | 内部：远程自报的发布路径（preload 用） |

## LoadShareOptions

加载共享依赖时的版本与作用域条件.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `requiredVersion` | yes | `string \| false` | 本次消费接受的 semver 范围；false 表示任意版本；本运行时调用不再从 package.json 推断。 |
| `singleton` | yes | `boolean` | 本次消费要求同一 shareScope/shareKey 复用单例；并不把不兼容版本变兼容。 |
| `strictVersion` | yes | `boolean` | 版本不满足时拒绝；运行时手动调用不继承构建配置推断的默认组合。 |
| `shareKey` | yes | `string` | 作用域中查找的依赖键，省略使用本次 name。 |
| `shareScope` | yes | `string` | 共享分组名；不同作用域独立协商，默认 default。 |
| `fallback` | yes | `() => Promise<any>` | 无可用共享模块时显式加载本地副本；严格版本冲突不被它掩盖。 |
| `localVersion` | yes | `string` | 内部：本地副本的版本号（fallback 回写共享作用域与 CJS 垫片 pin 使用；不参与快照键） |

## LoadRemoteOptions

远程加载重试、作用域与消费应用选项.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `shareScope` | yes | `string` | 共享分组名；不同作用域独立协商，默认 default。 |
| `retries` | yes | `number` | 加载失败后的重试次数，0–10 整数；省略沿用远程注册值（默认 2）。 |
| `fallbackModule` | yes | `() => any` | 远程模块加载失败时显式返回替代模块；初始化失败仍抛错，不静默伪装成功。 |
| `consumerApp` | yes | `unknown` | Vue remoteComponent/createHostPages 自动传入实际消费方 app，供 globalComponents 幂等注册；手动加载与 React 不自动传入。 |

## PreloadRemoteOptions

预载或预取远程资源.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `mode` | yes | `"preload" \| "prefetch"` | 默认 preload；prefetch 降低资源提示优先级，不自动空闲调度；见 API 的等待范围。 |

## RuntimePlugin

具名运行时 hook 插件.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `name` | yes | `string` | 可选插件诊断名称，便于区分 hook 来源。 |
| `init` | yes | `(hooks: RuntimeHooks) => void` | 注册插件时接收可填写的 hooks 对象；只安装所需 hook，不在此加载业务页面。 |

## RuntimeHooks

远程加载与共享裁决钩子.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `resolveShare` | yes | `(shareInfo: { shareKey: string; shareScope: string; requiredVersion?: string \| false; picked?: ShareEntry; available: ShareEntry[]; }) => void \| ShareEntry \| Promise<void \| ShareEntry>` | 覆写共享版本裁决结果：返回 ShareEntry 即生效 |
| `beforeLoadRemote` | yes | `(info: { remote: string; module: string; }) => void` | 远程加载前的观测 hook；抛错只记录告警，不修改加载裁决。 |
| `afterLoadRemote` | yes | `(info: { remote: string; module: string; module_ns?: any; }) => void` | 远程加载后的观测 hook，module_ns 为实际结果；抛错不改写结果。 |
| `onRemoteError` | yes | `(info: { remote: string; error: FgError; }) => void` | 接收远程错误及其 remote 标识，用于日志/诊断，不作为替代模块返回通道。 |

## RemoteDebugInfo

远程容器加载诊断快照.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `entry` | no | `string` | 远程容器入口 URL；运行时注册填写实际入口文件，不是业务页面地址。 |
| `status` | no | `"idle" \| "loading" \| "loaded" \| "failed"` | 容器状态 idle/loading/loaded/failed；loaded 不等于业务页面异步数据全部完成。 |
| `lastLoadMs` | yes | `number` | 最近容器加载耗时（毫秒），不是完整业务页面交付耗时。 |
| `error` | yes | `string` | 最近容器错误的说明字符串；不是 React 错误展示选项。 |
| `setup` | yes | `"none" \| "pending" \| "ready" \| "failed"` | 远程应用级 setup 状态，不是模块路径；ready 不代表会话或业务请求均已完成。 |

## FgRuntime

框架无关运行时对象.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `shareScopeMap` | no | `ShareScopeMap` | 当前共享注册表；只用于诊断，不直接写业务状态。 |
| `initSharing` | no | `(scopeName?: string) => ShareScopeMap` | 初始化指定作用域，默认 default；普通工程由插件调用。 |
| `registerShare` | no | `(scopeName: string, name: string, version: string, get: () => Promise<any>, opts?: { from?: string; eager?: boolean; loaded?: boolean; }) => void` | 登记一个依赖版本与加载工厂；普通工程由插件生成。 |
| `registerRemotes` | no | `(list: RemoteConfig[]) => void` | 批量登记远程配置，语义同 registerRemote。 |
| `registerRemote` | no | `(remote: RemoteConfig) => void` | 登记/更新远程配置，当场校验参数；地址为实际入口。 |
| `registerPlugins` | no | `(list: RuntimePlugin[]) => void` | 安装运行时 hooks；运行后改变共享策略不会改写已求值静态绑定。 |
| `loadShare` | no | `(name: string, opts?: LoadShareOptions) => Promise<any>` | 异步协商并取得共享模块；普通共享导入由插件转换。 |
| `loadShareSync` | no | `(name: string, opts: LoadShareOptions) => { kind: "ready" \| "local"; value?: any; }` | 生成的同步门面使用：返回 ready/value 或 local；不支持的异步裁决显式报错，不作为普通加载入口。 |
| `prepareShares` | no | `(requests: { name: string; opts: LoadShareOptions; }[]) => Promise<void>` | 生成入口执行前预先完成一组共享裁决；高级自定义接入使用。 |
| `getLoadedShare` | no | `(name: string, opts?: LoadShareOptions) => any` | 同步读取已就绪共享实例，未命中 undefined；不下载模块，严格版本错误仍可抛出。 |
| `pinLoadedShare` | no | `(name: string, opts: LoadShareOptions, localVersion: string, instance: unknown) => void` | 按实际版本登记已存在实例，不覆盖其他提供方事实；普通接入由插件处理。 |
| `loadRemote` | no | `typeof loadRemote` | 与对应公开入口的 loadRemote 相同；默认推导已同步入口，显式 `loadRemote<T>` 表示调用方接管类型。 |
| `getContainer` | no | `(name: string) => Promise<any>` | 加载并 init 远程容器，不执行业务 setup/onSession。 |
| `preloadRemote` | no | `(spec: string, opts?: PreloadRemoteOptions) => Promise<void>` | 资源预载，不执行模块；prefetch 不自动空闲调度，样式表可能影响当前页面。 |
| `parseSpec` | no | `(spec: string) => { remote: string; module: string; }` | 拆出 remote 与 ./module；仅远程名时 module 为空。 |
| `clearSessionState` | no | `() => void` | 作废 onSession 信号与去重记录，不删除 AppContext；退出通常用 clearAppContext。 |

## RemoteSetupContext

setup/onSession 收到的上下文.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `appContext` | no | `Readonly<Record<string, any>>` | 调用时取得的只读上下文快照；不是持续响应式订阅。 |
| `sessionKey` | yes | `string` | 非敏感登录代次；不同于用户 ID/token。声明 onSession 时需要，同一会话保持一致。 |
| `signal` | no | `AbortSignal` | 本次生命周期取消信号；异步等待后写状态前检查 aborted。 |

## RemoteSetupModule

远程 setup 模块及组件注册合同.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `default` | yes | `(ctx: RemoteSetupContext) => void \| Promise<void>` | 可选应用级 setup，每个远程容器成功执行一次；不是每个 app/组件实例的装配函数。 |
| `onSession` | yes | `(ctx: RemoteSetupContext) => void \| Promise<void>` | 按登录代次去重的同步/异步函数；换代失效旧信号，失败可重试。 |
| `globalComponents` | yes | `Record<string, unknown>` | 远程暴露面依赖的「宿主全局注册组件」声明（键=组件注册名，值=组件对象或零参 loader）： 组件联邦（remoteComponent）把远程组件渲染进消费方 app 上下文，模板里的 字符串标签（如 <a-divider>）按消费方 app 的全局注册表解析——消费方没注册就 渲染成死元素。提供方在此声明后，运行时在每次 loadRemote 时把它们幂等注册到 当次传入的 consumerApp 上；无 consumerApp（无组件上下文的手动加载）时静默跳过。 值推荐「零参 loader（() => import('./X.vue')）」：setup 模块保持零重依赖， 组件只在本框架消费方真实渲染时才加载——Vue 适配器注册时自动包 defineAsyncComponent； 静态组件值仍支持；带 displayName/props/emits 的零参函数保留组件身份，未标记零参函数作 loader。运行时对值原样透传。 |
| `pageProviders` | yes | `unknown[]` | 远程组件所需的祖先 Provider；元素为组件或零参 loader。由组件适配器包裹实际消费树，不复制提供方整个 app。 |

## AppContext

宿主提供给远程模块的应用与会话上下文.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `user` | no | `Record<string, any>` | 宿主登录用户原始形态（只读约定） |
| `getToken` | yes | `() => string \| undefined` | 调用时取最新 token，允许 undefined；有效性/刷新由业务认证负责。 |
| `store` | yes | `unknown` | 宿主 pinia 实例：子应用 useUserStore(ctx.store) 拿共享响应式状态 |
| `hostApp` | yes | `unknown` | 宿主 app 引用；子应用全局注册应取得实际消费方 app，不能用该引用替代。 |
| `locale` | yes | `unknown` | 显式传递的 UI 配置；业务按需消费，不自动安装语言 Provider。 |
| `events` | yes | `Record<string, any>` | 事件/方法池：events.main.* 宿主提供、events.bpm.* / events.lowcode.* 子应用反向注册 |
| `sessionKey` | yes | `string` | 非敏感登录代次 ID：宿主每次成功登录/重新登录生成新值，token 刷新但会话未变时沿用。 远程 onSession 按它去重（同一代次只执行一次）。不是用户 ID、不是 token、不作为授权凭证。 远程声明了 onSession 时必填（缺省即 MFU-013）。 |

## PagesOptions

页面表验证选项.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `deriveSpec` | yes | `(route: string) => string` | 带参路由的缺省 spec 推导规则（宿主私有约定，如 (route) => `pages/${route 去前缀去 :参}`）。 缺省 = 去掉首段（远程前缀）+ 剥 :参 段（无 pages/ 前缀）—— 推导只需在全部条目间自洽即可保持冲突判定成立。 |
| `remotes` | yes | `Record<string, string>` | 路由前缀 → remote 名（R3 用：{'/remote-a/': 'remote-a'}）；缺省跳过 R3 |
| `schema` | yes | `Record<string, RemoteSchemaEntry>` | 远程 exposes 探针表；使用公开 remoteSchema，不直接导入内部 virtual 模块。 |
| `strict` | yes | `boolean` | false = ERROR 降级 console.error（默认 true = throw） |

## PageViolation

页面表校验结果条目.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `rule` | no | `"R1" \| "R2" \| "R3" \| "R4" \| "R5"` | 违例所属 R1–R5 规则编号，详见逐页接入的校验表。 |
| `level` | no | `"error" \| "warn"` | error 表示确定性合同错误；warn 表示需评估的潜在问题。 |
| `message` | no | `string` | 包含实际问题与处理建议的说明，用于启动日志或 CLI 报告。 |

## RemoteSchemaEntry

一个远程 expose 的声明.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `exposes` | no | `string[]` | 该远程的公开 exposes 键列表，比较时去掉 ./ 前缀。 |
| `exists` | yes | `boolean` | manifest 是否成功拉取（false 时跳过该 remote 的 R3，诚实降级） |

## FgRemoteTypes — 远程类型注册表

> 检查方式：生成的 `registry.d.ts` 必须被包含在 TypeScript program 内（工程 `tsconfig.json` 的 include 覆盖 `src/fulgurjs/types/**/*.d.ts`），再用项目级 `vue-tsc -p tsconfig.json` 或 IDE 检查。只把单个文件交给 `tsc`/`vue-tsc` 检查不会加载 ambient 模块增强，拼错入口不会报错——这是检查方式问题，不是 moduleResolution 限制；`node`（node10）、`bundler`、`NodeNext` 均可解析本包类型。

三入口（`/runtime`、`/vue`、`/react`）共享的**可增强接口**，声明本体是包内静态共享文件（`./internal/registry.js` 子路径指向 `types/registry.d.ts`）——宿主生成的 `src/fulgurjs/types/<远程名>/registry.d.ts` 通过模块增强向它登记 `'<远程名>/<expose>': typeof import('<远程名>/<expose>')`。不要手工实现或扩展该接口：成员完全由插件的类型同步产物生成。

| 类型 | 语义 |
|---|---|
| `FgRemoteTypes` | 入口字符串 → 模块命名空间类型的注册表。未同步任何类型时为空（所有字面量放行、结果 `unknown`） |
| `FgStaticEntry<S>` | 字符串 API 参数面的静态检查（空注册表/动态放行；已登记收敛为字面量；未登记得到带修法文案的错误类型，调用点报错） |
| `FgRemoteModule<S>` | 入口对应的模块类型：已登记 → 模块命名空间；未同步/动态 → `unknown` |

框架入口的扩展检查类型（`/vue`、`/react` 再导出）：`FgComponentEntry<S>`（remoteComponent 只接受默认导出为组件的暴露项）、`FgBridgeEntry<S>`（桥接工厂接受带类型的桥接契约默认导出，包括 defineBridgeApp 与 defineApplication 的返回值）、`FgBridgeAppProps<S>`（从提供方声明提取的桥接 props）、`FgRemoteVueComponent<S>` / `FgReactRemoteProps<S>` / `FgVueRemoteProps<S>`（远程组件真实类型 / React props / Vue props 提取）、`FgVueBridgeWrapper<S>`（Vue 桥接包装组件）。语义与限制见 [API 参考 · 字符串 API 的入口检查](api.md#字符串-api-的入口检查类型注册表)。

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
| `loadingComponent` | yes | `Component` | Vue 加载占位组件，默认不设；不会自动生成业务骨架。 |
| `errorComponent` | yes | `Component` | Vue 加载错误占位，默认内置诊断/恢复按钮；自定义时完全接管，只接收 error prop。 |
| `retries` | yes | `number` | 加载失败后的重试次数，0–10 整数；省略沿用远程注册值（默认 2）。 |
| `delay` | yes | `number` | 显示加载占位前等待毫秒数，默认 200；不是请求超时。 |
| `timeout` | yes | `number` | 适配器本次等待上限（毫秒），默认不设；超时不取消已发出的共享请求。 |

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
| `mount` | no | `(el: HTMLElement, props?: Record<string, unknown>, options?: BridgeMountOptions) => void \| Promise<void>` | 挂载到给定容器；Promise 成功表示首次根提交，不表示全部业务异步完成。 |
| `unmount` | no | `(el: HTMLElement) => void` | 同步失效并清理该容器代次；抛错会封锁容器，不能假装可安全重挂。 |
| `routing` | yes | `BridgeRoutingProtocol` | 契约是否声明 URL 同步协议；不是路由对象或部署 base。 |

## BridgeSession

导入入口：`@fulgurjs/federation/vue`。`createBridgeSession` 的返回类型。

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `sessionKey` | no | `Ref<string \| null>` | 非敏感登录代次；null 表示退出。 |
| `renew` | no | `() => string` | 创建、保存并返回新的登录代次；不要在 token 刷新时调用。 |
| `clear` | no | `() => void` | 清除代次及存储，受控桥接随之卸载。 |

## VueBridgeAppContext

导入入口：`@fulgurjs/federation/vue`。桥接工厂第二参数，由插件提供；不包含业务 props。

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `signal` | yes | `AbortSignal` | 会话失效时取消；异步写回前检查 aborted。 |
| `routing` | yes | `BridgeChildRoute` | 宿主开启 URL 同步时的受控路由通道，见 URL 同步指南。 |

`hasBridgeMount(ctx)` 查询该工厂上下文的运行形态；不读取页面全局状态。

## VueBridgeAppFactory

创建独立 Vue 应用的工厂.

导入入口：`@fulgurjs/federation/vue`.

```ts
export type VueBridgeAppFactory = ( props: Record<string, unknown>, ctx?: VueBridgeAppContext, ) => VueApp | VueBridgeAppSetup | Promise<VueApp | VueBridgeAppSetup>
```

## VueBridgeAppSetup

导入入口：`@fulgurjs/federation/vue`。`defineBridgeApp` 的工厂可返回此对象，也可返回 Promise。必须声明 `{ routing: true }`；插件自动同步和安装 router，再 mount。

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `app` | no | `VueApp` | 未挂载的 app；业务插件已装配。 |
| `router` | no | `VueRouterLike` | 本应用的 memory router；守卫已注册、尚未 app.use(router)。 |

卸载、守卫失败、挂载失败时释放连接。不要复用已挂载 app 或已接线 router。无需 URL 同步时直接返回 app。

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
| `session` | yes | `() => string \| number \| null \| undefined` | 响应式非敏感身份；插件自动管理代次。null退出、undefined恢复中；不与sessionKey prop并用。 |
| `sessionStorageKey` | yes | `string` | 自动会话命名空间，默认fulgurjs-bridge-session；同一宿主的远程一致。 |


## VueBridgeRouterConnection

Vue 子应用 memory 路由连接与就绪/释放.

导入入口：`@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `ready` | no | `Promise<void>` | 必须 await ready 后再 app.use(router)，初始错误会拒绝此 Promise。 |
| `dispose` | no | `() => void` | 幂等释放当前路由连接/订阅；只清理该连接拥有的资源。 |

## BridgeHostRouting

宿主导航端口与子应用路径前缀.

导入入口：`@fulgurjs/federation/react`, `@fulgurjs/federation/vue`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `basePath` | no | `string` | 宿主路由视角的静态绝对路径，如 "/approval"；同页各同步实例不得相同或重叠 |
| `navigation` | no | `BridgeHostNavigation` | 宿主导航端口，由对应框架导航适配器创建；宿主持有浏览器历史。 |

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
| `error` | no | `unknown` | 本轮加载错误，无错时 undefined；请求代次隔离，不保留上轮错误。 |
| `loading` | no | `boolean` | 是否有请求在途 |
| `reload` | no | `() => Promise<void>` | 清空旧数据并重新走加载生命周期；卸载后调用不发起请求。成功模块复用缓存，Promise<void> 正常结束（不抛） |

## RemoteErrorBoundaryProps

React 渲染错误边界属性.

导入入口：`@fulgurjs/federation/react`.

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `children` | yes | `ReactNode` | 边界内需要保护的 React 子树；不包含另一桥接 root 的内部错误。 |
| `fallback` | yes | `ReactNode \| ((args: { error: unknown; reset: () => void; }) => ReactNode)` | 渲染错误时的节点或接收 error/reset 的函数；不是 pending 占位。 |
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

## ReactBridgeAppContext

导入入口：`@fulgurjs/federation/react`。桥接工厂第二参数，由插件提供；不包含业务 props。

| 字段 | 可省略 | 类型 | 说明 |
|---|---|---|---|
| `signal` | yes | `AbortSignal` | 会话失效时取消；异步写回前检查 aborted。 |
| `routing` | yes | `BridgeChildRoute` | 宿主开启 URL 同步时的受控路由通道，见 URL 同步指南。 |

`hasBridgeMount(ctx)` 查询该工厂上下文的运行形态；不读取页面全局状态。

## ReactBridgeAppFactory

创建 React 子应用元素的工厂.

导入入口：`@fulgurjs/federation/react`.

```ts
export type ReactBridgeAppFactory = (props: Record<string, unknown>, ctx?: ReactBridgeAppContext) => ReactElement
```

## ReactBridgeCancelPolicy

```ts
import type { ReactBridgeCancelPolicy } from '@fulgurjs/federation/react'
```

宿主导航预判函数：`(next: BridgeLocation) => boolean`。返回 `true` 允许进入下一地址，`false` 拒绝；不要把异步函数传给此同步预判。传给 `createReactBridgeNavigation(router, { canNavigate })`。

## ReactBridgeRouterConnection

```ts
import type { ReactBridgeRouterConnection } from '@fulgurjs/federation/react'
```

`createReactBridgeRouter` 的返回值。

| 字段 | 类型 | 用法 |
|---|---|---|
| `element` | `ReactElement` | 返回给桥接工厂，作为子应用根节点。 |
| `routerReady` | `Promise<Router>` | 等待 memory router 完成接线；依赖缺失会 reject。需要访问 router 时等待此 Promise，不假设 `element.props.router` 同步存在。 |
| `dispose` | `() => void` | 卸载时解除路由订阅与接线。与桥接生命周期清理一起调用。 |

## Application / ApplicationHandle

入口 / Entry: `@fulgurjs/federation/vue`, `@fulgurjs/federation/react`.

| 类型 / Type | 字段 / Fields |
|---|---|
| Application<P extends object> | BridgeApp + `__fgBridgeProps?: P` + `start(target: string \| HTMLElement, ...props: {} extends P ? [props?: P] : [props: P]): Promise<ApplicationHandle>` |
| ApplicationHandle | `element: HTMLElement`, `unmount(): void` |
| VueApplicationContext | `mode: 'standalone' \| 'bridge'`, `signal: AbortSignal`, `routing?: BridgeChildRoute` |
| VueApplicationSetup | `app: VueApp`, `router: VueRouterLike & { install(app: VueApp): void; isReady(): Promise<void> }` |
| VueApplicationFactory<P> | `(props: P, context: VueApplicationContext) => VueApp \| VueApplicationSetup \| Promise<VueApp \| VueApplicationSetup>` |
| ReactApplicationContext | `mode: 'standalone' \| 'bridge'`, `signal: AbortSignal`, `routing?: BridgeChildRoute` |
| ReactApplicationSetup | `element: ReactElement`, `dispose?: () => void` |
| ReactApplicationFactory<P> | `(props: P, context: ReactApplicationContext) => ReactElement \| ReactApplicationSetup` |

调用顺序和默认值见 [API 参考](api.md#同一应用独立启动与桥接defineapplication)。

## DefineVueBridgeAppOptions / DefineReactBridgeAppOptions

Vue 从 `/vue` 导入，React 从 `/react` 导入；defineApplication 与 defineBridgeApp 共用对应框架的选项类型。

| 字段 | 可省略 | 类型 | 默认与用途 |
|---|---|---|---|
| `routing` | 是 | `boolean` | false；true 声明宿主 URL 同步协议。defineApplication 不启用同步时也能安装本地 memory router。 |
