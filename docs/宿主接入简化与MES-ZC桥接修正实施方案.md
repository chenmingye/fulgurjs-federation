# 宿主接入简化与 MES-ZC 桥接修正实施方案

> 状态：待实施。本文是交给执行者的任务书，本文编写时没有修改插件或 MES-ZC 代码，也没有重跑用户已完成的测试。
>
> 测试约定：**8662 是专门用于本模块联邦项目测试与复测的端口**。本任务完成后，最新通过验收的 MES-ZC 构建须部署在 8662；测试结束**不要删除部署产物、不要停止 8662 的服务或释放该端口**，供用户随后自行复测。执行前确认现有 8662 实例的部署目录、进程归属与更新方式；只按本任务的测试站点流程更新，不误动其他服务。旧测试计划中“不要覆盖 8662”是当时那一轮隔离测试安排，不作为本任务的端口规则。
>
> 本轮执行顺序（用户 2026-09-24 补充）：**实现与文档完成 → 按仓库发布流程发新版 → 从 npm registry 安装该正式包 → 开发环境完整测试 → 8662 生产形态完整测试并保留站点**。发布前不再另安排一轮完整的 fixture、MES-ZC dev/prod 人工验收；这不等于跳过 `.github/workflows/publish.yml` 自带的构建与单测门禁。若门禁失败，先修复使发布能完成。正式包发布后发现问题，用新的版本修复并重新发布，最终在开发和生产环境都以最后一个已发布版本完成验收；不可拿本地源码或本地 tarball 冒充正式包。

## 阅读说明：这份任务书要解决什么

用户要的是**公开插件的接入体验变简单、解释得懂**，并让 MES-ZC 作为真实验证项目。具体包括：宿主桥不要留旧账号数据；宿主页面不再复制一大段路由/加载样板；远程应用若需要启动准备，插件提供一个明确的可选声明，使作者看见 `setup` 就知道“谁运行、何时运行”；生产形态测试部署在 8662，交付后仍可打开。本文选定目标用法、行为边界和验收方式，执行者不要把“写几个文档示例”当成完整实现，也不要把 MES 特有的权限、字典、组件注册变成所有项目的默认行为。

本文中的 `createHostPages`、`setup`、`onSession`、`sessionKey`、`clearAppContext`、`federationOptionsForApp` 是**拟新增或拟调整的目标 API**，当前 4.0.0 包不承诺已有这些能力。代码片段用于规定最终形态；执行者先完成代码、类型、构建与文档，经现有发布门禁发布新版本，随后以正式包完成真实项目验收。本文的“阶段”表示实现顺序，其验收标准集中在发布后判定。

## 1. 目标与边界

### 1.1 最终目标

1. 修复宿主桥在同一浏览器页面内切换登录态时可能沿用旧用户与旧凭据的问题；不再把 access token 伪装成 refresh token。
2. 让页面联邦接入只维护一份页面表、一份远程地址配置和少量 MES 业务钩子。URL 解析、远程启动去重、异步组件、错误占位、骨架屏与保活名称等通用逻辑由插件的**可选 Vue 宿主适配器**处理。
3. `fulgurjs.config.ts` 中已声明的应用名、远程地址、exposes、shared 等能直接生成 Vite 插件选项，避免 `init` 打印后人工复制并产生配置漂移。页面表仍是宿主应用代码，供路由和适配器共用；不在两处维护同一批页面。
4. 把“暴露一个 TS 启动器，再由宿主手动取模块、判断 default/具名导出并调用”的惯用接法，提升为可选且有文档的远程初始化能力；保留原始 `exposes` 供普通模块/组件使用。
5. 保留当前 `federation({...})`、`remoteComponent()`、`loadRemote()` 的用法；普通组件联邦接入无需创建 MES 式的 `bridge.ts`、`pages.ts` 或 `federatedBoot.ts`。

### 1.2 不纳入通用插件的内容

- MES-ZC 的 `ACCESS_TOKEN` 缓存协议、Jeecg 用户信息、Pinia 实例、Element Plus locale、全局组件/指令、乾坤路由清理和 27 个菜单页均为项目代码。
- 不把 `/flowable`、`/lowcode`、内网地址、8662 或 MES 专用垫片写进公开插件默认值、CLI 通用模板或 npm 包示例。
- 本任务不顺便重构 MES 业务页面、权限实现或其他应用；不改用户已经通过的测试结论。

## 2. 已核实的现状与问题

| 位置 | 当前行为 | 应处理的问题 |
|---|---|---|
| `testbed/mes-zc/cku-mes-admin/src/fulgurjs/host/bridge.ts` | `bridged` 一旦设为 `true` 就不再同步 `user`、BPM 缓存及 context；`REFRESH_TOKEN` 被写成宿主 access token | 同页退出、换账号、token 更新后可能留下旧快照；BPM 的 `getRefreshToken()` 会读取伪造值并用于刷新接口 |
| 同目录 `pages.ts` | 页面表之外又写了远程判断、spec 推导、URL 匹配、boot Promise 缓存、Vue 异步组件、骨架屏、错误展示、保活命名 | 可复用的逻辑过多，迁入下一项目时需要复制大量代码；spec/remote 规则有多处定义 |
| `src/router/routes/staticRouter.ts` 与 `src/layouts/default/content/index.vue` | 两处都根据联邦页面表接入页面，布局还自行匹配路径和调用桥 | 接线重复。两处是否会造成实际双渲染，须以路由树和浏览器行为验证，不能仅凭代码断言 |
| `packages/plugin/src/init.ts`、`config.ts` | `init --config` 校验后输出供粘贴的 Vite 配置；`federation()` 不读取它；`HostConfig.pages` 为必填 | “单配置”目前不是执行时的唯一来源；更改地址/exposes 需保持手工同步 |
| `packages/plugin/src/vue-adapter.ts` | 已有 `remoteComponent()` 处理简单 Vue 组件加载及默认错误占位 | 应在此能力基础上扩展可选宿主页面适配器，避免另写一套互不一致的组件加载逻辑 |
| `testbed/mes-zc/cku-mes-bpm/src/fulgurjs/exposes/` | 目录中只有 `TaskCard.vue` 与 `federatedBoot.ts`；Vite 将后者声明为 `./federatedBoot`，宿主在 `pages.ts` 中用 `loadRemote('mes-bpm/federatedBoot')` 后手动调用 | 目录名没有插件魔法；使用者必须自己理解暴露、加载、执行、时序、缓存和失败重试，接入成本高 |

相关契约：`packages/plugin/src/pages.ts` 的 `definePages` 已校验剥参冲突、spec 存在性、路由遮蔽和重复名称，应复用；`packages/plugin/src/context.ts` 的 `provideAppContext` 为浅合并且没有清理 API，执行者需明确登录态切换的清理语义。

**先做基线记录**：确认 Git/SVN 归属、实际工作副本和 `git status`/`svn status`。本仓库 `testbed/` 被 `.gitignore` 忽略，不能把仅改 testbed 当作已交付的插件变更。记录三个应用的 npm 包实际版本、Vite 配置、现有页面表、dev 端口、8662 的运行实例和测试账号/环境；保护已有未提交文件。不要凭旧文档中的服务状态或端口占用推断现场状态。

### 2.1 当前 `federatedBoot.ts` 到底怎么工作

`exposes/` 只是项目自行选择的源码目录，插件不会扫描它。BPM `vite.config.ts` 中的 `exposes: { './federatedBoot': './src/fulgurjs/exposes/federatedBoot.ts' }` 才使该 TS 模块成为可被宿主读取的远程模块；普通 `loadRemote('mes-bpm/federatedBoot')` **只取得模块导出，不调用函数**。宿主 `pages.ts` 的 `bootRemoteOnce()` 才负责取出 `default` 或 `federatedBoot` 函数、执行、缓存 Promise，再加载页面。`TaskCard.vue` 则是普通暴露组件，演示页直接加载它，没有经过页面启动器。这个差别要在公开文档和项目接入说明中用完整示例讲清楚。

BPM 启动器目前承担的是项目适配：加载全局样式、从宿主 context 取 `store/user/hostApp/locale`、给宿主及 BPM 自有 Pinia 的用户 store 写权限、拉字典、切回宿主 active Pinia、注入 Element Plus locale、注册 form-create 全局组件。**这些动作有真实业务原因，不应机械删掉或直接塞进通用插件。**但需检查以下具体问题：

