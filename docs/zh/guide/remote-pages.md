# 远程页面接入（逐页）

> 场景：宿主有一批路由，每条路由的内容是某个远程应用 expose 的页面组件。对应 6.0.0 入口：Vue 从 `@fulgurjs/federation/vue` 导入 `definePages`/`createHostPages`/`remoteSchema`；React 从 `@fulgurjs/federation/react` 导入 `definePages`/`createReactHostPages`/`remoteSchema`。
>
> 边界先说清：**逐页接入是可选能力**。加载普通组件不需要页面表；完整子应用桥接也不逐页登记内部页面——业务菜单与业务 Router 归应用自己管理（见文末）。

## 整体结构：一份数据，两处消费

页面表是一份**纯数据模块**（如 `src/fulgurjs/host/pages.data.ts`），被两处消费：

1. 运行时：`createHostPages`/`createReactHostPages` 用它生成页面组件与解析器；
2. CLI：`fulgurjs.config.ts` 以具名导出 `hostPages` 引用同一份数据，供 `check-pages`/`explain` 核对。

唯一手工维护位置就是这份数据模块，运行时与 CLI 永远看到同一张表。

```ts
// src/fulgurjs/host/pages.data.ts —— 纯数据，不导入任何远程代码（构建期零成本）
export const remotePrefixes = { '/remote-a/': 'remote-a' }

export const pages = [
  { route: '/remote-a/home', name: 'RemoteAHome', title: '首页' },
  { route: '/remote-a/detail/:id', name: 'RemoteADetail', spec: 'pages/remote-a/detail', title: '详情' },
]
```

## ① 定义页面表：`definePages`

`definePages(pages, options?)` 在**启动期**校验「URL 路径 → 远程 exposes 键」映射，带参路由的静默冲突在启动时报错而不是运行时加载错组件：

```ts
import { definePages, remoteSchema } from '@fulgurjs/federation/vue'   // React 同名从 /react 导入

export const PAGES = definePages(
  [
    { route: '/remote-a/home', name: 'RemoteAHome', title: '首页' },
    // 带参路由：缺省推导 spec = 去首段 + 剥 :参 段；与其它条目收敛相同时 ERROR，
    // 指向独立 expose 用 spec 显式覆盖
    { route: '/remote-a/detail/:id', name: 'RemoteADetail', spec: 'pages/remote-a/detail', title: '详情' },
  ],
  {
    deriveSpec: (route) => 'pages/' + route.replace(/^\//, '').split('/').filter(s => !s.startsWith(':')).join('/'),
    remotes: { '/remote-a/': 'remote-a' },   // 路由前缀 → 远程名
    schema: remoteSchema,                    // { [remoteName]: { exposes: string[], exists?: boolean } }
    strict: true,                            // ERROR 默认 throw；false 降级 console.error
  },
)
```

`remoteSchema` 是插件 dev 期自动填充的远程 exposes 探针结果；build 恒为空表（诚实降级——构建期不知道远程 exposes，不做 R3 校验）。

校验规则（R1–R5）：

| 规则 | 级别 | 内容 |
|---|---|---|
| R1 | ERROR | 带参路由（无显式 spec）的推导 spec 与其它条目收敛相同——会静默加载错误组件 |
| R2 | WARN | 多条目有效 spec 完全相同（刻意的菜单别名可忽略） |
| R3 | ERROR | spec 不在该 remote 的 exposes 清单中（dev 有 schema 时校验；远程不可达诚实跳过） |
| R4 | ERROR | 静态路由被更靠前的带参路由遮蔽（先到先得）／路由完全重复 |
| R5 | WARN | name 重复（命名跳转歧义） |

`validatePages(pages, options?)` 是独立导出：返回违例清单不抛错，便于自测。

## ② 生成页面适配器

**Vue：`createHostPages(options)`**（`@fulgurjs/federation/vue`）：

```ts
import { createHostPages, type PageEntry } from '@fulgurjs/federation/vue'
import { pages, remotePrefixes } from './pages.data'

export const hostPagesRuntime = createHostPages({
  pages,
  remotePrefixes,                    // 必填；最长前缀匹配
  base: '/main',                     // 可选；resolve 时剥离的站点 base 前缀
  beforeLoad: () => { /* 每次页面模块实际加载前执行；宿主在此提供最新 context */ },
  loadingComponent: MySkeleton,      // 可选；缺省无骨架
  errorComponent: MyError,           // 可选；缺省 = 内置三段式错误占位
  delay: 200,                        // 可选；骨架屏延迟 ms
})
```

返回成员：

| 成员 | 说明 |
|---|---|
| `pages` | 原页面记录（不经改写，宿主路由注册直接用） |
| `resolve(path)` | `{ page, remote, spec, params } \| null`——兼容 base 前缀与深链；参数解码失败只让该次匹配失败（console 提示）不抛错 |
| `component(spec)` | 异步页面组件（`<remote>/<exposes键>` 完整 spec）；同 spec 复用；**会话感知**：`AppContext.sessionKey` 变化后自动重建组件，下一次渲染重新走 `beforeLoad → loadRemote`，触发新代次 `onSession`（模块本体经缓存复用不重复下载） |
| `keepAliveNames` | `keepAlive: true` 页面的组件名，直接绑 `<keep-alive :include>` |

