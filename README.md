# @fulgurjs/federation

> **fulgurjs** — 拉丁语「闪电 · 辉光」。
> 一个把 Vite 模块联邦做到开箱即用的插件：**一套配置，dev / prod 双引擎，语义对齐 Webpack Module Federation**。

![tests](https://img.shields.io/badge/tests-369%20%2B%20e2e-green) ![runtime](https://img.shields.io/badge/runtime%20gzip-%3C%208KB-blue) ![vite](https://img.shields.io/badge/vite-5%20%7C%206%20%7C%207%20%7C%208-purple)

---

## 为什么是它

| | webpack MF | 其他 vite MF 方案 | **@fulgurjs/federation** |
|---|---|---|---|
| dev 体验 | 需要独立构建 | 通常要手工 bootstrap | ✅ 双 dev-server 直连，零手工异步边界 |
| prod 产物 | ✅ | 常缺失或降级 | ✅ 构建期改写，稳定 remoteEntry 文件名 + manifest |
| 语义完整度 | 100% | 残缺（版本协商/单例/容错经常缺失） | ✅ 逐条对齐 webpack 语义并有 e2e 验收 |
| **UMD / CJS-only 依赖** | 需自行处理 | **普遍不可用** | ✅ 自动支持（预构建外部化 + 构建期 require 垫片） |
| 远程加载失败 | 裸错误，需手写重试 | 普遍缺失 | ✅ 重试/熔断/超时内置 + `fallbackModule` 显式降级 |
| 运行时体积 | ~40KB+ | 不等 | **gzip < 5KB** |
| 配置出错时 | 难排查 | 报错晦涩 | 三段式报错：`got / expected / example` |

**真实工程验证**：某企业级 mes 系统（admin 宿主 + bpm/lowcode 两个子应用，21+6 页）已全量迁移，三个应用各自维护项目根目录的 `fulgurjs.config.ts`、Vite 一处 `federation(fulgurjsConfig)` 接入。历史版本验收曾出现"23/23 页面有字即全过"的口径偏差（4.2.1 复核订正：参数页需用有效业务数据进入、错误页不得算通过）；最新一轮以 26 条页面记录 + 27 个菜单入口的逐项业务断言为准，结论见对应版本验收报告与 `docs/` 下证据文件（见[迁移指南](#文档)）。

## 特性

- **exposes / remotes / shared 全语义**：`name@url` 语法、键重命名、promise-based remote、semver 全语法 requiredVersion、版本协商（最高版本胜出）、singleton / strictVersion、已加载版本永不替换、多版本共存、shareKey 重定向、多 shareScope
- **UMD / CJS-only 依赖开箱即用**：element-plus、avue 等只有 UMD/CJS 产物的依赖直接进 `optimizeDeps.include` 即可——dev 期插件自动把预构建产物内的 shared 键改道协商门面；build 期自动把 CJS `require(<shared>)` 重定向到垫片，双运行时免疫
- **自动异步边界**：top-level await 自动注入（es2022+），无需 webpack 式手工 `import('./bootstrap')`
- **稳定产物**：remoteEntry 固定文件名便于稳定引用（入口内容每次构建变，**必须 no-cache**——只有带内容哈希的 chunk 才可长缓存）；`fulgurjs-manifest.json` 资源清单；expose 独立 chunk
- **容错（对齐 webpack MF 2.0 errorLoadRemote）**：加载重试 / 熔断 / 超时内置；`loadRemote(spec, { retries, fallbackModule })` 单次调用级覆盖——失败时返回 fallback 模块，错误事件仍显式发出（**绝不静默兜底**，不传则照旧抛错）
- **增强能力**：dts 类型直连（dev 补全直达 remote 源码）、`preloadRemote()` manifest 驱动精确预载、runtimePlugins 钩子
- **HMR 全链路**：remote 改动 → host 页面热更，L1 组件热替换 / L2 状态保留 / L3 错误覆盖与恢复
- **零报错纪律**：配置问题启动瞬间三段式报错；联邦失败显式抛错（错误码 + 可执行修复建议），**无任何静默兜底路径**
- **CLI（主包内置 bin）**：`fulgurjs init`——**单项目** `fulgurjs.config.ts` 起步模板与校验（默认导出直接是 `federation()` 选项；输出 `federation(fulgurjsConfig)` 接入块与核对清单，**不改写任何项目文件**）；`fulgurjs explain`——本应用有效联邦形态与加载链解释器（纯本地，按实际选项判角色，免 `--app`）；`fulgurjs check-pages`——宿主页面表 ↔ 远程 manifest exposes 契约核对（`--manifest`/`--site` 指定来源并如实报告；CI 可嵌，确定性错误与 `--require-verified` 均非零退出）；`fulgurjs doctor`——部署面体检（remoteEntry/manifest/HTML 缓存头与形态、CORS、chunk 抽样可达、版本 skew 预演、`--dev` 端口探测）
- **远程初始化生命周期（可选）**：`federation({ setup })` 显式声明初始化入口——默认导出 `setup(context)` 应用级执行一次、可选具名导出 `onSession(context)` 按宿主 `sessionKey` 去重执行（换账号/重登自动重跑，退出 `clearAppContext` 清理会话状态）；失败显式报错可重试（`MFU-011~014`），`preloadRemote`/`getContainer` 无副作用。不配置 `setup` 时零行为零体积
- **宿主页面适配器（可选）**：`createHostPages({ pages, remotePrefixes, ... })`——一份页面表供宿主路由与布局共用；URL 解析（含 base 剥离）、最长前缀远程归属、`definePages` R1–R5 校验、异步组件缓存（会话切换自动重建）、骨架屏/错误占位、保活名称内置
- **跨应用传值与方法引用**：`@fulgurjs/federation/runtime` 导出 `provideAppContext` / `getAppContext` / `requireAppContext` / `clearAppContext`（缺键 `CC-001` 三段式、独立直开远程页 `CC-002` 显式）。宿主桥写入页面级单例（user/getToken/store/hostApp/locale/sessionKey/events 标准字段 + 项目扩展位），远程 setup/onSession 显式校验消费；方法引用两条通道 = context 携带函数引用（热路径直调）+ exposes 方法模块 `loadRemote('remote/api')`（低频重逻辑）。数据语义 = 传输层快照 + 函数引用，非响应式（与乾坤 props 同语义；"实时"靠函数引用拉取 / 宿主 pinia 共享承担，同页换账号由 onSession 会话同步承担，不依赖页面刷新）
- **Vue 直渲染**：`remoteComponent('remote/X')`（`@fulgurjs/federation/runtime` 导出）——`defineAsyncComponent + loadRemote` 的标准封装，加载失败显式错误占位（错误码+根因+修法），runtime.js 零框架依赖零体积增量
- **CSP 友好**：原生 ESM 加载路径全程无 `eval` / `new Function`，可在严格 CSP（无 `unsafe-eval`）下运行
- **全链路错误码体系（41 码）**：CFG/DEV/BLD/MFU/CC 五段 + 手册 §6 码表防漂移校验

## 安装

```bash
pnpm add -D @fulgurjs/federation
```

要求：Vite ≥ 5.1（实测至 8.x）、Node ≥ 18、Vue 3、浏览器 Chrome 108+（TLA 原生支持）。

## 快速开始：三条接入路径

**推荐接入形态（4.2.0 起）——每项目一份 `fulgurjs.config.ts`，Vite 只注册一次插件**：

```ts
// my-app/fulgurjs.config.ts —— 默认导出直接可传给 federation()（satisfies 做编译期形状检查）
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'my-app',
  exposes: { './pages/home': './src/views/Home.vue' },
  remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions

// my-app/vite.config.ts —— 联邦相关的全部代码就这两行（其余 Vite 配置原样保留）
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'
// plugins: [ ...原有插件, federation(fulgurjsConfig) ]
```

`npx fulgurjs init` 生成该模板；`npx fulgurjs explain` / `check-pages` 直接读它（宿主应用另以
**具名导出 `hostPages`** 提供 CLI 核对用的页面数据，与运行时页面表同一份数据模块）。宿主与远程
即使分属互不相邻的仓库也各自独立：只声明对方 URL 与容器名，不依赖共同父目录或对方源码。
下面三条路径按需选路，**不必全做**，互相独立、可组合（普通小应用也可以不建配置文件、
直接在 vite.config.ts 里写 `federation({ name, ... })`）：

- **路径 ①：暴露并加载普通模块**——任何 Vue 组件或 TS/JS 函数模块，跨应用共享。不需要桥、不需要页面表、不需要任何初始化协议。
- **路径 ②：宿主多页面接入**——宿主有一批路由要映射到远程页面。用 `createHostPages` 一份页面表解决 URL 解析/组件缓存/骨架屏/错误占位/保活名称。
- **路径 ③：远程业务页需要宿主环境**——远程页面依赖全局组件注册、用户/权限/字典等启动期初始化。用 `setup`/`onSession` 声明式初始化 + `AppContext` 传值。

### 路径 ①：暴露并加载普通模块（无 setup、无桥、无页面表）

**谁配置**：远程应用 vite.config.ts 写 `exposes`；宿主 vite.config.ts 写 `remotes`。**谁调用**：消费方业务代码。**何时执行**：`loadRemote` 只取得模块导出，**调用导出函数仍由业务代码决定**——expose ≠ 自动执行。

```ts
// ── remote-a/vite.config.ts ──
federation({
  name: 'remote-a',
  exposes: {
    './Button': './src/components/Button.vue', // Vue 组件
    './math': './src/math.ts',                 // 普通 TS 模块
  },
  shared: { vue: { singleton: true } },
})

// ── remote-a/src/math.ts：普通 TS 文件，无任何联邦 API ──
export function add(a: number, b: number) { return a + b }

// ── host（消费方）代码 ──
import { loadRemote, remoteComponent } from '@fulgurjs/federation/runtime'

// 组件：remoteComponent 直渲染（defineAsyncComponent 标准封装，失败显式错误占位）
const RemoteButton = remoteComponent('remote-a/Button')

// 普通 TS 模块：loadRemote 返回【模块命名空间】——这一步只是加载，add 尚未执行
const mod = await loadRemote('remote-a/math')
mod.add(1, 2) // ← 显式调用才执行
```

最小文件树（只有路径 ① 时）：

```text
remote-a/
  vite.config.ts        # federation({ name, exposes })
  src/components/Button.vue
  src/math.ts
host/
  vite.config.ts        # federation({ name, remotes: { 'remote-a': ... } })
  src/App.vue           # remoteComponent(...) / loadRemote(...)
```

验证：启动双方 dev server，宿主渲染出远程组件即通。失败时看错误占位的三段式文案（错误码 + 根因 + 修法），常见为 `MFU-001`（远程未启动/地址错）与 `MFU-006`（exposes 键名不一致）。

### 路径 ②：宿主多页面接入（`createHostPages`）

宿主有一批路由要落到远程页面时，用页面适配器替代手写路由/加载样板：**一份页面表**供宿主路由与布局共用，URL 解析、最长前缀远程归属、异步组件缓存、骨架屏、错误占位、保活名称全部内置。

```ts
// host/src/fulgurjs/host/pages.ts
import { createHostPages, definePages, remoteSchema } from '@fulgurjs/federation/runtime'

export const hostPages = createHostPages({
  pages: [
    { route: '/remote-a/home', name: 'RemoteAHome', title: '首页' },
    // 带参路由须显式 spec（剥参推导会与列表页 expose 键收敛相同，R1 校验拦截）
    { route: '/remote-a/detail/:id', name: 'RemoteADetail', spec: 'pages/remote-a/detail', title: '详情' },
  ],
  remotePrefixes: { '/remote-a/': 'remote-a' },  // 最长前缀匹配
  schema: remoteSchema,                           // dev 探针校验 exposes 存在性
  // base: '/main',                               // 站点有 base 前缀时声明，resolve 自动剥离
})

hostPages.pages          // 原页面记录（供 vue-router 注册）
hostPages.resolve(path)  // { page, remote, spec, params } | null
hostPages.component(spec) // 异步页面组件（同 spec 复用）
hostPages.keepAliveNames // keepAlive 页面的组件 name（KeepAlive include 用）
```

```ts
// host 路由注册（同一份 hostPages 对象）
children: hostPages.pages.map((p) => ({
  path: p.route, name: p.name,
  props: (r) => ({ ...r.params, ...r.query }),
  component: hostPages.component(hostPages.resolve(p.route)!.spec),
}))
// 布局内容区：<component :is="hostPages.component(resolved.spec)" :key="fullPath" v-bind="props" />
```

### 路径 ③：远程业务页需要宿主环境（`setup` + `AppContext` + 会话切换）

远程页面依赖「全局组件注册、用户/权限/字典」等启动期初始化时，在远程的 `federation()` 配置里**显式声明**一个初始化入口文件——插件保证它的执行时序，宿主不再手写「loadRemote 启动器并调用」：

```ts
// ── remote-a/vite.config.ts：setup 单独声明；普通 exposes 语义不变 ──
federation({
  name: 'remote-a',
  exposes: { './pages/remote-a/home': './src/views/Home.vue' },
  setup: './src/fulgurjs/setup.ts',   // ← 可选项；缺省时无任何初始化行为
})

// ── remote-a/src/fulgurjs/setup.ts ──
import type { RemoteSetupContext } from '@fulgurjs/federation/runtime'

// 默认导出：应用级初始化，同一容器只执行一次（全局组件/样式/locale 注册）
export default async function setup(context: RemoteSetupContext) {
  const { hostApp } = context.appContext
  // hostApp 全局组件注册、全局样式 import 等
}

// 可选具名导出：会话级初始化，按宿主 sessionKey 去重（换账号/重登自动重跑）
export async function onSession(context: RemoteSetupContext) {
  // 同步当前用户、权限、字典；await 之后写状态前检查 context.signal.aborted
}
```

```ts
// ── host：先提供 context（含 sessionKey），之后正常 loadRemote —— 初始化自动发生 ──
import { provideAppContext, loadRemote, clearAppContext } from '@fulgurjs/federation/runtime'

// 登录成功后（每次成功登录/重登生成新的非敏感 sessionKey，不是 token）：
provideAppContext({ user, getToken, store, hostApp, locale, sessionKey: 's-101-1730...', events })

const Page = await loadRemote('remote-a/pages/remote-a/home')
// ↑ 内部时序：取得容器 → init（共享协商）→ 执行 remote-a 的 setup（一次）→
//   执行 onSession（本 sessionKey 首次）→ 返回页面模块。任一步失败显式报错（MFU-011~014）。

// 退出登录时：
clearAppContext() // 清 context + 作废会话信号/onSession 去重（下次登录必须重跑 onSession）
```

**执行时机总表（路径 ③）**：

| 动作 | setup（默认导出） | onSession（具名导出） |
|---|---|---|
| 谁声明 | 远程 `federation({ setup })` | 同一 setup 文件的具名导出（可选） |
| 谁触发 | 宿主首次 `loadRemote('remote-a/任何模块')` | 同左，且宿主须已提供 `sessionKey` |
| 执行次数 | 每容器一次（并发共享同一 Promise） | 每个 sessionKey 一次；换账号/重登重跑；退出清理后重跑 |
| 失败行为 | 该次 loadRemote 拒绝（MFU-012），仅清失败缓存可重试 | 同左（缺 sessionKey 报 MFU-013） |
| 预载 | `preloadRemote` 只下载资源，**不执行** | 同左 |
| `getContainer` / `loadRemote('remote-a')` | 不执行（只取容器） | 不执行 |

**数据从哪里来**：`context.appContext` 就是宿主 `provideAppContext` 写入的同一页面级对象（同浏览器页面直接共享，无网络传输）；`user` 是提供时快照、`getToken()` 每次调用取最新值、`store` 是宿主 pinia 实例引用。dev/prod 行为一致。

> 只有配置在 `setup` 的文件才是生命周期入口。插件**不扫描目录、不按文件名猜测、不执行其他 TS exposes**——普通 TS 模块仍按路径 ① 的语义「加载不等于调用」。旧的「expose 启动器 + 宿主手动 loadRemote 并调用」写法继续可用（便于分批迁移），但不再是推荐接法（见[迁移指南](#文档)）。

### 通用边界（三条路径都适用）

**唯一 API 入口**：应用代码的一切联邦导入——运行时函数、context 函数（含 `clearAppContext`）、`definePages`、`remoteSchema`、`remoteComponent`、`createHostPages`——**只来自物理子路径**：

```ts
import { loadRemote, provideAppContext, getAppContext, requireAppContext, clearAppContext, definePages, createHostPages, remoteSchema, remoteComponent } from '@fulgurjs/federation/runtime'
```

`/runtime` 是 ESM 应用入口，导出 `remoteComponent`/`createHostPages`，所以**使用该入口的应用需要安装 Vue**（Vue 为可选 peer：只用包根或 `/config` 时无需安装；`runtime.js` 内核本身零 Vue 依赖零体积增量）。`remoteSchema` 必须以具名静态导入取得 dev 探针结果；命名空间导入、动态导入和 re-export 不触发探针拆写，未经过插件转换时该值是空表。dev 下 remote 跑它自己的 `vite dev`（容器入口 `/@fulgurjs-entry.js` 由插件中间件直出）；build 下 expose 自动拆独立 chunk、shared 自动剥离——同一份配置两端通用。

**导入改写边界**：宿主/远程的任何普通源码文件都可以直接静态导入 `/runtime`——包括 exposes 目标文件（远程页面），其导入会被插件自动改写为惰性单例委托（求值期零副作用）。**构建入口文件是边界**：Vite 的 HTML module entry 在 build 时由插件优先内联 init 并直接返回，入口文件自身的 remote import 不会进入改写管线；把 remote 动态导入放在入口导入的普通模块中，不要写在 `main.ts` / `main.js` 里。

**CSS 预载**：`loadRemote('remote-a/Page')` 在 remote 提供 manifest 时，先按 expose 预载对应 CSS 再解析返回模块；CSS 请求失败报 `MFU-007` 但不阻断 JS 模块加载。expose 依赖的全局 CSS 需从该 expose 的依赖图中导入（路径 ③ 的 setup 文件导入全局样式是该场景的标准位置），确保资源进入 manifest。

> 以上是最常用面。**全部选项、运行时 API、CLI、错误码见下方 [API 参考](#api-参考)。**

## CLI：init 起步模板 / explain 配置解释 / check-pages 页面契约 / doctor 部署体检

```bash
# 1) 生成单项目 fulgurjs.config.ts 起步模板（默认导出直接是 federation() 选项；已存在则拒绝，--force 覆盖）
npx fulgurjs init
# 样例：examples/remote-a/fulgurjs.config.ts 与 examples/host/fulgurjs.config.ts（可整份复制的单项目配置）

# 2) 校验配置并输出接入块：federation(fulgurjsConfig) 两行接法 + 通用核对清单（纯打印，不写文件）
npx fulgurjs init --config fulgurjs.config.ts

# 3) 配置解释器（纯本地无网络）：角色（按实际选项判定，双向联邦显示「双角色」）/remotes/exposes/
#    setup/shared/页面映射/devSharedSelf 来源/加载链；单项目形态免 --app
npx fulgurjs explain          # --json 供 CI；聚合配置需 --config <聚合文件> --app <应用名>

# 4) 页面契约核对：宿主页面表 ↔ 远程 manifest exposes（宿主项目内运行；manifest 来源
#    优先级 --manifest > --site/prod 推导，输出实际命中来源；确定性错误非零退出，
#    远程不可达报「无法验证」而非通过，--require-verified 时无法验证也非零）
npx fulgurjs check-pages --site http://your-site
npx fulgurjs check-pages --manifest remote-a=/abs/fulgurjs-manifest.json --require-verified

# 5) 部署体检（CI 可嵌）：缓存头/资源形态/CORS/chunk 可达/版本 skew
npx fulgurjs doctor --base http://your-site --apps app-a,app-b
npx fulgurjs doctor --base http://localhost:5173 --apps app-a --dev
```

**插件保持项目无关**：init 不改写任何项目文件、不生成项目源码（不生成桥/路由/启动器/NGINX 文件——
NGINX 内容仅作为**打印样板**随旧聚合配置输出）；权限路由、项目侧桥与页面表等集成细节由各项目
按 init 输出的通用核对清单自行落地。

### 每项目一份配置：`fulgurjs.config.ts` + `federation(fulgurjsConfig)`（默认主路径）

`fulgurjs.config.ts` 的默认导出**直接就是 `federation()` 的选项对象**（`satisfies FederationOptions`
编译期形状检查，无运行时包装函数），Vite 只导入本项目常量并注册一次插件：

```ts
// my-app/fulgurjs.config.ts —— 本项目自己的配置；键直接属于 federation 选项
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'my-app',
  exposes: { './pages/home': './src/views/Home.vue' },
  // 反向消费宿主时才写 remotes；配置的是地址，不依赖对方源码目录
  remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
  setup: './src/fulgurjs/setup.ts',   // 可选（§10）
  shared: { vue: { singleton: true, requiredVersion: '^3.4.0' } },
} satisfies FederationOptions

// my-app/vite.config.ts —— 联邦相关行（原有 Vite 配置原样保留）
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'
// plugins: [ ...原有插件, federation(fulgurjsConfig) ]
```

规则与边界：

- 各项目 `vite.config.ts` 中**不得也不需要**出现 `loadRepoConfig` / `federationOptionsForApp` /
  `fileURLToPath(new URL(...))` / 父目录配置路径 / 按字符串查应用名——CLI 内部有自己的加载器，
  项目侧永远只见「导入一个常量、调用一次插件」；
- 宿主应用的页面核对数据以**具名导出 `hostPages`**（`{ pages, remotePrefixes, deriveSpec? }`）提供，
  与运行时 `createHostPages` 消费同一份数据模块（页面表唯一手工维护位置）；Vite 只消费默认导出，
  `pages` 等非插件字段不会误传给 `federation()`；
- base / dev 端口 / 代理 / 插件顺序等继续归各项目 `vite.config.ts`，不复制进第二套配置；
- 同一 monorepo 中的应用也各自持有配置；宿主与远程分属不同仓库时各自独立构建、部署、诊断。

> **历史兼容（不推荐）**：4.1.0 的聚合配置（`root + apps[]`，`defineRepoConfig` /
> `loadRepoConfig` / `federationOptionsForApp` 三层转换）保留一段兼容期——CLI 自动识别旧形状
> 并保持 4.1.0 行为（`explain`/`check-pages` 需 `--app`），已使用聚合配置的项目升级不会立即报错，
> 但文档主路径、`init` 模板与本节示例一律是单项目形态。迁移 = 拆出各应用的 `name/remotes/
> exposes/setup/shared` 到各自项目根，删除父目录聚合文件。

## API 参考

以下覆盖插件的全部公开 API，签名与默认值与源码一致——**本 README 为唯一权威文档**。

### 1. `federation(options)` — Vite 插件（宿主/远程同一份 API）

```ts
import { federation, type FederationOptions } from '@fulgurjs/federation'
```

插件选项类型为 `FederationOptions`（下表即其字段全集）。

#### 全部选项

| 选项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `name` | `string` **必填** | — | 容器名。同页面宿主/远程必须唯一（也是 uniqueName）；须匹配 `/^[a-zA-Z][\w.-]*$/` |
| `filename` | `string` | `'fulgurjs-remoteEntry.js'` | prod 容器入口文件名（固定文件名便于引用与部署规则落位；入口内容每次构建变，**必须 no-cache**，长缓存只给带内容哈希的 chunk） |
| `exposes` | `Record<string, string \| { import: string; name?: string }>` | — | 对外暴露模块：键 `'./X'`，值源文件路径；`name` 为稳定 chunk 文件名。键不得占用内部保留键 `./__fulgurjs_setup__`（CFG-012） |
| `setup` | `string` | —（无初始化行为） | **可选远程初始化入口**：相对应用根的 TS/JS 模块路径。默认导出 `setup(context)` 应用级执行一次（容器首次被加载业务模块前）；可选具名导出 `onSession(context)` 按宿主 `sessionKey` 去重执行。其余导出不作为生命周期入口。执行时序/去重/失败重试/错误码见 §10 |
| `remotes` | `Record<string, string \| RemoteEntryConfig \| (() => Promise<any>)>` | — | 消费的远程，三种形态见下表 |
| `shared` | `string[] \| Record<string, string \| SharedHint>` | — | 共享依赖；字符串简写 = requiredVersion（缺省从本应用 package.json 推断） |
| `shareScope` | `string` | `'default'` | 默认共享作用域名 |
| `remoteType` | `'module'` | `'module'` | 仅支持 `'module'`（类型即字面量）；传其它值配置期报 CFG-011（webpack script/var 互操作未实现，不产出看似成功实为 module 的构建） |
| `library` | `{ type?: 'module' \| 'esm' }` | — | 仅接受 esm/module；其它值配置期报 CFG-011（webpack UMD/var 输出互操作未实现） |
| `runtime` | `string \| false` | 内置运行时 | 自定义运行时模块路径；`false` 禁用内置运行时 |
| `runtimeChunk` | `boolean \| 'single'` | — | 运行时是否拆独立 chunk |
| `manifest` | `boolean` | `true` | prod 构建生成 `fulgurjs-manifest.json`（preloadRemote 依赖它） |
| `runtimePlugins` | `string[]` | `[]` | 运行时插件模块路径列表（写法见「运行时插件」） |
| `dts` | `boolean \| { dir?: string; mode?: 'source' \| 'shim' }` | `true` | dev 下拉取远程 manifest 生成类型声明——宿主写 `import X from 'remote-a/X'` 获得类型。**产物写入 `src/fulgurjs/types/`（联邦产物集中一个文件夹；无 src 布局回退 `.fulgurjs/types`）**，src 布局项目 tsconfig 零配置即生效；`{ dir }` 自定义位置；`mode: 'source'`（默认）跨工程源码直连（补全/跳转直达远程源码，VSCode 打开生成物可能显示工程外文件诊断）；`mode: 'shim'` 宽松占位（不引用源文件，IDE 全程干净，无源码级补全——见 §9.1.5）。**注意**：两种 mode 都要读取 remote 本机源码来枚举导出名（shim 亦然），manifest 的 `fsRoot`/`src` 经过路径边界校验（相对路径、无 `..`、realpath 不得越出 fsRoot），但 `dts` 不是不可信 manifest 的安全边界——只对可信来源开启 |
| `devSharedSelf` | `boolean` | 提供 `exposes`（或 `setup`）的应用 `true`；纯宿主（只消费）`false`；显式配置永远优先 | dev 下自身源码（含依赖）是否参与 shared 协商改写。双向联邦（既 expose 又消费 remote）默认即 `true`——无需再背诵显式配置（4.1.0 起按角色推断，§12.4；此前默认 false 曾是已知错误配置的来源）。build 下该路径的协商门面自动隔离进插件专属 chunk（`fulgurjs-runtime` + `fulgurjs-shared-<key>`），与用户 `manualChunks` 强制分组正交、不产生 chunk 循环依赖（D6 修复） |
| `devCorsOrigins` | `string[] \| '*'` | `'*'`（现状兼容） | dev 跨源访问策略：插件端点（`/@fulgurjs-entry.js`、`/@fulgurjs-manifest.json`）与 `server.cors` 使用同一来源。缺省或 `'*'` 全放开（非 loopback host 时提醒 DEV-011）；数组按 Origin 反射 allowlist（未命中省略头）。用户显式配置的 `server.cors` 永远优先。开/关/自定义三态示例见下方 |
| `devFsRoot` | `boolean` | `true`（现状兼容） | dev manifest 是否携带 `fsRoot`（remote 根目录本机绝对路径，宿主 dts 类型直连用）。`false` 不写入（本机路径不外发），宿主 dts 降级 any 桩并提示；该字段永不进入 prod manifest。非 loopback host 下默认值会提醒 DEV-012 |
| `automaticAsyncBoundary` | — | 恒为 `true` | 传 `false` 配置期报 CFG-011（TLA 自动异步边界无手工 bootstrap 模式可关闭）；缺省或 `true` 接受 |
| `dataPrefetch` | — | 恒为 `true` | 接受任意值：`preloadRemote` 始终可用 |
| `usedExports` / `ignoreUnusedSharedExports` | — | no-op | 接受并忽略（Rollup/Rolldown 原生 tree-shaking 已覆盖） |

#### remotes 的三种形态

```ts
remotes: {
  // ① 字符串单地址：dev 自动拼 /@fulgurjs-entry.js，prod 自动拼 filename
  'remote-a': 'http://localhost:5101',
  // ② '自报名@url'：重命名语义（仅字符串形式支持；对象形式不支持 name@，配置期即报 CFG-007）
  'checkout': 'shop@http://localhost:5102',
  // ③ 对象：dev/prod 显式拆分 + 容错参数（全部可选）
  'remote-b': {
    dev: 'http://localhost:5103/remote-b',
    prod: '/remote-b',
    shareScope: 'default',
    timeout: 15000,            // 加载超时 ms（有限正数，配置期校验 CFG-009）
    retries: 2,                // 失败重试次数
    fallback: ['http://backup/remote-b'],  // 备用 remoteEntry，依次尝试
    breaker: { threshold: 5, resetMs: 30000 }, // 连续失败熔断
  },
  // ④ 函数：promise-based remote（构建时地址未知；等价 webpack "promise new Promise"，
  //    需在运行时配合 registerRemote 注册，见下文运行时 API）
  'remote-c': () => fetch('/api/remote-url').then(r => r.text()),
}
```

#### devCorsOrigins / devFsRoot 三态示例

```ts
// ① 开（默认/现状）：全放开——跨 dev-server 协作开箱即用；非 loopback host 时提醒 DEV-011/012
federation({ name: 'remote-a', exposes: { './Button': './src/Button.vue' } })

// ② 显式全开：同 ①，但不再提醒（声明"我知情"）
federation({ name: 'remote-a', exposes: { './Button': './src/Button.vue' }, devCorsOrigins: '*' })

// ③ 自定义 allowlist：仅列出的宿主来源可跨源访问联邦端点与源码模块
federation({
  name: 'remote-a',
  exposes: { './Button': './src/Button.vue' },
  devCorsOrigins: ['http://localhost:5100', 'https://team.example.com'],
  devFsRoot: false,   // 同时不把本机绝对路径写进 dev manifest（宿主 dts 降级 any 桩并提示）
})
```

行为边界：`devCorsOrigins` 只作用于 dev（build 产物不受影响）；用户显式配置的 `server.cors` 永远优先于插件注入的 cors 选项；端点对未命中来源只是省略 `Access-Control-Allow-Origin` 响应头（同源请求不受任何影响）。`devFsRoot: false` 只影响 dev manifest 的 `fsRoot` 字段（该字段永不进入 prod manifest）。

#### shared 的完整选项（SharedHint）

```ts
shared: {
  vue: {
    singleton: true,            // 全页单实例（vue/pinia/vue-router 强烈建议 true）
    requiredVersion: '^3.4.0',  // semver 全语法；false = 接受任意；缺省从 package.json 推断
    strictVersion: false,       // 缺省：有本地副本且非 singleton → true（不满足即抛 MFU-003）
    shareKey: 'vue',            // 共享作用域里的键（导入名与共享名不同时用）
    shareScope: 'default',      // 该项的共享作用域
    eager: false,               // true = 本地副本打进初始 chunk（同步可用）
    import: 'vue',              // 本地副本模块；false = 纯消费不提供（与 eager 互斥，CFG-008）
    version: '3.4.21',          // 显式提供版本（缺省读本机安装版本）
  },
  // 字符串简写：等价 { requiredVersion: '^4.4.5' }
  'vue-router': '^4.4.5',
  // 数组形式：shared: ['vue', 'pinia']
}
```

版本裁决语义对齐 webpack：满足 requiredVersion 的最高版本胜出；已加载版本永不替换；singleton 收敛到唯一实例；strictVersion 冲突抛 MFU-003。`MFU-010` 仅在最终选中的单例版本不满足某个消费方的 `requiredVersion` 时告警。提示会列出候选版本、实际提供方、影响及修法；同一版本组合只提示一次。多个候选版本本身不是错误，例如 `^2.1.7` 包含 `2.3.1`，不能仅凭两个版本号不同就判定不兼容。

### 2. 运行时 API — `@fulgurjs/federation/runtime`

**任何文件都直接静态导入**——宿主页面、exposes 目标文件（远程页面）都一样，插件自动保证同一页面只有一个运行时实例（远程页面里的导入会被自动改写为惰性单例委托）：

```ts
// 宿主页面、远程页面，写法完全一致
import { loadRemote } from '@fulgurjs/federation/runtime'
```

> 仍可绕过代理直取全局单例（等价，调试用）：`(globalThis as any).__FULGURJS_RUNTIME__`。

#### 函数总表

> 下表全部函数与 `definePages` / `remoteSchema` / `provideAppContext` 等 context 函数 / `remoteComponent` / `createHostPages` 都从**唯一入口** `@fulgurjs/federation/runtime` 导入（见 §2）；旧入口已删除。

> **TS 提示**：`@fulgurjs/federation/runtime` 的类型随包发布，由包的 `exports` 和 `typesVersions` 直接解析；不需要 `client` 类型垫片。dev 启动时插件仅在类型目录（默认 `src/fulgurjs/types/`）生成远程 exposes 的类型声明。

| 函数 | 签名 | 说明 |
|---|---|---|
| `loadRemote` | `(spec: string, opts?) => Promise<模块命名空间>` | 加载远程模块。`spec = '远程名/./Expose键'`（`./` 可省）。远程配置了 `setup` 时，该函数是初始化生命周期的**统一触发入口**（容器 init 后、返回模块前执行 setup/onSession，见 §10）；`loadRemote('remote')` 只取容器不执行初始化。opts 见下 |
| `loadShare` | `(name: string, opts?) => Promise<命名空间>` | 共享模块协商（最高版本胜出/已加载优先/singleton 收敛）。opts：`{ requiredVersion?, singleton?, strictVersion?, shareKey?, shareScope?, fallback? }` |
| `preloadRemote` | `(spec: string, opts?: { mode?: 'preload' \| 'prefetch' }) => Promise<void>` | `remote/Expose` 只预载该 expose 的 chunk + CSS；仅传 remote 名则预载全部 exposes。`preload` 等待 CSS load/error，`prefetch` 低优先级并立即返回 |
| `getContainer` | `(name: string) => Promise<容器>` | 取远程容器（触发加载 + init），容器协议 `{ name, init, get }`；**不执行 setup/onSession**。直接访问 `container.get()` 同样不保证执行初始化——需要生命周期的加载一律走 `loadRemote` |
| `registerRemote` / `registerRemotes` | `(config \| list) => void` | 运行时注册远程（promise remote / 动态地址）。`RemoteInput`：`{ name, entry, shareScope?, timeout?, retries?, fallback?, breaker? }`。参数校验：`timeout` 有限正数、`retries` 0..10 整数、`breaker.threshold/resetMs` 有限正数——非法值**注册当场抛错**（配置文件路径在配置期即报 CFG-009）；重复注册时 entry/timeout/retries/breaker 参数按最新配置刷新，熔断计数状态保留。`timeout` 语义：超时只代表"调用方不再等待"，浏览器不会取消已发出的动态 import——后续调用复用同一 in-flight 记录，不会重复初始化同一容器 |
| `registerShare` | `(scope, name, version, get, opts?) => void` | 手工注册共享模块（一般由 init 模块自动完成） |
| `initSharing` | `(scopeName?) => ShareScopeMap` | 初始化共享作用域（一般由 init 模块自动完成） |
| `registerPlugins` | `(plugins: RuntimePlugin[]) => void` | 注册运行时插件（见下） |
| `getRuntime` | `() => FgRuntime` | 取运行时单例本体（与 `__FULGURJS_RUNTIME__` 同一实例） |
| `version` | `string` | 运行时/插件版本（跨源副本一致性诊断用） |
| `unwrapDefault` | `(ns: any) => any` | ESM/CJS default interop 工具 |

#### loadRemote 选项

```ts
const Panel = await loadRemote('shop/Panel', {
  shareScope: 'default',                        // 覆盖远程声明的 shareScope
  retries: 3,                                   // 单次调用覆盖 remote.retries
  fallbackModule: () => import('./PanelFallback.vue'),
  // 失败时返回 fallback 模块；错误事件/console 仍显式发出（不是静默兜底）；不传则抛错
})
```

#### 运行时插件

（`runtimePlugins: ['./src/fulgurjsPlugin.ts']`）

> hook 错误契约：`beforeLoadRemote` / `afterLoadRemote` 是**观测 hook**——自身抛错只告警、不改写加载结果；`resolveShare` 是**决策 hook**——显式抛错向调用方传播（绝不静默回退到另一份共享依赖）。

```ts
import type { RuntimePlugin } from '@fulgurjs/federation/runtime'

export default {
  name: 'my-plugin',
  init(hooks) {
    hooks.resolveShare = async ({ shareKey, shareScope, requiredVersion, picked, available }) => {
      // 覆写共享版本裁决：返回 ShareEntry 即生效
    }
    hooks.beforeLoadRemote = ({ remote, module }) => {}
    hooks.afterLoadRemote = ({ remote, module, module_ns }) => {}
    hooks.onRemoteError = ({ remote, error }) => {}   // error.code ∈ 错误码总表
  },
} satisfies RuntimePlugin
```

#### 调试面（无需配置，始终存在）

| 出口 | 内容 |
|---|---|
| `window.__FULGURJS_SCOPE__` | share scope 实时协商结果（键 → 版本 → `{ get, from, loaded }`） |
| `window.__FULGURJS_INFO__` | `{ remotes: { [名]: { entry, status, lastLoadMs, error, setup } }, errors: [] }`——`setup` ∈ none/pending/ready/failed |
| `window.__FULGURJS_APP_CONFIG__` | W4 全局配置镜像 |
| `window` 事件 `fulgurjs:error` | `CustomEvent<{ remote, error }>`，所有远程加载/共享错误都会发出 |

### 3. `definePages` — 宿主页面路由表（`@fulgurjs/federation/runtime`）

宿主把「URL 路径 → 远程 exposes 键」的映射表交给它校验，带参路由的静默冲突在启动期报错而不是运行时加载错组件：

```ts
import { definePages } from '@fulgurjs/federation/runtime'
import { remoteSchema } from '@fulgurjs/federation/runtime' // dev 自动生成；build 恒为空（诚实降级）

export const PAGES = definePages(
  [
    { route: '/remote-a/home', name: 'RemoteAHome', title: '首页' },
    // 带参路由：缺省推导 spec = 去首段 + 剥 :参 段；与其它条目冲突时 ERROR，
    // 指向独立 expose 用 spec 显式覆盖
    { route: '/remote-a/detail/:id', name: 'RemoteADetail', spec: 'pages/remote-a/detail', title: '详情' },
  ],
  {
    deriveSpec: (route) => 'pages/' + route.replace(/^\//, '').split('/').filter(s => !s.startsWith(':')).join('/'),
    remotes: { '/remote-a/': 'remote-a' },   // 路由前缀 → 远程名
    schema: remoteSchema,                     // { [remoteName]: { exposes: string[], exists?: boolean } }
    strict: true,                             // ERROR 默认 throw；false 降级 console.error
  },
)
```

校验规则：

| 规则 | 级别 | 内容 |
|---|---|---|
| R1 | ERROR | 带参路由（无显式 spec）的推导 spec 与其它条目收敛相同——会静默加载错误组件 |
| R2 | WARN | 多条目有效 spec 完全相同（刻意的菜单别名可忽略） |
| R3 | ERROR | spec 不在该 remote 的 exposes 清单中（dev 有 schema 时校验；远程不可达诚实跳过） |
| R4 | ERROR | 静态路由被更靠前的带参路由遮蔽（先到先得）／路由完全重复 |
| R5 | WARN | name 重复（vue-router 命名跳转歧义） |

`validatePages(pages, options)` 为独立导出：返回违例清单不抛错，便于自测。

同子路径的类型：`PageRouteLike`（路由条目形状）、`PagesOptions`（校验选项，含 `deriveSpec` / `remotes` / `schema` / `strict`）、`PageViolation`（`validatePages` 的返回条目，含 `level` 与说明）、`RemoteSchemaEntry`（`schema` 里每个远程的条目形状）。

### 4. `fulgurjs.config.ts` — 每项目一份的联邦配置（默认形态）

```ts
// my-app/fulgurjs.config.ts —— 默认导出直接可传给 federation()；无 root/apps[]/角色壳
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'my-app',                 // 联邦容器名（必填）
  exposes: { './pages/home': './src/views/Home.vue' },
  remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
  setup: './src/fulgurjs/setup.ts', // 可选：远程初始化入口（§10）
  shared: { vue: { singleton: true } },
  devSharedSelf: true,            // 可选：显式覆盖；缺省按角色推断（提供 exposes/setup → true）
} satisfies FederationOptions

// ── 以下具名导出仅供 CLI explain/check-pages 读取，不是 federation() 的参数 ──
// 宿主应用：页面表与运行时 createHostPages 消费同一份数据模块（唯一手工维护位置）
// import { pages, remotePrefixes, deriveSpec } from './src/fulgurjs/host/pages.data'
// export const hostPages = { pages, remotePrefixes, deriveSpec }
```

CLI 内部加载器（`loadAppConfig`）以**原配置文件为解析基准** esbuild-bundle 读取：支持项目内
相对导入的纯 TS/JS 数据模块（extensionless 可）、Node ≥ 18、CJS/ESM 双形态；缺失文件、无
`name`、字段形状不对、expose/setup 指向项目外或不存在文件等均三段式报错。运行时（Vite）与
CLI 解析同一份配置值；dev/prod 的 URL 选择规则与 `federation({ remotes })` 一致（§1）。

**历史兼容（4.1.0 聚合配置，`@fulgurjs/federation/config` 子路径）**：`defineRepoConfig({ root,
apps[] })` 形态自动识别并保持 4.1.0 行为；程序化加载 `loadRepoConfig(configPath): Promise<RepoConfig>`
与转换 `federationOptionsForApp(config, appPathOrName): FederationOptions` 继续可用（应用不存在时
报出可用清单；同键不同地址冲突报错）。同子路径类型：`RepoConfig`／`UserConfig`／`AppConfig`／
`HostConfig`／`RemoteConfig`／`DeployConfig`／`PageEntry`／`RemoteAddress`。兼容不等于推荐——
新项目一律用上方单项目形态。


### 5. CLI 命令参考

| 命令 | 说明 |
|---|---|
| `fulgurjs init` | 在当前目录生成**单项目** `fulgurjs.config.ts` 起步模板（默认导出 = `federation()` 选项 + 可选 `hostPages` 具名导出示例）；`--template <path>` 指定输出路径；已存在拒绝覆盖，`--force` 强制。init **只生成配置起步模板**，不生成桥/路由/启动器/NGINX 文件 |
| `fulgurjs init --config <path>` | 校验配置（CFG 三段式报错）+ 输出 `federation(fulgurjsConfig)` 接入块与通用核对清单（纯打印）。旧聚合配置自动识别，保持 4.1.0 输出（各应用粘贴块 + NGINX no-cache **打印样板**） |
| `fulgurjs explain [--config <path>] [--app <名>]` | 配置解释器（纯本地、无网络、不读 token/环境秘密）：应用角色（**按实际 federation 选项判定**——配 `remotes` 即消费、配 `exposes`/`setup` 即提供，两者均有=双角色，如双向联邦的 BPM）、有效 remotes、公开 exposes、内部 setup、shared、页面 spec 映射与数据来源、`devSharedSelf` 最终值及来源、加载链。单项目形态免 `--app`；聚合配置需 `--app <应用目录名或容器名>`。`--json` 供 CI |
| `fulgurjs check-pages [--config <path>] [--app <宿主名>] [--site <URL>] [--manifest <r>=<路径\|URL>]... [--require-verified]` | 页面契约核对：宿主页面表（单项目 = `hostPages` 具名导出；聚合 = `host.pages`）↔ 远程 manifest exposes。manifest 来源优先级 **`--manifest`（可多次、文件路径或 URL） > `--site`/消费方 prod 地址推导 > 本地 dist（仅聚合形态回退）**，输出每个 remote 的实际命中来源（防止旧本地 dist 冒充线上核对）。报告未知 remote、映射到未消费远程、缺失 expose、路由冲突（R1–R5）；**确定性错误退出码 1**，远程不可达报「无法验证」，`--require-verified` 时无法验证也非零（CI 严格模式，避免 0 条核对显示通过）。`--json` 供 CI |
| `fulgurjs doctor --base <URL> --apps <a,b,c>` | 部署体检：remoteEntry/manifest/index.html 的 200/no-cache/JS 形态、CORS、chunk 抽样可达、版本 skew 预演。`--dev` 检查 dev 容器入口；`--json` 输出 JSON（CI 断言）；`--chunk-sample N` 控制抽样数（默认 16）。**退出码：有 FAIL 即 1**，可直接做 CI 门禁 |

### 6. 错误码总表（41 个）

| 段 | 码 | 含义 |
|---|---|---|
| CFG 配置期 | `CFG-001` | name 缺失或非法 |
| | `CFG-002` | exposes 配置形状错误 |
| | `CFG-003` | remotes 配置形状错误 / 键含非法字符 |
| | `CFG-004` | shared 配置形状错误 |
| | `CFG-005` | remotes 键与 shared 键同名冲突 |
| | `CFG-006` | 孤岛配置（既不提供也不消费） |
| | `CFG-007` | remotes 对象形式误用 name@ 前缀（整串当 URL 拼接） |
| | `CFG-008` | shared 非法组合（eager+import:false / shareKey 重复声明） |
| | `CFG-009` | remotes 运行参数非法（timeout/retries/breaker 非有限正数/超上限） |
| | `CFG-010` | devCorsOrigins 形态非法（须为 "*" 或 http(s) 来源数组） |
| | `CFG-011` | 不支持的互操作选项硬报错（remoteType/library.type 非 module 系、automaticAsyncBoundary=false——不再静默回落） |
| | `CFG-012` | setup 配置非法（路径为空/非字符串，或 exposes 占用内部保留键 `./__fulgurjs_setup__`） |
| DEV 开发期 | `DEV-001` | remote dev server 不可达（manifest 拉取失败） |
| | `DEV-002` | remote dev manifest 为空或格式不识别 |
| | `DEV-004` | 已知 UMD-only 依赖不在 optimizeDeps.include（预构建内联本地 vue 风险） |
| | `DEV-005` | remotes dev URL 端口无监听 |
| | `DEV-006` | 宿主/远程插件版本不一致 |
| | `DEV-009` | 门面/虚拟模块 404（.vite 缓存漂移，需清缓存重启） |
| | `DEV-010` | dev 冷启动预构建窗口提示（首轮 30~60s 瞬态，非故障） |
| | `DEV-011` | 非 loopback host + 通配 dev CORS（暴露面扩大提醒） |
| | `DEV-012` | 非 loopback host + dev manifest 携带 fsRoot（本机路径外发提醒） |
| BLD 构建期 | `BLD-001` | expose 源文件解析失败 |
| | `BLD-002` | 构建目标低于 es2022（TLA 需要） |
| | `BLD-003` | expose 目标组件含必填 props（文档化核对项） |
| | `BLD-006` | output 数组形态下无法自动注入协商门面 chunk 隔离（需手工加分支） |
| MFU 运行时 | `MFU-001` | 远程容器/模块加载失败（网络/超时/重试耗尽/熔断） |
| | `MFU-002` | remoteEntry 自报名与配置名不一致 |
| | `MFU-003` | strictVersion 版本不满足 |
| | `MFU-004` | 共享模块缺失且无本地 fallback |
| | `MFU-005` | 同一容器用不同 share scope 重复 init |
| | `MFU-006` | 请求的模块未被该远程 exposes |
| | `MFU-007` | 预加载失败（不阻断业务） |
| | `MFU-008` | 未知远程 |
| | `MFU-009` | 加载到的模块没有任何导出 |
| | `MFU-010` | 选中的共享单例版本不满足消费方要求；显示版本、提供方、影响和修法，同一组合只告警一次 |
| | `MFU-011` | setup 生命周期入口导出形态非法（默认导出/具名 onSession 不是函数；报实际类型/预期签名/修法） |
| | `MFU-012` | setup/onSession 执行抛错（该次 loadRemote 拒绝；仅清失败阶段缓存，可直接重试，已成功的阶段不重复） |
| | `MFU-013` | 远程声明 onSession 但宿主 AppContext 缺 sessionKey（登录代次；禁止用 token 充当） |
| | `MFU-014` | setup/onSession 同步段内递归 loadRemote 同一远程（自等待死锁防线） |
| CC 跨应用上下文 | `CC-001` | AppContext 必需字段缺失（三段式：got/expected/example，修法指向宿主桥 `provideAppContext`） |
| | `CC-002` | 运行时单例不可用（独立直开远程页；修法 = 经宿主联邦加载，时序契约 bridge → 远程 setup → 页面模块） |

错误排查三段式文案见「配置出错？报错看得懂」一节（下文）；`fulgurjs doctor` 可提前把部署面的 MFU-001 类问题拦在上线前。

### 7. 产物与端点约定

| 环境 | 路径 | 说明 |
|---|---|---|
| dev | `/<base>/@fulgurjs-entry.js` | 远程容器入口（插件中间件直出，自包含） |
| dev | `/<base>/@fulgurjs-manifest.json` | dev manifest（宿主 dts / preloadRemote 消费） |
| prod | `/<base>/fulgurjs-remoteEntry.js` | 固定文件名容器入口（内容每次构建变——**必须 no-cache**） |
| prod | `/<base>/fulgurjs-manifest.json` | expose chunk/CSS 清单（preloadRemote 消费，**no-cache**） |

NGINX no-cache 规则（remoteEntry/manifest/index.html）与深链回退是联邦部署通用知识：`fulgurjs init --config` 在**旧聚合配置形态**下把它作为打印样板输出（不写文件），单项目形态按下方规则自行落位。

### 8. `remoteComponent` — Vue 远程组件直渲染（`@fulgurjs/federation/runtime`）

```ts
import { remoteComponent } from '@fulgurjs/federation/runtime'

const FederatedBusinessForm = remoteComponent('demo-host/FormRouterPage')
const FederatedAmisForm = remoteComponent('demo-host/AmisFormRouterPage', {
  loadingComponent: MyLoading,   // 可选：加载期组件
  errorComponent: MyError,       // 可选：失败期组件（收到 error prop）
  retries: 2,                    // 可选：透传 loadRemote 单次调用级重试覆盖
})
```

| 选项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `loadingComponent` | `Component` | — | 加载期间展示 |
| `errorComponent` | `Component` | 内置错误占位 | 加载失败展示（Vue 会传入 `error` prop） |
| `retries` | `number` | 远程注册值（默认 2） | 透传 `loadRemote` |
| `delay` | `number` | `200` | 切到 loadingComponent 前的等待（ms） |
| `timeout` | `number` | — | 超时进错误态（ms）；不设由 runtime 容器超时兜底 |

语义与边界：

- 内部 = `defineAsyncComponent({ loader: () => loadRemote(spec, opts).then(m => m.default ?? m) })`，返回标准 Vue 异步组件，`props`（如 `form-params`）在使用处直接透传；
- **无任何兜底/降级**（H3 零兜底）：加载失败显式进错误态；不传 `errorComponent` 时渲染内置占位（错误码 + 根因 + 修法三段式文案），`window` 的 `fulgurjs:error` 事件由 runtime 层照常发出；
- 模块去重沿用 `loadRemote` 内部 Promise 缓存——同 spec 多组件实例只加载一次容器模块；
- `vue` 为**可选 peerDependency**（`peerDependenciesMeta.optional`）：只使用包根或 `/config` 时无需安装；应用使用 `/runtime` 时需要安装 Vue，因为该入口导出 `remoteComponent`。内部 `runtime.js` 仍不导入 Vue，体积零增量；
- 运行时实例经 `globalThis.__FULGURJS_RUNTIME__` 页面级单例复用，与 `@fulgurjs/federation/runtime` 的导入殊途同归，无需额外接线。

### 9. `AppContext` — 跨应用传值与方法引用（`@fulgurjs/federation/runtime`）

宿主向子应用传值、子应用向宿主反向注册方法，一律走这条一等公民通道（对标乾坤 `props`，但带类型与错误契约）——不再各自挂 `window.*` 裸口子。

```ts
// —— 宿主桥（host/src/fulgurjs/host/bridge.ts）：登录态同步（可多次调用，幂等 merge） ——
import { provideAppContext, clearAppContext } from '@fulgurjs/federation/runtime'

provideAppContext({
  user,                                  // 宿主登录用户原始形态（当时快照）
  getToken,                              // 取最新 token（拉取式防过期）
  store: piniaInstance,                  // 宿主 pinia：子应用 useUserStore(ctx.store) 共享响应式状态
  hostApp: app,                          // 宿主 Vue App 实例：全局组件/指令注册目标
  locale,                                // EP locale 等 UI 配置
  sessionKey: 's-101-1730…',             // 非敏感登录代次 ID：每次成功登录/重登生成新值；
                                         // token 刷新但会话未变时沿用。远程 onSession 按它去重，
                                         // 缺失时声明了 onSession 的远程报 MFU-013。不是 token、不做授权凭证
  events: { main: mainEvents },          // 事件/方法池：宿主提供 main；子应用反向注册 bpm.* / lowcode.*
  // 只传有真实消费的键。项目自定义键经扩展位按需自行提供（如 baseUrl: '/demo'）
})

// 退出登录时清理：删 context + 作废远程会话信号/onSession 去重状态
// （不重置远程模块缓存、共享模块图与应用级 setup 注册）
clearAppContext()

// —— 远程 setup/onSession：显式校验消费 ——
import { requireAppContext } from '@fulgurjs/federation/runtime'

const { store, user, hostApp } = requireAppContext('store', 'user', 'hostApp')
// 缺任一键 → [fulgurjs:CC-001] 三段式抛错（got / expected / example 指向宿主桥）；
// 页面无运行时单例（独立直开远程页）→ [fulgurjs:CC-002] 显式，修法 = 经宿主联邦加载。

// —— 远程页面读点 ——
import { getAppContext } from '@fulgurjs/federation/runtime'
const dict = getAppContext().events?.main?.getDictItems?.('sex')

// —— 子应用反向注册方法给宿主（页面 onUnmounted 时记得摘除，见迁移指南「页面卸载清理清单」）——
getAppContext().events!.bpm = { formEvent, formSubmitEvent }
```

标准字段表：

| 字段 | 类型 | 语义 | 写方 |
|---|---|---|---|
| `user` | `Record<string, any>` | 宿主登录用户原始形态（提供时快照） | 宿主桥（只读约定；登录态变化时重新 provide 覆盖） |
| `getToken` | `() => string \| undefined` | **取最新 token**（拉取式调用，永不过期；context 不提供一次性 token 快照字段） | 宿主桥（只读约定） |
| `store` | `unknown`（运行时为宿主 pinia） | 子应用挂载/读取宿主共享响应式状态 | 宿主桥（只读约定） |
| `hostApp` | Vue App 实例（同 realm 直引用） | 全局组件/指令注册目标 | 宿主桥（只读约定） |
| `locale` | `unknown` | EP locale 等 UI 配置 | 宿主桥（只读约定） |
| `sessionKey` | `string` | 非敏感登录代次 ID：每次成功登录/重登生成新值；token 刷新但会话未变时沿用。远程 onSession 按它去重（同一代次只执行一次，换代自动重跑）；退出 `clearAppContext` 后必须重跑。生成责任在宿主登录流程；**不得用真实 token 充当**，也不作为授权凭证 | 宿主桥（登录后） |
| `events` | `Record<string, any>` | 事件/方法池：`events.main.*` 宿主提供、`events.bpm.*` / `events.lowcode.*` 子应用反向注册 | 宿主桥建池，子应用挂载 |
| （扩展位） | `[key: string]: unknown` | 项目自定义键（`formUrl` / `baseUrl` 等按需自行提供，模板默认不传） | 宿主桥；远程 boot 只增不改宿主键 |

变更语义与时序契约：

- `provide` = 顶层 merge（后写覆盖，幂等可多次）；约定「宿主先写标准字段，远程只增不改宿主键」；嵌套对象（如 `events`）是**引用共享**，子应用挂属性即时可见（同 realm 直引用）；
- 时序契约：**bridge（provide）→ 远程 setup/onSession（require）→ 页面模块返回**——违反即在初始化处显式失败（CC-001 / MFU-013），不静默；
- 数据语义 = **传输层快照 + 函数引用，非响应式**（与乾坤 props 同语义）。"实时"由两条正规通道承担：① `getToken()` / `events.main.*` 函数引用每次调用执行宿主最新闭包；② `context.store` 把宿主 pinia 递给子应用（共享响应式实例）。**同页换账号（退出→B 登录→再打开远程页）不依赖页面刷新**：宿主重新 provide 最新 context + `sessionKey`，远程 `onSession` 检测到新代次自动重跑，同步用户/权限/字典等会话状态（见 §10）。context 本体不做 Vue reactive（runtime 框架无关 + gzip 红线 + 跨包 proxy 双份陷阱）；"中途变更需通知"的场景：等真实需求出现再设计（当前无此场景，不预留空 API）。

方法引用两条通道：

| 通道 | 语义 | 适用 |
|---|---|---|
| **context 携带函数引用** | 同步直调（bridge 先于一切页面加载） | 高频热路径（`getToken` / `getDictItems` / `getFileAccessHttpUrl`）、子应用反向注册（`formEvent`） |
| **exposes 方法模块** | `exposes: { './api': './src/fulgurjs/exposes/api.ts' }` → `const { xxx } = await loadRemote('remote/api')` | 低频/重逻辑跨应用调用；任意 expose 任意消费；dts 类型直连自动覆盖 |

方法模块规范：`src/fulgurjs/exposes/` 下的 `api.ts` 导出纯函数/服务对象（不挂 Vue 组件）；依赖宿主单例的函数（如 defHttp 走 shared）直接写，联邦协商保证同模块图。

端到端示例（提供方 admin，消费方任意应用）：

```ts
// ① 提供方 vite.config.ts：exposes 加一条
exposes: { './api': './src/fulgurjs/exposes/api.ts' }

// ② 提供方 src/fulgurjs/exposes/api.ts：导出纯函数
import { defHttp } from '/@/utils/http/axios'
export function getDictItems(dictCode: string) {
  return defHttp.get({ url: '/sys/dict/getDictItems/' + dictCode }, {})
}

// ③ 消费方（任意页面，类型直连自动覆盖）：
const { getDictItems } = await loadRemote('demo-host/api')
const res = await getDictItems('sex')
```

存储说明：context 的存储本体即全局镜像对象 `window.__FULGURJS_APP_CONFIG__`（页面级单例，跨 bundle 副本共享同一份；调试面板可直接查看）。

### 9.1 乾坤功能融合：保活 / 骨架屏 / 空闲预载 / 诊断面板（宿主与模板侧能力）

这些能力全部是**项目侧**能力（手工集成的项目按下述接入点自行落位；`fulgurjs init` 只生成配置起步模板，不生成这些项目文件），插件 runtime.js 零参与。配置面总览：

| 能力 | 配置项 | 类型 | 默认值 | 配置位置 |
|---|---|---|---|---|
| 页面保活 | `keepAlive` | `boolean` | `false` | 页面路由表条目（`src/fulgurjs/host/pages.ts`） |
| 页面加载骨架屏 | —（内置，无配置项） | — | 见下方内置参数 | `src/fulgurjs/host/pages.ts` 页面工厂 |
| 空闲预载 | `PREFETCH_REMOTES` | `string[]` | `[]`（关闭整远程预载，按需加载；详见 §9.1.3） | `src/fulgurjs/host/bridge.ts` 顶部常量 |
| 联邦诊断面板 | —（内置页面） | — | 常驻 | 路由 `/fulgurjs-demo` |

#### 9.1.1 页面保活 — `keepAlive`

页面级布尔开关：开启后该页面切换到其他标签页时**组件实例不销毁**（deactivate），切回时表单输入、筛选条件、滚动位置原样恢复。

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `keepAlive` | `boolean` | `false` | `true` = 该页面纳入 LayoutContent 联邦分支 `<keep-alive>` 的 include 白名单 |

```ts
// src/fulgurjs/host/pages.ts — 页面路由表条目

// 开启保活（显式）
{ route: '/flowable/bpm/task/todo', name: 'BpmTodoTask', title: '待办任务', keepAlive: true }

// 关闭保活：不写该字段，或显式 false（二者等价，默认即关）
{ route: '/flowable/bpm/manager/form', name: 'BpmForm', title: '流程表单', keepAlive: false }
```

行为与边界：

- 缓存上限 `max: 8`（Vue 原生 LRU，超出后最久未访问的页面实例被销毁）；
- 缓存键 = 页面 spec 清洗名（`Fulgurjs_<remote>_<expose键>`），同一路由不同参数（fullPath 不同）各占一个缓存条目；
- **默认全关的原因**：vxe-table、表单设计器等重型组件的缓存内存成本高，按页面逐个显式开启；
- 开启页面的组件若注册了 `window` 级监听/定时器/context 反向注册，须遵循迁移指南「三D 页面卸载清理清单」（保活页只在真正被 LRU 淘汰时才 unmount）。

#### 9.1.2 页面加载骨架屏 — 内置 `loadingComponent`（无配置项）

页面组件工厂的 `defineAsyncComponent` 内置了加载期占位：联邦页面 chunk 下载/模块执行期间，内容区显示 4 条渐变动画骨架条而非白屏。**本能力无配置项**，内置参数如下：

| 内置参数 | 值 | 说明 |
|---|---|---|
| `loadingComponent` | `FulgurjsSkeleton`（4 条渐变动画条） | 工厂内置组件，位于 `src/fulgurjs/host/pages.ts` |
| `delay` | `200`（毫秒） | 超过 200ms 未加载完成才显示骨架——快速加载时不闪烁 |
| `errorComponent` | 内置错误占位 | 加载失败显示 spec + 完整错误（错误码 + 根因 + 修法） |

如需自定义加载占位（如品牌 logo 动画），不经页面工厂，改用 `remoteComponent(spec, { loadingComponent })`（见 §8）。

#### 9.1.3 空闲预载 — `PREFETCH_REMOTES`（默认关闭）

**先分清四层（重要，勿把「路由声明多」当成「首屏会执行所有页面代码」）**：

| 层 | 机制 | 时机 | 网络成本 |
|---|---|---|---|
| ① 路由表声明 | `pages.data.ts` 26 条记录只是**数据映射**，不导入任何远程代码 | 构建期 | 零 |
| ② 页面真实加载 | `createHostPages` 对每页 `defineAsyncComponent` 包装，**渲染时**才 `loadRemote(spec)` | 用户打开该页 | 该页 chunk + CSS（首次该远程还有入口/共享依赖/setup） |
| ③ 单页预取 | `preloadRemote('remote-a/pages/remote-a/home', { mode: 'prefetch' })` | 项目主动调用 | 该 expose 的 chunk + CSS（**只下载不执行**） |
| ④ 整远程预取 | `preloadRemote('remote-a', { mode: 'prefetch' })` | 项目显式开启 | manifest 全部 expose 的 chunk + CSS（**只下载不执行**） |

预取是**下载**（`modulepreload`/`stylesheet` 链接，`fetchPriority=low` 只是降低优先级、不等于不下载），**不等于执行页面代码**——`container.get()`、组件实例化、`setup/onSession` 都只由真实页面的 `loadRemote` 触发。已加载模块有 Promise 缓存：重复打开同页复用模块，换账号重做会话初始化但不重新下载 JS。多个 expose 共享同一 chunk 是正常打包结果。

宿主桥默认**关闭整远程预载**（`PREFETCH_REMOTES = []`）：首次进入联邦页只下载该页所需资源，dashboard 不因登录而提前下载两个远程的全部页面文件。某项目的用户路径确有明确的「下一步页面」时，可低优先级预取一两个明确指定的 spec；把 `PREFETCH_REMOTES` 写成远程名列表则是**显式选择**整远程预热（下载完整 expose 清单）。

> 插件配置面（`FederationOptions`）**没有** `host.prefetch` 字段——4.1.0 前文档曾声称该配置存在，属错误描述，已订正。预载名单就是宿主桥里的常量，改名单只改这一个地方。

```ts
// src/fulgurjs/host/bridge.ts 顶部常量
const PREFETCH_REMOTES: string[] = [] // 默认：关闭整远程预载（按需加载）

// 只预取下一步很可能打开的明确页面（低优先级，只下载不执行）
// idle(() => preloadRemote('mes-bpm/pages/bpm/task/todo', { mode: 'prefetch' }))

// 显式预热整个远程（下载完整 expose 清单；确有真实使用路径再开启）
// const PREFETCH_REMOTES: string[] = ['mes-bpm', 'mes-lowcode']
```

行为与边界：

- 预载失败**不阻断业务**：runtime 按 MFU-007 语义发出 `window` 的 `fulgurjs:error` 事件并 console 警告（诊断面板⑤可查历史）；
- 预载注入 `<link rel="modulepreload">` 与 `<link rel="stylesheet">`，不执行模块——首次打开页面时才真正初始化容器；`preload` 等待样式 load/error，`prefetch` 低优先级后台加载；
- 触发时机：宿主桥每次页面加载同步执行（幂等），实际预取发生在浏览器空闲回调中。

#### 9.1.4 联邦诊断面板（免登录页，无配置项）

演示页升级为运行时诊断面板（源自乾坤 v3 inspector 概念的轻量化），访问路由 `meta.ignoreAuth` 的 `/fulgurjs-demo`（prod 为 `/main/fulgurjs-demo`），六块信息实时读取运行时注册表：

| 块 | 内容 |
|---|---|
| ① 方法模块调用演示 | 按钮实调 `loadRemote('demo-host/api')` → `getDictItems('sex')` 并显示结果（方法引用通道②的活样例） |
| ② remotes 状态 | 各 remote 的 entry / 加载状态（idle/loading/loaded/failed）/ 容器加载耗时 |
| ③ shared 协商 | 共享键 → version ← 提供方（多版本并存可见） |
| ④ context 快照 | AppContext 每个键的值形态（函数引用 / 对象 / 字符串，含 events 池） |
| ⑤ fulgurjs:error 历史日志 | window 事件累积（时间戳 + remote + 错误消息），本轮会话零错误显示"无错误" |
| ⑥ 远程资源加载耗时 | performance resource 中 fulgurjs / remoteEntry / chunk 相关条目与耗时 |

#### 9.1.5 IDE 说明（`src/fulgurjs/` 目录的红波浪线）

- `types/` 下的 `*.d.ts` 是**插件每次 dev 自动生成**的类型直连声明（勿手改）：内部 `export * from '../../../demo-app-xxx/src/***.vue'` 指向**兄弟工程的源码**。命令行 `vue-tsc --noEmit`（走本应用 tsconfig，skipLibCheck 生效）为 **0 错误**；但 **VSCode/Volar 在打开这些 d.ts 时**可能把工程外 .vue 用推断项目（inferred project，无 tsconfig 上下文）展开检查，显示大片"找不到模块 '@/...'"——**仅编辑器显示问题，不影响命令行检查与构建**，不打开 `types/` 生成物即无感。
- 升级插件版本后若 `import ... from '@fulgurjs/federation/runtime'` 报 ts(2307)：是 IDE 的 TS 服务缓存了旧包——`Restart TS Server`（⌘⇧P）或重开窗口即可。3.0.0 起旧子路径（`@fulgurjs/federation/{context,pages,vue}`）已从包 exports 删除，按迁移映射改为 `@fulgurjs/federation/runtime`。
- **根治红波浪线**：`federation({ dts: { mode: 'shim' } })` —— 生成物不再引用跨工程源文件（宽松占位形态），IDE 全程干净；取舍是失去"跳转直达远程源码"的补全能力（默认 `source` 不变，按项目偏好选择）。

### 10. `createHostPages` 与 `setup`/`onSession` — 宿主页面适配器与远程初始化（`@fulgurjs/federation/runtime`）

#### 10.1 `createHostPages(options)` — 宿主页面适配器

```ts
import { createHostPages } from '@fulgurjs/federation/runtime'

export const hostPages = createHostPages({
  pages: [/* PageRouteLike[]：宿主路由与布局共用的唯一页面来源 */],
  remotePrefixes: { '/remote-a/': 'remote-a' },  // 必填；最长前缀匹配
  deriveSpec: (route) => `pages/${...}`,          // 可选；缺省 = 去首段 + 剥 :参数 段
  schema: remoteSchema,                           // 可选；dev 探针结果（R3 校验），build 为空表诚实降级
  strict: true,                                   // 可选；ERROR 级校验失败默认 throw
  base: '/main',                                  // 可选；resolve 时剥离的站点 base 前缀
  beforeLoad: () => { /* 每次页面模块实际加载前执行（同步/异步）；宿主在此提供最新 context */ },
  loadingComponent: MySkeleton,                   // 可选；缺省无骨架
  errorComponent: MyError,                        // 可选；缺省 = 内置三段式错误占位
  delay: 200,                                     // 可选；骨架屏延迟 ms
})
```

| 返回成员 | 说明 |
|---|---|
| `pages` | 原页面记录（不经改写，宿主路由注册直接用） |
| `resolve(path)` | `{ page, remote, spec, params } \| null`——兼容 base 前缀与深链；参数解码失败只让该次匹配失败（console 提示），不抛错 |
| `component(spec)` | 异步页面组件（`<remote>/<exposes键>` 完整 spec）；同 spec 复用。**会话感知**：AppContext.sessionKey 变化（换账号/重登/退出）后自动重建组件——下一次渲染重新走 `beforeLoad → loadRemote`，触发新代次的 `onSession`（模块本体经 loadRemote 缓存复用，不重复下载）。无 sessionKey 的用法缓存永不失效 |
| `keepAliveNames` | `keepAlive: true` 页面的组件 name（与实际被 KeepAlive 缓存的包装组件一致，直接绑 `<keep-alive :include>`） |

行为契约：

- 页面表经 `definePages` 校验（R1 剥参冲突 / R2 重复 spec / R3 spec 存在性 / R4 遮蔽与重复 / R5 重名），行为与独立使用完全一致；
- `remotePrefixes` **最长前缀优先**（不再是"先到先得"）；页面路由无匹配前缀在 `createHostPages` 创建期即报错（fail fast）；
- 组件是**本地包装组件**（稳定 name 供 KeepAlive include 匹配），不修改远程模块导出的组件对象（它可能是跨页面共享的模块实例）；attrs/slots 全量透传；
- 加载顺序：`beforeLoad` → 远程可选 `setup`/`onSession`（loadRemote 生命周期）→ 页面模块；失败进 `errorComponent` 错误态（显式错误码/根因/修法），不静默回退。

#### 10.2 `federation({ setup })` — 远程初始化生命周期

```ts
// 远程 vite.config.ts
federation({ name: 'remote-a', exposes: { ... }, setup: './src/fulgurjs/setup.ts' })
```

```ts
// remote-a/src/fulgurjs/setup.ts —— 只有下面两个函数名有自动生命周期语义
import type { RemoteSetupContext, RemoteSetupModule } from '@fulgurjs/federation/runtime'

export default async function setup(context: RemoteSetupContext) {
  // 应用级一次性注册：全局组件/指令、全局样式、locale 注入、宿主 app 上的插件安装
  // context.appContext = 调用时的 AppContext 快照；context.signal = 生命周期信号
}
export async function onSession(context: RemoteSetupContext) {
  // 会话级同步：当前用户、权限、字典、token 相关缓存
  const data = await fetchUserDicts()
  if (context.signal.aborted) return  // ← await 之后写状态前必须检查：期间可能已换账号/退出
  writeToStores(data)
}
```

`RemoteSetupContext`：`{ appContext: Readonly<AppContext>, sessionKey?: string, signal: AbortSignal }`。`appContext` 是**调用时**从页面级 AppContext 取得的快照（不保存永不更新的旧引用）；`signal` 在登录代次变化或退出清理时失效。

固定契约：

| 维度 | 语义 |
|---|---|
| 触发入口 | `loadRemote('remote/模块')` 是**统一入口**（`remoteComponent` 与宿主页面适配器同源）。`loadRemote('remote')`、`getContainer()`、`preloadRemote()`、直调 `container.get()` 都**不执行**初始化 |
| 时序 | 取得容器 → `init(shareScope)`（共享作用域收养）→ **setup** → **onSession** → 返回业务模块。setup 模块自身的导入在该阶段完成共享协商 |
| 执行次数（setup） | 每容器一次；并发调用共享同一 Promise；成功后不重复。`preloadRemote` 只预取资源不执行 |
| 执行次数（onSession） | 按非敏感 `sessionKey` 去重：同一登录代次一次；新代次先作废旧 `signal`，再按远程**串行**衔接旧调用与新调用（防两账号异步写入交错）；`clearAppContext()` 失效去重状态，下次登录必须重跑。应用级 setup 不因退出/换代重复执行 |
| sessionKey | 宿主登录流程每次成功登录/重登生成新代次（非敏感 ID，禁止用 token）；token 刷新但会话未变时沿用。**有 onSession 却缺 sessionKey → MFU-013**，不凭用户对象引用猜测身份；无 onSession 的远程无需 sessionKey |
| 导出校验 | 必须默认导出函数；具名 `onSession` 可选且必须是函数；其他导出不作为入口。违反 → MFU-011（报实际类型/预期签名/修法） |
| 失败与重试 | setup/onSession 抛错 → 该次 `loadRemote` 拒绝（MFU-012）；**只清失败阶段的缓存**（setup 失败重试从 setup 开始；onSession 失败只重跑会话段），已成功的阶段不重复。`fallbackModule` 不掩盖初始化失败 |
| 自递归 | setup/onSession 同步段内 `loadRemote(同 remote/…)` → MFU-014（该调用会等待自身形成死锁）。异步段内的同远程递归无法精确归因，表现为挂起——不要在初始化内加载同远程模块 |
| dev/prod 一致 | dev 容器（中间件直出）与 prod 容器（构建产物）携带同一 setup 元数据（容器上的 `__fulgurjsSetup` 字段 + manifest 的 `setup` 字段）；内部 expose 键 `./__fulgurjs_setup__` 不出现在 dts 类型与公开文档 exposes 清单中 |
| 错误码 | MFU-011 导出非法 / MFU-012 执行失败 / MFU-013 缺 sessionKey / MFU-014 自递归；全部带 remote 名、模块路径/阶段、实际结果、预期与修法，不记录 token |

旧的「`exposes: { './federatedBoot': ... }` + 宿主手动 `loadRemote` 并调用」写法**继续可用**（旧项目分批迁移），但不再是推荐接法——见[迁移指南](#文档)的兼容说明。



## ⚠️ 首次使用避坑指南（真实迁移项目踩坑实录）

以下每一条都在真实企业工程（qiankun → 联邦迁移，3 万模块级）中实际踩到过：

### 0. 受控诊断（DEBUG=fulgurjs:*，默认关闭）

排查改写/门面/manifest 问题时开启结构化诊断（JSON 行 → stderr，不写文件）：

```bash
# 全部分类
FULGURJS_DEBUG='fulgurjs:*' pnpm dev          # 或 DEBUG='fulgurjs:*'
# 只开一个分类（transform / facade / manifest）
FULGURJS_DEBUG='fulgurjs:transform' pnpm dev
# build 同样适用
FULGURJS_DEBUG='fulgurjs:*' pnpm build 2>fulgurjs-debug.log
```

输出示例：`[fulgurjs:debug:transform] {"stage":"pre","mode":"build","module":"src/pages/a.ts"}`、`[fulgurjs:debug:facade] {"stage":"config","facadeDynamic":true,"manualChunks":"object"}`。分类：`transform`（改写命中与阶段）、`facade`（门面形态/闭包归组）、`manifest`（expose 与 CSS 收集）。脱敏约定：模块路径 root 内显示相对路径、root 外只留文件名，不输出源码文本与 query/凭证。

### 1. 插件升级后，重启 dev server 即可（缓存自动清）

vite 对 `node_modules/.vite` 预构建产物下发**一年 immutable 缓存**，插件 dist 更新后旧签名会 404。插件在 dev server 启动时**自动检测版本变化并清除缓存**——你只需要重启 dev server，无需手工 `rm -rf node_modules/.vite`。浏览器侧缓存建议 e2e/验收时换新 profile。

### 2. pnpm 项目装完 tarball 检查链接是否可达

pnpm 工作区/子项目里 `pnpm add xxx.tgz` 偶发软链断链（尤其整目录拷贝过的项目）。装完验证：

```bash
ls node_modules/@fulgurjs/federation/dist/index.js
# 断链时重新执行 pnpm add -D <tarball>
```

### 3. UMD / CJS-only 依赖（element-plus、avue、dayjs…）放 `include`，不要 exclude

插件会自动向 `optimizeDeps` 注入 esbuild 插件：把预构建产物内的 shared 键（vue 等）外部化到运行时协商门面。所以这些依赖**应该正常预构建**——移出预构建反而会让 CJS 文件被裸服务（dev 直接白屏报错）。也不要为它们手工加 `dayjs → dayjs/esm` 之类的别名：那会让构建期 CJS 消费方撞上双重 interop（典型症状 `xxx.default.extend is not a function`）。

### 4. dev 冷启动后，联邦页面先「预热」再判断

首次访问会触发依赖再预构建（504 Outdated Optimize Dep / 临时 Failed to fetch）。这是 vite 机制而非故障：把所有页面访问一轮（或重启后重访问一次）即稳定。e2e 脚本请先预热再断言，且断言一律条件轮询，不要固定短等待。

### 5. 不要手工别名/改写 shared 依赖的导入

共享依赖的改写由插件统一处理（dev 门面协商 / build 垫片）。手工别名会把 CJS 消费方导向 ESM 副本，产生双重 interop。

### 6. 构建目标必须是 es2022+

插件未显式配置 `build.target` 时会自动提升；若你自行配置了 es2021 及以下会收到警告——协商门面的 top-level await 需要它。

### 7. loadRemote 的显式降级（fallbackModule）

远程部署不稳定时，可给单次调用声明 fallback 模块：失败时返回 fallback（错误事件/console 仍会发出，**不是静默兜底**）；不传则照旧抛错：

```ts
const Panel = await loadRemote('shop/Panel', {
  retries: 3, // 覆盖 remote.retries
  fallbackModule: () => import('./PanelFallback.vue'),
})
```

### 8. 后端缺端点 / 站点域名未注册

登录页预检类接口（如租户按域名解析 `get-by-website`）在部分后端不存在时，浏览器会记录 404/401 资源报错。新站点部署时按后端要求登记域名，或在代理/NGINX 层加**诚实空响应**垫片（不伪造业务数据）。

### 9. 多版本组件库 CSS 共存

多版本 element-plus 等组件库 CSS 同挂 `:root` 变量时，**后加载的覆盖先加载的**。当前主流版本变量一致则无感；升级组件库时留意变量默认值变化。

### 10. 项目里的「env 同步脚本」会回写 env 文件

若项目里有「同步后端地址/端口」的脚本（如 `sync-backend-env.mjs`），手改 `.env.*` 会被它覆盖——改脚本维护的源头，不要手补文件。

## 配置出错？报错看得懂

所有配置问题在 `vite` 启动瞬间即报，固定三段式，可直接照抄修正：

```
[fulgurjs] federation() 配置无效：remotes["remote-a"] 没有地址（external、dev、prod 至少填写一个）
  当前值：{"dev":""}
  预期值：至少一个地址；只填一个地址时开发与生产共用
  修法示例：remotes: { 'remote-a': 'http://localhost:5101' }
  // 或分别填写：{ 'remote-a': { dev: 'http://localhost:5101', prod: '/remote-a' } }
```

运行时加载失败同样给排查指引（remote dev server 未启动 / 地址配错 / CORS / NGINX 回退），并携带统一错误码：

统一错误码体系（CFG/DEV/BLD/MFU/CC 五段共 41 个）——**完整总表见上方 [API 参考 §6](#6-错误码总表41-个)**。插件自身的诊断文案使用中文，保留 API 名、配置键、版本号及第三方底层异常原文，以便定位问题。`MFU-010` 只表示实际复用的单例版本不满足消费方要求；多个兼容版本共存不会触发该告警。浏览器中来自 qiankun/single-spa、vue-i18n 等第三方的告警不由 fulgurjs 生成，应按各自来源排查。

调试出口：`window.__FULGURJS_SCOPE__`（share 协商实时结果）、`window.__FULGURJS_INFO__`（remote 状态/耗时/错误）。

## 边界（明确不支持）

- 仅 Vue 3 生态（React 适配不在当前范围）；不兼容 originjs 的 `virtual:__federation__` 旧写法
- 不支持 SSR（检测到即警告并禁用钩子）
- 无浏览器 DevTools 扩展（提供 `window.__FULGURJS_SCOPE__ / __FULGURJS_INFO__` 调试面）
- 无 JS 沙箱 / CSS 隔离——联邦是同 realm 共存架构，靠 shared 单例协商防止双运行时（详见 `docs/沙箱边界审计.md` 的三维度实测）

## 文档

- [`docs/迁移指南.md`](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/迁移指南.md) — qiankun 微前端 → 联邦的真实迁移案例（七步法 + 验收清单）
- [`docs/webpack-mf-对照与缺口.md`](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/webpack-mf-对照与缺口.md) — webpack MF 逐项对照与明确不支持清单
- [`docs/沙箱边界审计.md`](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/沙箱边界审计.md) — CSS / 全局变量 / 公共依赖三维度互扰实测
- [`DESIGN.md`](https://github.com/chenmingye/fulgurjs-federation/blob/master/DESIGN.md) — 架构设计、对齐总表、测试与验收方案

## 开发与测试

```bash
# 各子项目独立安装（根目录不是 workspace）；插件需先 build，
# fixtures 经 link: 消费插件 dist，而 dist 运行时依赖就地安装在插件目录
pnpm --dir packages/plugin install && pnpm --dir packages/plugin build
for app in fixtures/host-vue fixtures/remote-a fixtures/remote-b e2e; do pnpm --dir "$app" install; done

pnpm test:unit   # 单测（369）
pnpm test:dev    # dev e2e（10）
pnpm test:prod   # prod e2e（8，需 NGINX，见 e2e/scripts/prod-setup.sh）
pnpm test        # unit + dev + prod 全跑
pnpm --dir e2e exec playwright test --project=dev --project=fault   # dev + 容错 e2e（12）
bash e2e/h7-install-test.sh   # H7 装后实测：pack → 干净目录 → dev+prod 双引擎断言
```

CI（GitHub Actions，每次推送/PR 自动运行）两个作业：

- `test`：单测 + 双口径 typecheck（pinned / latest）+ build 门禁（runtime gzip ≤ 6144B、错误码三方一致性）；
- `e2e`：fixtures e2e（dev + fault 共 12 例）× Vite 6.4.3 / 7.3.6 / 8.3.0 兼容矩阵。

prod e2e 需 NGINX，不进 CI（本地或真实项目 testbed 验证）。

## License

[MIT](./LICENSE) © chenmingye (Jason)