- 文件注释称 `memoized`，实际存在两层缓存：宿主 `bootRemoteOnce()` 与 BPM 模块内部的 `booted` Promise。确定两层的职责与失败重试是否一致后，只保留必要的一层；若有会话敏感状态，不能继续“一次成功后整个页面永不重做”。
- `hostApp?: App` 可选参数与 `ctx.hostApp` 是两条来源；宿主当前无参调用。明确单一来源和优先级，验证 `hostApp` 缺失时应报错，而不是跳过必需的组件/locale 注册继续渲染。
- `userStore.permissions` 和 BPM 自有 store 的 `user.id/permissions` 在登录态改变后不会因 `booted` 已完成而更新。应把“应用级只做一次的注册”和“每个会话都要同步的用户、权限、token/字典”分开。
- `useUserStoreWithOut()` 关联 BPM 自有 Pinia，`setActivePinia(mainStore)` 是现有兼容步骤；调整时检查异常路径与最终 active Pinia，避免初始化失败后留错全局实例。
- 样式导入需保证 dev 与 prod 的 expose CSS 仍可用；改为新初始化 API 后不得丢失 manifest CSS 或页面样式。
- BPM `dictStore.setDictMap()` 会在异步接口返回后直接写 store 和 sessionStorage 缓存。若执行期间发生退出/换账号，旧请求可能晚于新会话提交；会话迁移时要处理这条实际写入链，不能只在调用前检查一次 `sessionKey`。
- 低代码的 `setupLowDesagn()` 和 `setupAvue()` 声明为 async，但现有 `federatedBoot.ts` 没有 `await`。迁移后要等待其完成或确认其同步完成语义，否则“setup Promise 已完成”并不等于全局插件安装已完成。

## 3. 目标 API 与使用形态

### 3.1 普通用法

纯组件联邦仍采用现有 API：Vite 中一次 `federation({ name, remotes/exposes, shared })`，Vue 中 `remoteComponent('remote/Widget')` 或 `loadRemote('remote/api')`。宿主页面适配器、AppContext 和启动器都是**按需使用**的增强项。

### 3.2 需要页面路由的宿主

建议在 `@fulgurjs/federation/runtime` 增加 `createHostPages`，以项目侧页面表为唯一页面来源。下例是目标接口，不是现有 API；最终类型名可以依照仓库命名规则微调，但行为契约不得遗漏：

```ts
import { createHostPages, remoteSchema } from '@fulgurjs/federation/runtime'
// syncMesHostContext、MesSkeleton、MesError 由 MES 宿主项目提供

export const hostPages = createHostPages({
  pages: [
    { route: '/flowable/bpm/task/todo', name: 'BpmTodoTask', title: '待办任务' },
    { route: '/flowable/bpm/manager/model/:type/:id', name: 'BpmModelUpdate',
      spec: 'pages/bpm/manager/model/update', title: '修改流程' },
  ],
  remotePrefixes: { '/flowable/': 'mes-bpm' },
  deriveSpec: route => `pages/${route.replace(/^\/flowable\//, '').split('/').filter(s => !s.startsWith(':')).join('/')}`,
  schema: remoteSchema,
  beforeLoad: syncMesHostContext,
  // 远程若声明 setup，插件会在实际加载页面模块前执行；无需在此手动取 TS 导出
  loadingComponent: MesSkeleton,
  errorComponent: MesError,
})

// 同一对象供宿主路由与布局使用：
hostPages.pages                 // 原页面记录；支持 name/title/keepAlive
hostPages.resolve(path)         // { page, remote, spec, params } | null
hostPages.component(spec)       // 同 spec 复用异步组件
hostPages.keepAliveNames        // 与实际缓存组件 name 一致
```

契约：

- `createHostPages` 内部调用现有 `definePages`，保留 R1–R5 的校验行为；dev 用 `remoteSchema` 校验 exposes，build 为空表时按现有语义诚实降级。
- `remotePrefixes` 使用**最长前缀匹配**，不能默认把所有非 `/lowcode/` 路由归给 BPM。无匹配前缀应给明确错误；`spec` 允许显式覆盖，带参路由不能被自动推导误映射。
- `resolve` 应处理 Vue Router 的路由路径与浏览器深链，明确 base 的传入/剥离方式；参数解码失败只让该路径匹配失败或返回清楚的错误，不能让整个页面初始化崩溃。
- 加载顺序为宿主 `beforeLoad` → 远程可选 `setup` → 页面模块；`beforeLoad` 可同步或异步。初始化失败要清除该次缓存并显式报错，允许用户修复远程服务后重试。无 `setup` 的远程直接加载页面。
- 不修改远程模块导出的组件对象（当前 `comp.name = ...` 可能改动共享模块）。如保活需稳定名称，通过本地包装组件实现，并验证 Vue `KeepAlive` 匹配的是实际被缓存的组件。组件 key、`params + query` 透传、路由切换后的重挂载与保活行为须与现状一致。
- 错误态继续显式展示错误码、根因和修法；不静默退回乾坤或空白页。`loadingComponent`/`errorComponent` 可自定义，缺省复用已有 Vue 适配层行为；预载保留可关闭、可指定名单的设置。
- 不强迫每个远程都提供初始化模块；业务初始化内容由 MES 提供，插件只处理加载、调用、时序和错误语义。

`staticRouter.ts` 与 `LayoutContent` 要选定**唯一实际渲染入口**，另一处只保留必要的路由注册或布局分支。先用路由树、页面挂载次数和 tab 行为确认现状，再删重复调用；保留后台菜单路由剔除与 `/flowable`、`/lowcode` 路径识别的 MES 业务逻辑，不把它内置于插件。

### 3.3 远程初始化的推荐产品 API

推荐把远程初始化声明在远程应用的 `federation()` 配置中，名称用清楚的 `setup`，它是**可选项**，不是 `exposes/` 目录约定。以下是目标用法，尚未实现：

```ts
// mes-bpm/vite.config.ts：普通组件/页面仍写 exposes；初始化文件单独声明
federation({
  name: 'mes-bpm',
  exposes: { './TaskCard': './src/fulgurjs/exposes/TaskCard.vue', /* pages... */ },
  setup: './src/fulgurjs/setup.ts',
})

// mes-bpm/src/fulgurjs/setup.ts：默认导出只执行一次；可选具名导出按会话执行
import type { RemoteSetupContext } from '@fulgurjs/federation/runtime'
export default async function setup(context: RemoteSetupContext) {
  // 注册宿主全局组件与样式等应用级动作
}
export async function onSession(context: RemoteSetupContext) {
  // 同步当前用户、权限与字典等会话级动作
}

// admin：先提供宿主 context，后加载页面；不再手写 loadRemote('mes-bpm/federatedBoot')
provideAppContext({ user, getToken, store, hostApp, locale, sessionKey }) // sessionKey 是非敏感登录代次，不是 token
const page = await loadRemote('mes-bpm/pages/bpm/task/todo')
```

实现契约须同时满足：

1. 插件构建/dev 容器在配置了 `setup` 时携带其模块引用或保留的内部 expose，并在元数据中声明；宿主无需手写 `./federatedBoot` 键。`loadRemote('remote/Page')` 在取得容器、完成 shared 协商之后、返回业务模块之前执行 setup。无 `setup` 时保持现有行为和体积。`preloadRemote()` 只预取资源，**不执行**带业务副作用的 setup。
2. setup 文件要求一个默认导出 `setup(context)`，只做应用级一次性注册；可选具名导出 `onSession(context)` 专管用户、权限等会话状态。其他导出形式不作为自动入口。导出不是函数时给出实际路径、预期签名和修法。两者都不得调用同 remote 的 `loadRemote()`；检测自递归并给明确错误，不能永久挂起。
3. 同一 remote 容器的 `setup` 并发去重且成功后不重复；`onSession` 按非敏感 `sessionKey` 去重，同一登录代次只执行一次，换账号或重新登录必须重新执行。`sessionKey` 不得直接使用 token。任一步失败只清除对应 Promise 缓存，支持重试；退出清理 context 时失效会话缓存，但不重复执行应用级组件注册。远程未导出 `onSession` 时无需 `sessionKey`；导出了却没有 key 则报错，不凭用户对象引用或 token 猜测身份。
4. 远程加载失败、setup 抛错、缺 context 键、错误导出都走可观察且可重试的错误路径；不得返回空页面、跳过初始化或悄悄回退乾坤。新能力保持 runtime 框架无关、现有 gzip 门禁和共享依赖协商，dev/prod 行为一致。
5. 旧的 `exposes: { './federatedBoot': ... }` + 手动 `loadRemote` 仍可运行，便于旧项目分批迁移。MES-ZC 三应用切换时保留可回退接线；移除 BPM/lowcode 中不再使用的 expose 键及宿主的手动 boot 代码前检查全部引用和生成类型。新时序的独立 fixture 验证集中到正式包发布后执行，不安排发布前额外测试轮次。

公开文档至少包含三个由浅入深的**可运行**示例：① 普通 Vue 组件（无 setup）；② 普通 TS 函数模块（`exposes` + `loadRemote`，明确“加载不等于调用”）；③ 需要宿主环境的远程页面（`setup` + AppContext + 会话切换）。为每例写清谁配置、谁调用、何时执行、失败如何重试，以及 dev/prod 差异。同步修正 README 中“登录刷新 = 页面刷新”的旧表述，避免与本任务的同页换账号验收冲突。

#### 3.3.1 固定的公开签名和时序

建议公开类型如下。若执行时发现命名与现有公开类型冲突，可以改名，但必须同时改所有示例、声明文件和验收用例；不得保留“或等价机制”而不说最终语义。

```ts
interface FederationOptions {
  /** 可选；相对本应用根目录的 TS/JS 模块路径。缺省时无初始化行为。 */
  setup?: string
}