行为契约：

- 页面表经 `definePages` 校验（R1–R5），与独立使用行为一致；
- `remotePrefixes` **最长前缀优先**；页面路由无匹配前缀在创建期即报错（fail fast）；
- 组件是本地包装组件（稳定 name 供 KeepAlive 匹配），不修改远程模块导出的组件对象；attrs/slots 全量透传；
- 加载顺序：`beforeLoad` → 远程可选 `setup`/`onSession` → 页面模块；失败进错误态（显式错误码/根因/修法），不静默回退；
- 页面级保活：页面条目加 `keepAlive: true`（默认关，缓存上限 max=8 LRU）；保活页若有 window 级监听/定时器/context 反向注册，须在组件内自行清理（保活页只在被 LRU 淘汰时才 unmount）。

**React：`createReactHostPages(options)`**（`@fulgurjs/federation/react`）：

```tsx
import { createReactHostPages } from '@fulgurjs/federation/react'
import { pages, remotePrefixes } from './pages.data'

const hostPages = createReactHostPages({
  pages,
  remotePrefixes,
  // 数据项（pages/remotePrefixes/deriveSpec/schema/strict/base）与 Vue 完全一致
  fallback: <Spinner />,             // 展示项与 remoteComponent 语义一致
  error: (err, retry) => <ErrorBox error={err} onRetry={retry} />,
  beforeLoad: () => { /* 每次实际加载尝试前执行，供宿主刷新 context；页面表创建时不执行 */ },
})

// 路由层自己创建（插件不提供 Router）：React Router 7 示例
// <Route path="/remote-a/home" element={createElement(hostPages.component('pages/remote-a/home'))} />
// 带参路由经 useParams/useSearchParams 取参后作 props 传给 component(spec) 产物
```

- 与 Vue 侧共用同一份页面表数据与 `definePages` R1–R5 校验；`resolve(path)` 行为一致（base 剥离、最长前缀、参数解码、query/hash、无匹配返回 `null`）；
- `component(spec)` 返回 React 组件类型，路由层用 JSX/`createElement` 渲染（不提供 `.element()` 同义入口）；
- 组件缓存按 spec 与登录代次复用；**仅新的非空 `sessionKey` 到来时重建**（登出变 `undefined` 不重建）；不提供 `keepAliveNames`（不承诺保活）。

## ③ 把页面表交给 CLI：`hostPages` 具名导出

在 `fulgurjs.config.ts` 里以具名导出引用同一份数据模块（这不是 `federation()` 的参数，仅供 CLI 读取）：

```ts
import type { FederationOptions } from '@fulgurjs/federation'
import { pages, remotePrefixes } from './src/fulgurjs/host/pages.data'

export default {
  name: 'demo-host',
  remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions

// ── 以下具名导出仅供 CLI explain/check-pages 读取 ──
export const hostPages = { pages, remotePrefixes }
```

然后核对页面契约：

```bash
npx fulgurjs check-pages --site https://your-site
# 或显式指定每个远程的 manifest 来源（可多次）：
npx fulgurjs check-pages --manifest remote-a=./dist/remote-a/fulgurjs-manifest.json
npx fulgurjs check-pages --manifest remote-a=https://cdn.example.com/remote-a/fulgurjs-manifest.json
```

- 核对内容：宿主页面表 ↔ 远程 manifest exposes；报告未知 remote、映射到未消费远程、缺失 expose、路由冲突（R1–R5）；
- manifest 来源优先级：`--manifest`（可多次、文件路径或 URL）> `--site`/消费方 prod 地址推导；**显式来源失败不回退**（无本地 dist 兜底），输出每个 remote 的实际命中来源，防止旧本地 dist 冒充线上核对；
- **未配置 hostPages 的工程运行 check-pages 会明确提示不适用**，不产出伪核对；远程不可达报「无法验证」；
- 退出码：确定性错误为 1；`--require-verified` 时无法验证也非零（CI 严格模式，避免 0 条核对显示通过）；`--json` 供 CI。

## 业务菜单与业务 Router 归应用自己管理

这条边界决定「要不要用页面表」：

| 接入形态 | 页面表/hostPages/check-pages | 路由归谁 |
|---|---|---|
| 加载普通组件/模块（`remoteComponent`/`loadRemote`） | 不需要 | 应用自己 |
| 逐页接入（宿主路由表 → 远程页面） | **需要**（本文） | 宿主持有路由表，逐条映射到远程 expose |
| 完整子应用桥接（`createVueBridgeApp`/`createReactBridgeApp`） | **不需要** | 子应用保留自己的 Router 与业务菜单；宿主只配挂载前缀（`basePath`）与入口，见[子应用桥接](app-bridge.md)与[URL 同步](url-sync.md) |

判断口径：远程是一个**页面集合**（宿主要逐条控制菜单与路由）→ 逐页接入；远程是一个**完整应用**（自带导航/路由/store）→ 桥接，且**不逐页登记它的内部页面**——桥接模式下 `check-pages` 不是必经步骤。

完整可运行示例：[examples/demos/pages-cli](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/pages-cli)（Vue，覆盖 definePages/createHostPages/remoteSchema/requireAppContext 与全 CLI 命令）。