interface AppContext {
  /** 宿主每次成功登录/重新登录生成的非敏感代次 ID；不是用户 ID 或 token。 */
  sessionKey?: string
}

interface RemoteSetupContext {
  /** 调用时从 getAppContext() 取得的当前上下文，不保存为永不更新的旧快照。 */
  appContext: Readonly<AppContext>
  /** 取自 appContext.sessionKey；只用于 onSession 的去重。 */
  sessionKey?: string
  /** 登录代次变化或退出时撤销；业务异步操作写入状态前须检查。 */
  signal: AbortSignal
}

// setup.ts：只有这两个函数名有自动生命周期语义
type RemoteSetupModule = {
  default: (ctx: RemoteSetupContext) => void | Promise<void>
  onSession?: (ctx: RemoteSetupContext) => void | Promise<void>
}
```

`setup` 的默认导出在远程容器完成 `init(shareScope)` 后、首次业务 expose 返回前执行一次。它用于注册全局组件、指令和应用级配置；同一容器并发调用共享一个 Promise，成功后不再重复。`onSession` 若存在，必须在宿主已提供 `sessionKey` 后执行；它负责用户、权限和其他会变化的数据。相同 `sessionKey` 的并发调用共享一个 Promise，新的登录代次重新执行，调用成功后才允许页面模块返回。**没有 `onSession` 的远程无需 `sessionKey`；有 `onSession` 却缺 `sessionKey` 时明确报错**，不猜测当前用户是谁。生成 `sessionKey` 的责任在宿主登录流程：每次成功登录/重登产生新代次，token 刷新但用户会话未变时沿用该代次；不得使用真实 token 充当 key，也不得把它当授权凭证。

`loadRemote('remote/Module')` 是触发上述生命周期的统一入口。`remoteComponent()` 和宿主页面适配器应复用这条路径。`preloadRemote()` 只下载资源，`getContainer()` 只返回容器，不执行业务 setup。直接访问 `container.get()` 属低层接口，也不保证执行 setup；公开文档要写明，避免用户以为任意加载方式都能自动启动。`loadRemote('remote')` 只取容器，也不执行 setup。普通 TS 方法模块仍是 `exposes`，`loadRemote` 返回命名空间，调用者显式执行某个方法；**只把配置在 `setup` 的文件视为生命周期入口**，不扫描目录、不按文件名猜测、不执行所有 TS exposes。

新登录代次到来时，先使旧 `onSession` 的 `signal` 失效，再按远程串行完成旧调用与新调用，防止两个账号的异步写入交错。MES 的 `onSession` 在任何 `await` 后、写入 store/cache 前检查 `signal.aborted`，并停止旧会话结果的提交；只靠 runtime 切换缓存键不能阻止业务代码写旧值。退出调用 `clearAppContext()`：清除旧 context、使当前会话信号失效并失效 `onSession` 去重状态；容器、共享模块和应用级 `setup` 保留。下一次登录的 `onSession` 必须重新执行。若退出时仍有旧业务请求，必须证明其结果不会覆盖新账号状态。

`setup` 或 `onSession` 抛错时该次 `loadRemote` 拒绝，不能返回页面组件；只删除失败的初始化 Promise，已成功的其他阶段不重复。远程入口、模块获取和共享协商的现有错误码继续沿用。新增初始化错误应有独立、稳定的错误码（建议 `MFU-011` 非法 setup 导出、`MFU-012` setup/onSession 执行失败、`MFU-013` 缺 sessionKey、`MFU-014` 初始化自递归；落地时核对未被其他分支占用），每个错误都带 remote 名、模块路径/阶段、实际结果、预期和修法；不得记录 token 或敏感 context 内容。`fallbackModule` 只能按原有显式选项处理模块/网络故障，**不得掩盖 setup 或会话初始化失败**。失败后同一远程再次加载要能重试，不能被旧 rejected Promise 永久卡住。

#### 3.3.2 容器与构建实现边界

当前插件容器的公开低层接口是 `name`、`init()`、`get()`，见 `packages/plugin/src/virtual.ts`。不要把业务 `setup` 混进容器 `init()`：`init()` 是 shared 协商阶段，宿主此时未必已经提供 AppContext。建议在 dev/prod 容器附加一个明确的可选元数据字段，指向内部保留的 setup expose；运行时在 `init()` 之后通过容器获取该模块并调用。内部 key 要避免与用户 `exposes` 冲突；配置时若发生冲突直接报错。dev manifest 和 prod manifest 要让 doctor/预载/诊断知道 setup 资源，但不得误把内部 key 列为用户公开 API 或生成用户可 import 的类型。若元数据不存在，运行时完全走现有加载路径。

`packages/plugin/src/options.ts` 负责校验 `setup` 是项目内可解析文件；`virtual.ts` 负责 dev/prod 容器一致的模块映射与元数据；`runtime/index.ts` 负责时序、缓存、信号和错误；`context.ts` 负责清理与 sessionKey 类型；`runtime-entry.ts` 和生成脚本负责公开导出与构建后的实际运行时图；`manifest.ts`、`doctor.ts`、`dts.ts` 按内部资源/公开 expose 边界同步。不要手改 `runtime-code.gen.ts` 等生成物来代替源代码和构建脚本修改。新增核心逻辑必须在打包后的安装形态验证，不能只在源码 Vitest 中通过。

官方 [Webpack Module Federation 容器说明](https://webpack.js.org/concepts/module-federation/) 将容器 `init()` 用于共享作用域，`get()` 用于获取暴露模块；它没有定义 MES 式的应用启动函数。本方案的 `setup` 是 fulgurjs 的**显式可选产品能力**，不应伪称为容器协议自带功能。设计选择如下：

| 方案 | 使用者看到的接法 | 决定 |
|---|---|---|
| 继续手动暴露 `federatedBoot.ts` | 远程配 exposes；宿主 `loadRemote()`、判断导出、调用、缓存、重试 | 保留兼容，不作为新项目的推荐接法 |
| 自动扫描 `exposes/` 或按 `federatedBoot.ts` 文件名启动 | 少写配置，但改目录/改名会悄悄改变运行行为 | 否决：隐式规则难发现、难诊断 |
| `federation({ setup: '...' })` | 远程显式声明，宿主正常 `loadRemote()`；插件执行时序 | 推荐：配置即说明意图，普通模块仍保持原始语义 |

### 3.4 配置直接用于 Vite

建议在 `@fulgurjs/federation/config` 增加一个纯转换函数 `federationOptionsForApp(config, appPathOrName)`，把已有 `RepoConfig` 转成 `FederationOptions`；另提供读取文件的异步便捷函数。宿主 `vite.config.ts` 可写成：

```ts
// cku-mes-admin/vite.config.ts（目标示例；保留原有其他 Vite 配置）
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { federation } from '@fulgurjs/federation'
import { loadRepoConfig, federationOptionsForApp } from '@fulgurjs/federation/config'

export default defineConfig(async () => {
  const configPath = fileURLToPath(new URL('../fulgurjs.config.ts', import.meta.url))
  const repo = await loadRepoConfig(configPath)
  return { plugins: [federation(federationOptionsForApp(repo, 'cku-mes-admin'))] }
})
```

转换范围：`name`、宿主/反向 `remotes`、`exposes`、可选 `setup`、`shared`、双角色所需 `devSharedSelf`。`build.target`、base、端口、代理、业务插件顺序等仍归各应用 Vite 配置管理。必要时扩展 `AppConfig` 以表达“双角色宿主 exposes”；不要为了自动化丢失现有宿主的 `FormRouterPage` 等 expose。多个字段来源冲突时校验并报出具体应用、字段和两边值，不静默覆盖。

`HostConfig.pages` 不应继续强制在仓库配置中复制 27 条页面。调整为可选，CLI 摘要只报告实际提供的数量；应用代码页面表是运行时页面真源。旧配置仍可加载；旧 `federation({...})` 仍可运行。`init --config` 保留站点模板、部署检查清单等用途，但“复制配置块”降为辅助输出，并给出可执行的 `federationOptionsForApp` 用法。执行者需同步公开 README 的完整签名、字段、默认值、关闭/自定义示例与迁移说明。

## 4. 分阶段实施任务

### 阶段 A：MES 桥接正确性（先完成）

1. 找出 admin 登录、token 更新、退出入口及 BPM 刷新请求调用链；记录本地缓存真实协议。当前 admin 仅见 `getToken()`，不能假设有真正的 refresh token。
2. 将 `bridged` 布尔闩锁改为可随认证状态重新同步的策略：初次进入、用户或 token 变化时更新 context 与 BPM access token；退出时清理 BPM 认证缓存和用户快照。`getToken` 函数引用继续返回实时值。对同步失败不要提前标记为成功。
3. 移除“access token 写入 `REFRESH_TOKEN`”的逻辑。若宿主没有真正 refresh token，BPM 的 401/刷新行为应使用经核实的宿主重新认证或明确失败路径；不得造一个 refresh token。核对 BPM `src/config/axios/service.ts` 与依赖它的上传请求，再决定最小项目侧修改。
4. 若 context 的浅合并无法删除旧用户字段，在插件提供 `clearAppContext()` 或等价明确清理能力，并定义它清理 AppContext 与会话初始化状态，但不重置远程模块缓存或共享模块图；退出时调用。更新 `context.ts` 旧入口注释中已过时的 `/context` 子路径和 token 快照示例。
5. 空闲预载只在有效登录态启动；登录态切换不累积过期定时器或无界重复预载。预载失败依旧不阻断业务。

**阶段 A 验收**：同页 A 账号登录 → 打开 BPM/lowcode → 退出 → B 账号登录 → 再打开；`user`、`getToken()`、BPM 缓存和真实业务请求均属于 B；退出后无 A 的旧值。模拟过期/401，证明请求没有使用宿主 access token 冒充 refresh token。写针对状态迁移和错误路径的有意义回归测试。

### 阶段 B：远程初始化与可选宿主页面适配器

1. 先锁定 `pages.ts` 的 27 页清单、显式 `spec`、命名路由、参数/查询、保活页和加载顺序作为迁移基线；检查 `staticRouter.ts`、`LayoutContent`、`permission.ts`、演示页的全部调用方。
2. 按 §3.3.1 的公开契约实现可选 `setup`，同时编写有意义的独立 fixture/自动化断言：配置校验、dev/prod 容器元数据、首次加载时序、并发去重、失败重试、同页会话切换、预载无副作用、旧手动 expose 兼容。发布前不单独组织完整 fixture 验收；在发布流程的既有门禁通过并发布后，用 registry 正式包运行这些验证。不要直接把 BPM 的单次 `booted` Promise 搬进插件。
3. 在插件 Vue 适配层实现 `createHostPages`，复用现有 `definePages`、`loadRemote`、`remoteComponent` 的错误与缓存语义；框架无关 runtime 内核不新增 Vue 静态依赖或 MES 逻辑。同步 exports、类型产物、构建脚本与 README。
4. MES 页面表保留为项目数据；用新适配器替代通用解析/加载代码。BPM 与 lowcode 的初始化迁到可选 `setup`，宿主负责先提供最新 context；保留项目侧 UI 骨架屏/错误样式和必要的乾坤迁移兼容逻辑。对两个远程各自核对权限、字典、全局组件、locale 与样式，不因改名而省略功能。
5. 检查静态路由与布局实际渲染链，再让路由注册、布局、tab 共用同一个 `hostPages` 对象，消除重复映射规则和重复桥调用。删除旧 helper 前搜索全部静态/动态引用。

**阶段 B 验收**：27 页路径、参数页、命名跳转、菜单与详情弹窗均落到原 expose；同 remote/会话的 setup 不重复执行，换账号后会话状态更新；setup 失败后可重试；保活页面能保活，关闭保活的重型页面会重新挂载；浏览器中每次导航只有一个实际联邦页面实例。插件使用者无需手写“加载 TS 启动器并调用”的代码。

### 阶段 C：单配置驱动 Vite

1. 从三应用当前 `vite.config.ts` 与部署配置整理真实值，新建项目侧 `fulgurjs.config.ts`；先做字段对照，证明转换结果与原配置一致，再切换 Vite 调用。
2. 扩展 `config.ts` schema 与转换函数；涵盖纯宿主、纯远程、双角色、显式 `devSharedSelf`、自定义 shared、空 pages，以及不存在应用/重复应用名/地址错误的诊断。
3. 更新 `init` 输出和 README。不要在 Vite 每个热更新周期写宿主源码；若提供配置文件热更新，明确需要重启 Vite 的字段，并给出提示。
4. 三应用逐个切换，保证 dev/prod URL、base、exposes、shared 协商以及 admin 的 `postBuild` 不变。无意修改的源码及依赖保持原状。

**阶段 C 验收**：改一次仓库配置中的远程地址或 exposes 后，Vite 有效选项随之变化，不再存在第二份手写值；旧方式依旧可用；错误配置在启动时指出具体字段与修法。

## 5. 发布后验证矩阵与证据

以下是**正式 npm 包发布后的集中验收**，不是要求先用本地未发布源码完整测一轮、发版后再重测一轮。发布工作流自带的 build、gzip/错误码门禁和 unit tests 必须照常通过；不要为省一轮测试而绕过或修改发布门禁。MES-ZC 三应用必须从 npm registry 安装同一新版本，核对实际安装版本、锁文件 registry 解析、tarball integrity 与 release/tag/commit 一致。**发布后开发环境和生产环境都要完整测试**，分别记录证据；任何一边通过都不能代替另一边。

| 层次 | 必做检查 |
|---|---|
| 插件包 | `pnpm` 仓库支持的 typecheck、相关 Vitest、build；确认发布包 exports、类型声明、ESM/CJS 条件和现有 gzip 门禁。新增测试覆盖解析、前缀优先级、参数错误、setup 并发/失败重试/会话切换、无 setup、预载无副作用、配置转换、兼容旧 API |
| MES-ZC dev | 三应用安装同一已发布 npm 正式包后按现场配置启动；完整验证 dev schema、27 页真实内容、参数页、菜单与命名跳转、保活、错误显示、A→退出→B、BPM 401/刷新、低代码组件注册、关键业务交互与故障恢复。记录端口、命令、截图、接口结果与控制台结果 |
| MES-ZC prod | 三应用安装同一已发布 npm 正式包后，从本轮源码构建，admin 执行 `postBuild`；将最新构建部署到 **8662**，验证主入口、两个 remoteEntry、两个 manifest、深链刷新；完整验证 27 页、关键交互、账号切换和故障恢复。先核实 8662 实例归属，按本任务测试站点流程更新 |
| 负向用例 | 远程停用或在隔离浏览器会话中拦截入口出现明确错误；恢复后重试成功；错误 `spec`、重复/遮蔽路由、未知 remote、缺 context 键均给可操作提示；无有效 refresh token 时不发送伪 refresh 请求 |

关键交互沿用既有 MES-ZC 验收口径：待办真实审批闭环、流程模型新增/复制、低代码设计器 JS/SCSS/预览、签署认证弹窗层级、接口结果与页面结果。不能只以按钮存在、HTTP 200、fixture 通过或脚本退出码 0 代替真实业务结论。截图放任务独立证据目录并列索引；测试完只清理本任务启动的非 8662 临时进程、临时文件和数据。**8662 的服务与其部署产物保留，不停止、不删除；最终报告给出复测 URL、部署目录、进程/服务名、构建版本与验证时间。**

## 6. 交付与回退

- 交付代码、插件 API 文档、MES 项目侧接入说明、配置迁移示例、测试记录。报告每一阶段实测结果及未验证项；不沿用旧报告中的“已通过”作为本轮结论。
- 交付时保留 8662 测试站点持续可访问，供用户随后复测。不要把“清理本任务进程”套用到该端口；只有用户以后明确要求停止或删除时才处理。
- 阶段 A 可单独落地。阶段 B/C 都必须保留旧 API；若真实 MES 回归失败，先回退该阶段的接线到原有 `pages.ts` 或手写 `federation({...})`，不要连带撤销已验证的认证修正。
- 用户已明确要求“发版之后再测试”，本任务执行者应按仓库现有发布流程完成新版发布并确认 npm registry 可安装，然后开展本节验收；这不授权跳过发布工作流的自动门禁。Git/SVN 改动范围、凭证和分支权限仍以执行时现场状态为准；不能发布时应给出具体阻塞，而不是用本地包代替发布测试。

## 7. 完成判定

普通组件用法不需要宿主桥/页面适配器/启动器；远程业务初始化有明确的可选 `setup` API，作者能从公开文档理解 TS 模块的暴露、加载与执行关系；MES-ZC 只维护一份页面表和一份远程地址/exposes/shared/setup 配置；同页换账号不留旧凭据；发布后 dev 与 8662 生产形态的 27 页和关键业务均验收通过，且 **8662 在交付后保持运行**；公开 API、类型、README 与实际构建产物一致。任一项缺失，应明确写“未完成”及复现证据，不能仅交付新的 API 外观。

## 8. 逐文件工作清单：执行时照此核对

下表按职责给出预计修改面。文件名以当前仓库为准；若执行前源码变化，先重新搜索调用方再调整清单。表中的“验证”必须对实际编译产物和浏览器行为成立，不是只确认源码文字出现。

| 范围 | 文件与动作 | 验证点 |
|---|---|---|
| 插件配置 | `packages/plugin/src/options.ts` 增加 `setup?: string`，校验路径、保留 key 冲突、纯远程/双角色合法性；`config.ts` 的应用配置和 `federationOptionsForApp` 保留该字段 | 非法路径/错误类型在 Vite 启动或构建时有具体报错；配置转换不漏 `setup` |
| 容器生成 | `virtual.ts` 的 dev/prod 入口提供同一 setup 元数据和内部模块映射；`index.ts` 把 setup 源文件纳入解析与打包；只在显式配置时生成 | 远程入口含可解析 setup；无 setup 的 fixture 产物行为与现状相同；内部模块不变成公开 expose |
| 运行时 | `runtime/index.ts` 在 `loadRemote` 路径内完成 init 后的 setup/onSession，加入并发 Promise、会话版本、失败清理和诊断；`context.ts` 实现 `clearAppContext` 与 `sessionKey`；`runtime-entry.ts` 与生成脚本导出类型和方法 | 同一页面多份 runtime 使用同一状态；`preloadRemote`/`getContainer` 无业务副作用；打包后的 `/runtime` 仍只有预期的内核实例 |
| manifest/类型/诊断 | `manifest.ts`、`doctor.ts`、`dts.ts` 及相关解析器按内部 setup 与公开 exposes 的区别更新；README 错误码与入口导出表同步 | doctor 能检查 setup 资源；dts 不生成让用户误导入内部 setup 的声明；错误码在 dev/prod 一致 |
| 宿主适配器 | `vue-adapter.ts` 或同层新增 `createHostPages`，`runtime-entry.ts` 导出；保证 `definePages` 校验、最长前缀、base 路径、组件缓存、保活与错误态 | 路由/组件不产生两份实现；普通 `remoteComponent` 的用法与体积门禁不退化 |
| 文档 | 根 README 公开签名和三档示例；`docs/迁移指南.md` 更新旧 `federatedBoot` 手动接法为兼容说明；CLI `init` 给出现行可执行配置接法 | 新手仅看 README 能从“暴露普通 TS 函数”与“声明 setup 自动执行”两种方式中选对；旧示例不再被写成唯一推荐方案 |

### 8.1 MES-ZC 宿主具体改动

1. `cku-mes-admin/src/fulgurjs/host/bridge.ts`：把桥拆成“提供最新宿主 context”和“BPM 旧缓存兼容”两种明确动作；不要用单个 `bridged` 布尔值永久封住两者。宿主登录成功时生成新的非敏感 `sessionKey` 并提供 `user/getToken/store/hostApp/locale/events`；token 刷新时维持 `sessionKey`，但同步实际 access token；退出时清理 context、BPM access/refresh 缓存、旧用户相关项目缓存和未完成预载。先核对宿主及 BPM 真正的认证协议，不能凭 token 名称推断。
2. `cku-mes-admin/src/fulgurjs/host/pages.ts`：保留 27 菜单页对应的项目页面数据与显式 spec；把路径匹配、远程归属、boot Promise 缓存、组件工厂移到通用适配器后删除这里的重复实现。若业务骨架屏/错误 UI 属项目风格，可作为组件选项保留。项目特殊路径 `/flowable/.../model/:type/:id` 的 `type` 和 `id` 传递必须保持原语义，不能靠默认剥参猜测页面。
3. `src/router/routes/staticRouter.ts`、`src/layouts/default/content/index.vue`、`src/store/modules/permission.ts`：调查 Vue Router 实际匹配链后，只保留一个真实内容渲染点。后台菜单展示与空 component 路由剔除继续按现有业务规则工作；切换 tab、详情弹窗、动态路由刷新不应再次触发整套远程初始化。
4. `src/views/fulgurjs/FulgurjsDemo.vue`：确认直接加载 `TaskCard`/`InfoCard` 的演示也遵循“宿主先提供 context → setup → 组件”时序；免登录演示若无法满足 BPM 的会话要求，不得偷偷传伪登录资料。要么给演示定义有意义的独立无认证组件场景，要么让它明确显示“需登录”的状态；不要因为新 setup 使现有演示页静默空白。
5. `vite.config.ts`：宿主 remotes、exposes、shared、双角色 `devSharedSelf` 的实际值逐字段迁入 `fulgurjs.config.ts`，再通过转换函数供 Vite 使用。保留原有插件顺序、base、代理和构建设置，不顺手改变业务垫片。

### 8.2 MES-ZC BPM 具体改动

1. `cku-mes-bpm/src/fulgurjs/exposes/federatedBoot.ts` 的逻辑按职责迁往项目侧 `setup.ts`：全局 SCSS、Element Plus locale、form-create 注册属于一次性 `setup`；用户 ID、两个 Pinia 实例的权限、字典、认证态属于 `onSession`。组件注册只做一次，不能每次换账号重复 `app.use()`；用户数据不能只在首次加载写一次。
2. 当前 `useUserStoreWithOut()` 使用 BPM 自有 Pinia，`useUserStore(mainStore)` 使用宿主 Pinia。迁移时两者都必须得到正确当前用户与权限；完成后 active Pinia 回到宿主实例。必须有异常路径测试，特别是字典请求失败和组件注册失败。现有全权限集合 `['*', '*:*:*']` 属测试项目业务策略，不能推广为插件默认权限。
3. `dictStore.setDictMap()` 当前会异步获取并直接写 `dictMap`/sessionStorage。执行者要检查缓存是否跨账号安全、旧请求在换账号后是否还能写入；需要时将“获取”和“提交”拆开，提交前检查 `signal.aborted`，或做经过验证的会话串行与清理。只给 `onSession` 外层加一个 `if (!signal.aborted)` 不足以保护 store 方法内部的异步写入。
4. `src/utils/auth.ts`、`src/config/axios/service.ts` 和上传相关调用要核对 access/refresh token 的真实来源。宿主若只有 access token，BPM 不得继续把它放进 `REFRESH_TOKEN`；401 与上传路径要有明确可测试的处理结果。不能为了通过页面测试绕开认证或写假 refresh token。
5. 将 `vite.config.ts` 的手动 `./federatedBoot` 暴露迁到显式 `setup` 字段时保留所有页面和 `TaskCard` exposes；删除旧 expose 和类型声明中的遗留引用前静态核对全部调用方、构建资源映射及回退接线。新 setup 在 dev/prod 注入 SCSS/CSS 的实际验证放在正式包发布后，重点以 8662 生产形态判定。

### 8.3 MES-ZC lowcode 具体改动

1. 将 `cku-mes-lowcode/src/fulgurjs/exposes/federatedBoot.ts` 拆成一次性注册与会话同步：`setupI18n`、`setupGlobCom`、`setupLowDesagn`、`setupAvue`、`setupAuth`、Element Plus locale 的实际先后顺序以现有页面行为为基准；`setUserInfoAction`/权限写入属于会话动作。`setupLowDesagn` 和 `setupAvue` 是 async 函数，迁移后必须等待或证明无需等待；测试设计器按钮与预览实际结果。
2. 现有 `getIsSetUser` 阻止已设置用户时再次执行 `setUserInfoAction()`；换账号或退出重登前要显式重置相应状态或改为按 `sessionKey` 重建，不能让旧账号权限跨会话保留。其测试项目硬编码管理员权限也不是通用插件语义。
3. 核实 lowcode 自己的样式、全局指令、Avue/设计器注册在 dev 与 8662 构建中一致；删除旧 `./federatedBoot` expose 前检查宿主调用点、类型生成物与文档。不能因为普通 `InfoCard` 可加载就断言六个业务页面正常。

## 9. 执行顺序与每一步的停线条件

1. **冻结基线**：记录插件版本/包来源、三个应用的有效 Vite 选项、当前 8662 URL 和服务信息；保存可回退的上一个通过验收构建。`testbed/` 受 `.gitignore` 忽略，先确认真实应交付源码的位置与版本控制状态。不要覆盖根目录已有未跟踪 `pnpm-lock.yaml` 或用户并行编辑。
2. **实现与迁移**：先修宿主桥和 BPM refresh token、同页账号切换，再实现插件新 API；BPM、lowcode、宿主适配器与单配置逐项迁移。每次删除旧 helper/expose 前查静态与动态调用方，保留可回退接线；完成真实代码、类型和文档，不为每个阶段安排一轮完整浏览器测试。
3. **准备发布后断言**：写好无 setup、只有 setup、setup+onSession 三种 fixture 和有意义的自动化断言，覆盖并发、失败恢复、会话切换、预载、普通 TS 方法模块等。它们可参加现有自动发布门禁；不另开发布前完整 fixture/MES-ZC 验收轮次。
4. **发版并核对来源**：按仓库既有流程发布新版本；该流程自带构建、gzip/错误码门禁及单测，失败则先修复。等 npm registry 可安装后，记录 Git release/tag/commit、包版本、tarball integrity；fixture 和三应用都安装同一正式包，不使用本地链接或 tarball 作为最终测试对象。
5. **发布后开发与生产完整验证**：先运行 fixture 和包契约检查；三应用安装正式包后，在 dev 完整跑 27 页、关键交互、账号切换、故障恢复及 dev 专有能力。随后生产构建三应用并部署 8662，再完整跑 §5、§10 的生产矩阵。两边分别收集证据，不以 dev 通过代替 prod，也不以 prod 通过代替 dev。若发现插件缺陷，修复并以**新版本**重新发布，从 registry 重装，在最终版本上重做受影响检查及开发、生产的完整验收。
6. **保留 8662 并交付证据**：若新构建未通过，恢复上一个可用构建并保持 8662 可访问，报告失败证据；不得把失败产物留作用户复测站点。通过后核对进程/服务与所有端点，再向用户报告。**完成后不要停 8662、不要删其 dist、不要回收端口。**

## 10. 可判定的验收样例

| 编号 | 操作 | 必须观察到的结果 |
|---|---|---|
| T1 无 setup | 用只有 `./Widget` expose 的远程加载组件 | 直接显示组件，不要求 AppContext/sessionKey，不触发 setup；旧 API 可用 |
| T2 普通 TS expose | `exposes: { './math': './src/math.ts' }`，然后 `const mod = await loadRemote('r/math')` | `mod` 是模块导出；其导出函数在显式 `mod.fn()` 前未执行。文档示例和真实行为一致 |
| T3 初始化顺序 | 宿主提供 context，远程声明 setup，两个页面并发加载 | 只执行一次应用级 setup 和一次当前会话 onSession；二者完成后页面才显示，CSS/共享实例正确 |
| T4 缺字段 | 不提供 `hostApp` 或 `sessionKey`，加载要求这些字段的远程页面 | 明确失败，展示 remote、缺失字段、时序修法；不静默跳过、不渲染半初始化页面 |
| T5 A→B | 同页 A 登录打开 BPM → 退出 → B 登录打开 BPM/lowcode | 页面、接口、两个 BPM Pinia store 和认证缓存均属 B；lowcode 按其项目权限映射重建，不能沿用 A 的 token/状态；A 的慢请求不能写回 B 状态；应用级组件未重复注册 |
| T6 失败恢复 | 首次 setup 或 onSession 人为抛错，再修复原因并重试 | 首次有独立错误码；重试成功；不是永久命中 rejected Promise，也不额外执行已成功的应用级 setup |
| T7 预载 | 宿主桥已完成后调用 `preloadRemote`，暂不打开远程页面 | 相对调用前只增加资源请求，不额外写用户 store、注册组件或执行 setup；首次实际加载才执行 |
| T8 真实业务 | 发布后按 27 页菜单矩阵、待办审批闭环、模型新增/复制、低代码设计器、签署弹窗测试 | 在 dev 和 8662 生产形态分别验证真实内容、接口结果和操作结果；不能只数路由或 HTTP 200，也不能用一边的结果代替另一边 |
| T9 用户复测 | 所有测试完成、清理临时进程后再次打开 8662 | 站点仍可访问；主入口与两个远程入口/manifest 可用；记录可复测 URL、构建版本和时间 |

测试故障注入优先在本任务独立浏览器会话中拦截网络请求；不要通过停止 8662 服务来模拟远程故障。截图与日志归入任务独立证据目录，测试账号产生的业务数据由执行者按可追溯 ID 清理；8662 的部署产物及运行服务明确例外，保持原样供用户复测。

## 11. 现行 `federatedBoot` 链路逐步解释（4.0.0 历史链路，仅存档）

> **⚠️ 历史章节（4.2.0 起标注）**：本节描述的是 **4.0.0 时期的旧链路**，已不是当前代码。
> 4.1.0 起当前链路使用 `federation({ setup })` / `onSession` 生命周期（插件接管启动时序，
> 无需 federatedBoot 启动器 expose 与宿主手动 loadRemote 调用）；4.2.0 起接入配置为
> 每项目一份 `fulgurjs.config.ts`（`federation(fulgurjsConfig)` 一次注册）。本节保留
> 仅为解释历史演进，新项目与排查现状请以 README 主体为准。

以下描述针对旧版本（4.0.0）代码，可分清“当时到底是谁调用了谁”。

### 11.1 为什么会有启动器

乾坤模式会挂载一整个子应用，子应用的入口和 `mount` 生命周期能完成自己的组件注册、字典、用户状态等初始化。这里的联邦页面是把 BPM 的 Vue 页面模块直接放进 admin 的布局里渲染；BPM 的 `main.ts` 和整应用入口不会因此自动运行。若页面依赖 `form-create` 全局组件、Element Plus locale、权限 store 或字典，就需要在**首次显示页面前**补做这些项目初始化。`federatedBoot.ts` 是 MES-ZC 为这个迁移场景写的项目适配模块；插件本身只负责把它当作远程模块暴露和加载。

### 11.2 谁暴露、谁调用

```text
BPM vite.config.ts
  exposes['./federatedBoot'] = './src/fulgurjs/exposes/federatedBoot.ts'
                         │
                         ▼
admin pages.ts: await loadRemote('mes-bpm/federatedBoot')
                         │  返回模块命名空间，例如 { default, federatedBoot }
                         ▼
admin pages.ts: const boot = mod.default ?? mod.federatedBoot ?? mod
admin pages.ts: await boot()       ← 真正调用 TS 文件导出的函数
                         │
                         ▼
admin pages.ts: await loadRemote('mes-bpm/pages/bpm/task/todo')
                         │
                         ▼
admin 在自己的 LayoutContent 内渲染返回的 Vue 组件
```

插件 `loadRemote` 内部解析 `mes-bpm` 远程名和 `./federatedBoot` 模块名，获取 remoteEntry 容器、完成共享依赖协商，再调用容器 `get('./federatedBoot')` 返回导出对象；它**没有调用导出函数的代码**。`exposes/` 目录名也没有自动注册功能。宿主 `bootRemoteOnce()` 对同一 remote 缓存 Promise；BPM 文件自身又有 `booted` Promise。二者都是项目代码，不是插件的标准生命周期。另一个普通组件 `TaskCard.vue` 虽在同目录，演示页直接 `loadRemote('mes-bpm/TaskCard')`，并没有运行 `federatedBoot`；因此不能用演示组件成功来证明业务页面初始化正确。

### 11.3 数据从哪里来，所谓“注入”到底是哪几种

| 通道 | 写入方与位置 | 读取/使用方 | 本质与限制 |
|---|---|---|---|
| AppContext | admin 的 `bridge.ts` 调用 `provideAppContext({ user, getToken, store, hostApp, locale, events })` | BPM `federatedBoot.ts` 调用 `requireAppContext('store','user','hostApp')` 和 `getAppContext()` | `context.ts` 把顶层对象浅合并到**同一个浏览器页面**的 `globalThis.__FULGURJS_APP_CONFIG__`。这是普通 JS 对象引用，不是网络传输、序列化或 Vue `provide/inject` |
| BPM 认证缓存 | admin `bridge.ts` 用 `writeWsCache` 把 token 写到浏览器 localStorage 的 `ACCESS_TOKEN`/`REFRESH_TOKEN` | BPM `utils/auth.ts` 的 `getAccessToken()`/`getRefreshToken()`，再由 axios 请求使用 | 这是兼容 BPM 原有 `web-storage-cache` 数据格式的另一路通道，与 AppContext 分开。目前两键都写同一个宿主 access token，刷新语义有问题，见阶段 A |
| 宿主 Pinia 引用 | admin 把已创建的 `store` 实例放进 AppContext | BPM 用 `useUserStore(ctx.store)`、`useDictStore(ctx.store)` | 因同页同 JS realm，传的是 Pinia **实例引用**。BPM 自己还有一份 Pinia，所以 boot 同时写宿主 Pinia 和 BPM 自有 Pinia 的用户权限 |
| 宿主 Vue app 引用 | admin 把 `hostApp` 实例放进 AppContext | BPM 的 `setupFormCreate(hostApp)` 与 `provideGlobalConfig(..., hostApp)` | 这里才是在宿主 Vue app 上注册全局组件/配置。它不是 `provideAppContext` 自己自动完成的 |
| events 与方法 | admin 放入 `events.main`、`events.bpm` 对象及 `getToken` 函数 | BPM 页面可通过 `getAppContext()` 读取和调用 | 同页对象/函数引用可直接调用；顶层 `user` 是当时快照，`getToken()` 每次执行可拿较新的 token。换页或远程打包不会自动更新旧 `user` 快照 |

`provideAppContext` 要求 fulgurjs runtime 页面级单例已存在，它只负责保存/合并对象；`requireAppContext` 负责检查指定字段，缺字段会报 `CC-001`。由于宿主和远程页面运行在同一个浏览器页面中，即使代码来自不同的远程 chunk，它们读到的仍是同一个 `globalThis`。这就是“BPM 明明没有 import admin 的 bridge.ts，却能读到 admin 写入的数据”的原因。如果远程独立直开、没有宿主提供 context，就不满足这个场景的时序约定。

### 11.4 一次导航的准确时序

1. 用户进入 `/flowable/...`；admin 的路由表和 `LayoutContent` 识别这是联邦页面。页面异步组件 loader 中先调用 `fulgurjsBridge()`。当前代码也可能在布局 computed 中提前调用桥，但 `bridged` 使它只真正执行一次；执行者应在重构前确认唯一调用点。
2. `fulgurjsBridge()` 读取 admin 当前 `userStore.getUserInfo` 与 `getToken()`；向 BPM 兼容缓存写 token；把 `user/getToken/store/hostApp/locale/events` 放入 AppContext；再安排空闲预载。预载只是资源优化，不等于执行 BPM 启动函数。
3. loader 调用 `bootRemoteOnce('mes-bpm')`。宿主通过插件 `loadRemote('mes-bpm/federatedBoot')` 取回 TS 模块，**宿主自己**选择导出并 `await boot()`；成功后缓存此次 boot Promise，失败时从缓存删除以便重试。
4. BPM 导出的 `federatedBoot()` 读取 AppContext。它在宿主 Pinia 中初始化 BPM 用户权限与字典，又在 BPM 自有 Pinia 中写用户 ID/权限，并把 active Pinia 切回宿主；然后用 `hostApp` 给宿主注册 form-create、用 `locale` 注入 Element Plus 配置。BPM 文件内还有第二层成功缓存，失败会清除该层缓存。
5. 只有上述 Promise 完成后，宿主才加载真正的 `mes-bpm/pages/...` 页面模块并渲染。这样业务页第一次读取权限、字典或全局组件时，预期环境已经准备好。

### 11.5 这套设计目前最难懂、也最容易误用的地方

- **三个概念混在同一个文件名里**：`exposes` 是“允许别人加载”，`loadRemote` 是“取得模块”，`boot()` 是“运行初始化”。前两个由插件提供，第三个由宿主项目手写。看到 `federatedBoot.ts` 文件存在，不代表会自动运行。
- **两个不同的“注入”**：`provideAppContext` 实际写同页全局对象；`provideGlobalConfig`/`setupFormCreate` 才把配置和组件装到 Vue app。`Pinia` 又是通过对象引用共享，token 另走 localStorage。把它们叫作同一种注入会掩盖真正的数据流。
- **缓存只保证首次成功**：`bridged`、`bootedRemotes`、BPM `booted` 都会让同页后续调用跳过初始化。账号/用户对象改变后，这些缓存没有会话版本概念，容易留下旧用户与权限。
- **业务适配与插件机制边界不清**：插件作者不应该从一个 MES 的 `federatedBoot.ts` 推测插件通用用法。新 `setup` API 的目标正是让“可选自动初始化”成为显式配置；业务文件仍由项目编写，但何时运行、怎样重试、如何区分应用级与会话级，由插件公开契约说明。

## 12. 除本方案主线之外，尚未实现且值得考虑的能力

本节是**产品体验增补清单**，不是声称当前 4.0.0 已具备的能力。§1–10 的宿主页面适配器、`setup/onSession`、单配置转换和会话修正仍是本轮主线；本节按“能否让插件作者自己解释清楚用法、是否防止接入错误”排序。执行者应先完成主线，再按优先级处理本节；不得为追求清单完整度把所有建议塞进一次改动。每项都要先核对执行时的源码和公开文档，以当前事实为准。

### 12.1 P0：建立一条真实、可照做的公开接入路径

**现状证据**：根 README 开头称 `fulgurjs init` 会生成 Vite 配置、路由表、桥、联邦启动器和 NGINX 配置；但同一 README 后文又写明 init 不改写项目文件。`packages/plugin/src/cli.ts` 实际只有 `init` 和 `doctor`，`init --config` 校验配置后输出可粘贴块与核对清单。README 还有 `init` 生成 `bridge.ts` 的说法，与 CLI 代码不符。使用者即使照 README 操作，也不知道哪些文件应该出现、哪些代码仍需自己写。这是直接造成“插件怎么用”不清楚的缺陷，文档修正不能等发布新 API 时再顺手做。

**建议交付**：

1. 把 README 首页改为三条可实际运行的路径：①只暴露并加载普通 Vue/TS 模块；②宿主接入多页面；③远程业务页需要 `setup/onSession` 与 AppContext。每条先给最小文件树，再给远程 `vite.config.ts`、宿主 `vite.config.ts`、调用代码和启动/验证命令。明确第①条完全不需要 `federatedBoot.ts`、MES 桥、Pinia 或会话协议；第③条才需要业务初始化。
2. 在“TS expose”示例中并排展示 `exposes: { './api': './src/api.ts' }`、`await loadRemote('remote/api')`、`mod.someFunction()`，用一句明确说明：**expose 允许加载，loadRemote 返回导出，调用导出仍由业务代码决定**。把自动运行的 `setup` 与普通 TS expose 对比，写清配置声明、首次页面加载、预载、失败重试和会话切换的触发时机。
3. 对照 `cli.ts`、`init.ts` 和真实产物逐段修正 README、`docs/迁移指南.md`、CLI `--help`；列出 `init` 实际生成的文件、仅打印的片段，以及执行者仍需完成的项目接线。若主线实现 `federationOptionsForApp`，示例须改为真正读取配置的代码，不再把“打印后粘贴”描述成单配置驱动。
4. 将一份最小 Vue fixture 作为可构建、可启动的公开示例，CI 至少验证示例从发布包的 exports 导入能通过类型检查和构建。README 的每条主要用法都应在可执行示例里有对应代码；不要再出现只存在于文档中的 API。

**验收**：新使用者从空项目按第一条路径可加载一个远程组件；再按第三条路径可说明 `setup` 何时执行、`user`/`getToken` 从哪里来。文档命令和生成文件与实测 CLI 一致，搜索不到“init 自动生成桥/路由/启动器”等过期承诺。

### 12.2 P1：增加本地配置解释命令，让“为什么这样配置”能被查询

**现状证据**：现有 `doctor` 侧重已部署站点的入口、缓存头、CORS 和资源可达；`init --config` 只给配置校验与粘贴样板。它们都不是针对当前应用的“有效配置与加载链解释器”。运行时虽有 `window.__FULGURJS_INFO__` 调试数据，但使用者仍需懂内部注册表才能解释页面由哪个 remote 提供、`setup` 是否存在、何时运行。

**建议交付**：提供一个项目无关的 `fulgurjs explain --config <path> --app <name>`（名称可在实施时统一，但文档与 CLI 必须一致），只读解析配置并输出应用角色（宿主/远程/双角色）、有效 remotes 名称与 URL、公开 exposes、内部 setup、shared 关键设置、页面 spec 映射、`devSharedSelf` 的最终值及其来源。输出一条简短加载链：宿主提供 context → 加载 remoteEntry/共享依赖 → 首次真实 `loadRemote` 执行可选 setup/onSession → 取得页面模块 → 宿主渲染。若无 setup 或 context，说明该步骤不存在。`--json` 供 CI 使用，普通输出供人阅读。此命令不要请求生产接口、读取 token 或输出环境变量秘密；与 `doctor` 的网络部署检查职责分开。

**验收**：对 MES-ZC 三应用逐个运行，输出能解释 BPM 页面为何需要初始化、普通 TaskCard 为什么不应被误认为已完成业务初始化，并准确显示双角色宿主的 shared 设置。改一次配置后输出随之变化；未知 app、拼错 spec、缺 expose 给出具体字段和修法。

### 12.3 P1：把开发期才能发现的页面配置错误延伸到构建与 CI

**现状证据**：`remoteSchema` 当前要求从 `/runtime` **具名静态导入**才能在 dev 被插件探针改写；命名空间导入、动态导入或 re-export 不触发该路径。未经转换及 build 时它是空表。`definePages` 的 R3 暴露项校验在 schema 缺失时跳过；因此开发期看到通过并不代表构建后仍核对了页面 spec。这个“导入写法决定校验是否存在”的隐含规则对接入者很难理解。

**建议交付**：保留既有 `remoteSchema` 兼容性，但增加一个显式的页面契约校验入口，例如 CLI `check-pages` 或构建期独立检查。它读取宿主页面表和远程 manifest（本地构建产物优先，必要时可指定测试站点 URL），报告未知 remote、缺失 expose、路径冲突及跳过原因；输出人类可读与 JSON 两种格式，并用非零退出码表示确定错误。若远程不可达，应区分“无法验证”和“确认缺失”，不能把空 schema 当作通过，也不能要求生产 build 必须连开发服务器。主线的 `createHostPages` 可以继续用 dev 探针提供即时提示，但正式验收用显式检查或真实部署验证。

**验收**：把 27 页中的一个 spec 故意改错，CI 检查稳定指出对应页面、remote、expose；把 manifest 移走则报“无法验证”并给出路径/URL；恢复后通过。文档明确 dev 探针、构建检查和运行时加载各自能保证什么。

### 12.4 P1：双角色 shared 配置自动推断或强提示

**现状证据**：`options.ts` 的 `devSharedSelf` 默认值是 `remotes.length === 0`。一个既配置 `exposes` 又配置 `remotes` 的应用会默认得到 `false`；README 却要求双向联邦显式设为 `true`，并描述 Vue 实例不一致的实际故障症状。这种必须背诵的例外很容易在新宿主中复现。

**建议交付**：在独立 fixture 比较 dev/prod 与 shared 协商后，优先让双角色自动推断为正确值；若不能安全自动推断，至少在配置校验时给出应用名、当前有效值和推荐修法的高可见诊断，且 `explain` 同步展示来源。保留用户显式覆盖能力；不能仅修改 README 默认值，也不能因推断改变纯宿主/纯远程行为。

**验收**：纯宿主、纯远程和双角色各一个 fixture 在 dev/prod 渲染一致；双角色遗漏该选项时不再悄悄进入已知错误配置；现有 MES-ZC 显式配置不退化。

### 12.5 P2：分清框架无关运行时与 Vue 适配入口

**现状证据**：构建给浏览器容器使用的 `runtime.js` 不静态引入 Vue；但公开应用入口 `src/runtime-entry.ts` 直接导出 `remoteComponent`，而 `src/vue.ts` 依赖 Vue 适配层。包的 peerDependencies 也要求 Vue。对于只想加载 TS/JS 模块的使用者，“runtime”这个入口名与实际 Vue 依赖不够直观。

**建议交付**：先确认本产品是否承诺非 Vue 宿主。如果承诺，就设计清楚的框架无关子入口和 Vue 子入口，声明哪些 API 放在哪个入口，并保持现有 `/runtime` 的兼容迁移期；检查发布包的 exports、d.ts、Vite 与 Node 消费方式、tree shaking 和体积。若产品只面向 Vue，则无需拆入口，但 README 首页及包元数据要直说 Vue 是必需 peer，不暗示 JS/React 宿主可直接使用。不要为“支持其他框架”而把 React 适配器、SSR 和 Vue 拆分一起实施。

**验收**：按最终声明，用不安装 Vue 的最小 JS fixture 验证承诺的框架无关入口；Vue fixture 验证组件适配器；旧入口在约定兼容期内可用。若最终决定只支持 Vue，则删除文档里相反的表述，并给用户清晰的范围说明。

### 12.6 P2：对尚未支持的互操作选项停止“静默有效”的错觉

**现状证据**：`options.ts` 对非 `module` 的 `remoteType`、非 `module/esm` 的 `library.type` 只加 warning，随后规范化为 `module`；`automaticAsyncBoundary: false` 也仅提示无效。配置能写、启动可能继续，使作者误以为已切到 Webpack script/var 等模式。README 已把这类值列为未支持，但运行时结果与配置字面值不一致。

**建议交付**：把明确无法履行的选项改为配置错误，或在兼容期至少给出无法忽略的具体诊断和迁移期；错误说明支持值、实际行为和替代方案。同步 TypeScript 字面量类型，让编辑器尽早提示。不要把“新增 script/var 互操作”作为此次修正的前提；那是独立的大功能，需要自己的兼容矩阵。

**验收**：写 `remoteType: 'script'` 时不能得到一个看似成功、实际是 module 的构建；现有 module/esm 路径继续通过。文档、类型与运行时接受值一致。

### 12.7 明确暂不优先的大功能

现有缺口表还列出浏览器 DevTools 扩展、SSR、React/其他框架适配及 Webpack script/var 互操作。它们可能有价值，但目前没有证据表明是 MES-ZC 接入难懂的主因。先把真实用法、可执行示例、配置解释、页面契约检查和会话/初始化时序做对；后续只有在明确目标用户和跨框架需求后，才给这些能力单独立项。若实施了本节任何能力，更新 `docs/webpack-mf-对照与缺口.md` 的状态，避免“尚未实现”表与实际代码再次分叉。
