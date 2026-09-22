# @fulgurjs/federation

> **fulgurjs** — 拉丁语「闪电 · 辉光」。
> 一个把 Vite 模块联邦做到开箱即用的插件：**一套配置，dev / prod 双引擎，语义对齐 Webpack Module Federation**。

![tests](https://img.shields.io/badge/tests-173%20%2B%20e2e-green) ![runtime](https://img.shields.io/badge/runtime%20gzip-%3C%205KB-blue) ![vite](https://img.shields.io/badge/vite-5%20%7C%206%20%7C%207%20%7C%208-purple)

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

**真实工程验证**：某企业级 mes 系统（admin 宿主 + bpm/lowcode 两个子应用，21+6 页）已全量迁移——27 页双环境（dev 双 server / prod NGINX）控制台零报错，逐页写操作闭环（新增/编辑/删除/发布/导入导出/审批流）与原 qiankun 版本逐项一致，首用者从零接线全程有文档可依（见[迁移指南](#文档)）。

## 特性

- **exposes / remotes / shared 全语义**：`name@url` 语法、键重命名、promise-based remote、semver 全语法 requiredVersion、版本协商（最高版本胜出）、singleton / strictVersion、已加载版本永不替换、多版本共存、shareKey 重定向、多 shareScope
- **UMD / CJS-only 依赖开箱即用**：element-plus、avue 等只有 UMD/CJS 产物的依赖直接进 `optimizeDeps.include` 即可——dev 期插件自动把预构建产物内的 shared 键改道协商门面；build 期自动把 CJS `require(<shared>)` 重定向到垫片，双运行时免疫
- **自动异步边界**：top-level await 自动注入（es2022+），无需 webpack 式手工 `import('./bootstrap')`
- **稳定产物**：remoteEntry 固定文件名利于 CDN 长缓存；`fulgurjs-manifest.json` 资源清单；expose 独立 chunk
- **容错（对齐 webpack MF 2.0 errorLoadRemote）**：加载重试 / 熔断 / 超时内置；`loadRemote(spec, { retries, fallbackModule })` 单次调用级覆盖——失败时返回 fallback 模块，错误事件仍显式发出（**绝不静默兜底**，不传则照旧抛错）
- **增强能力**：dts 类型直连（dev 补全直达 remote 源码）、`preloadRemote()` manifest 驱动精确预载、runtimePlugins 钩子
- **HMR 全链路**：remote 改动 → host 页面热更，L1 组件热替换 / L2 状态保留 / L3 错误覆盖与恢复
- **零报错纪律**：配置问题启动瞬间三段式报错；联邦失败显式抛错（错误码 + 可执行修复建议），**无任何静默兜底路径**
- **CLI（主包内置 bin）**：`fulgurjs init`——`fulgurjs.config.ts` 单配置驱动的迁移生成器（模板 = 真实工程验证形态：vite 配置/路由表/桥/联邦启动器/NGINX conf 全量编码，锚点补丁幂等可续跑）；`fulgurjs doctor`——部署面体检（remoteEntry/manifest/HTML 缓存头与形态、CORS、chunk 抽样可达、版本 skew 预演、`--dev` 端口探测）
- **跨应用传值与方法引用**：`@fulgurjs/federation/context` 子路径——`provideAppContext` / `getAppContext` / `requireAppContext`（缺键 `CC-001` 三段式、独立直开远程页 `CC-002` 显式）。宿主桥一次写入页面级单例（user/token/getToken/store/hostApp/locale/events 标准字段 + 项目扩展位），远程 boot 显式校验消费；方法引用两条通道 = context 携带函数引用（热路径直调）+ exposes 方法模块 `loadRemote('remote/api')`（低频重逻辑）。数据语义 = 传输层快照 + 函数引用，非响应式（与乾坤 props 同语义；"实时"靠函数引用拉取 / 宿主 pinia 共享 / 登录刷新三通道）
- **Vue 直渲染**：`remoteComponent('remote/X')`（`@fulgurjs/federation/vue` 子路径）——`defineAsyncComponent + loadRemote` 的标准封装，加载失败显式错误占位（错误码+根因+修法），runtime.js 零框架依赖零体积增量
- **CSP 友好**：原生 ESM 加载路径全程无 `eval` / `new Function`，可在严格 CSP（无 `unsafe-eval`）下运行
- **全链路错误码体系（30 码）**：CFG/DEV/BLD/MFU/CC 五段 + 手册 §8 码表防漂移校验

## 安装

```bash
pnpm add -D @fulgurjs/federation
```

要求：Vite ≥ 5.1（实测至 8.x）、Node ≥ 18、Vue 3、浏览器 Chrome 108+（TLA 原生支持）。

## 快速开始

### Remote（提供方）

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'remote-a',
      exposes: {
        './Button': './src/components/Button.vue',
        './utils': './src/utils/index.ts',
      },
      shared: {
        vue: { singleton: true },
      },
    }),
  ],
})
```

### Host（消费方）

```ts
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'my-host',
      remotes: {
        // 一个地址，dev/prod 自动切换；也可拆开写 { dev, prod }
        'remote-a': 'http://localhost:5101',
      },
      shared: {
        vue: { singleton: true },
      },
    }),
  ],
})
```

### 消费远程模块

```ts
// 静态导入：直接写 remote 名/expose 名，类型补全直达源码
import Button from 'remote-a/Button'

// 动态导入 / 运行时 API
import { loadRemote, registerRemote, preloadRemote } from 'virtual:fulgurjs-runtime'

const Chart = defineAsyncComponent(() => loadRemote('remote-a/Chart').then(m => m.default))

// Vue 组件直渲染：remoteComponent = 上行的标准封装
// 加载失败显式错误占位（错误码+根因+修法），loading/错误组件可自定义
import { remoteComponent } from '@fulgurjs/federation/vue'
const ChartCard = remoteComponent('remote-a/Chart', { retries: 2 })

// 构建时地址未知的远程？运行时注册（对齐 webpack promise remote 语义）
registerRemote({ name: 'shop', entry: await (await fetch('/api/remote-url')).text() })
await preloadRemote('shop') // 按 manifest 精确预载 chunk + CSS

// 远程可能部署不稳定？显式 fallback 模块 + 单次调用重试覆盖
// （失败时错误事件仍会发出，但返回 fallback 组件而非抛错）
const Panel = await loadRemote('shop/Panel', {
  retries: 3,
  fallbackModule: () => import('./PanelFallback.vue'),
})
```

> **在任何文件都可以直接这样导入**——包括 exposes 目标文件（远程页面）。远程页面里的该导入会被
> 插件自动改写为惰性单例委托：求值期零副作用、调用期转发页面级运行时单例，无需关心宿主/远程的区别。

> 以上只是最小面。**全部选项（remotes 四形态/shared 九个开关/dts/runtimePlugins…）、运行时 API、CLI、错误码见下方 [API 参考](#api-参考)。**

**没有别的步骤了。** dev 下 remote 跑它自己的 `vite dev`（容器入口 `/@fulgurjs-entry.js` 由插件中间件直出）；build 下 expose 自动拆独立 chunk、shared 自动剥离——同一份配置两端通用。

## CLI：init 起步模板 + doctor 部署体检

```bash
# 1) 生成带注释的 fulgurjs.config.ts 起步模板（宿主/远程/页面路由表/部署形态，单文件可入库）
npx fulgurjs init                                # 已存在则拒绝，--force 覆盖
# 样例：examples/fulgurjs.config.example.ts（通用字段示例）

# 2) 校验配置并输出可直接粘贴的样板：各应用 federation() 块、NGINX no-cache 站点模板、接入核对清单
npx fulgurjs init --config fulgurjs.config.ts

# 3) 部署体检（CI 可嵌）：缓存头/资源形态/CORS/chunk 可达/版本 skew
npx fulgurjs doctor --base http://your-site --apps app-a,app-b
npx fulgurjs doctor --base http://localhost:5173 --apps app-a --dev
```

**插件保持项目无关**：init 不改写任何项目文件，不内置任何具体项目的模板或补丁；权限路由、
远程启动器等项目集成细节由各项目按 init 输出的通用核对清单自行落地。

## API 参考

以下覆盖插件的全部公开 API，签名与默认值与源码一致——**本 README 为唯一权威文档**。

### 1. `federation(options)` — Vite 插件（宿主/远程同一份 API）

```ts
import { federation } from '@fulgurjs/federation'
```

#### 全部选项

| 选项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `name` | `string` **必填** | — | 容器名。同页面宿主/远程必须唯一（也是 uniqueName）；须匹配 `/^[a-zA-Z][\w.-]*$/` |
| `filename` | `string` | `'fulgurjs-remoteEntry.js'` | prod 容器入口文件名（固定文件名，CDN 可长缓存） |
| `exposes` | `Record<string, string \| { import: string; name?: string }>` | — | 对外暴露模块：键 `'./X'`，值源文件路径；`name` 为稳定 chunk 文件名 |
| `remotes` | `Record<string, string \| RemoteEntryConfig \| (() => Promise<any>)>` | — | 消费的远程，三种形态见下表 |
| `shared` | `string[] \| Record<string, string \| SharedHint>` | — | 共享依赖；字符串简写 = requiredVersion（缺省从本应用 package.json 推断） |
| `shareScope` | `string` | `'default'` | 默认共享作用域名 |
| `remoteType` | `string` | `'module'` | 仅支持 `'module'`（传其它值告警并回落） |
| `library` | `{ type?: string }` | — | 仅接受 esm/module（webpack 宿主 interop 尚未支持，告警） |
| `runtime` | `string \| false` | 内置运行时 | 自定义运行时模块路径；`false` 禁用内置运行时 |
| `runtimeChunk` | `boolean \| 'single'` | — | 运行时是否拆独立 chunk |
| `manifest` | `boolean` | `true` | prod 构建生成 `fulgurjs-manifest.json`（preloadRemote 依赖它） |
| `runtimePlugins` | `string[]` | `[]` | 运行时插件模块路径列表（写法见「运行时插件」） |
| `dts` | `boolean \| { dir?: string; mode?: 'source' \| 'shim' }` | `true` | dev 下拉取远程 manifest 生成类型声明——宿主写 `import X from 'remote-a/X'` 获得类型。**产物写入 `src/fulgurjs/types/`（联邦产物集中一个文件夹；无 src 布局回退 `.fulgurjs/types`）**，src 布局项目 tsconfig 零配置即生效；`{ dir }` 自定义位置；`mode: 'source'`（默认）跨工程源码直连（补全/跳转直达远程源码，VSCode 打开生成物可能显示工程外文件诊断）；`mode: 'shim'` 宽松占位（不引用源文件，IDE 全程干净，无源码级补全——见 §9.1.5） |
| `devSharedSelf` | `boolean` | 纯远程 `true`；有 `remotes` 的宿主 `false` | dev 下自身源码（含依赖）是否参与 shared 协商改写。**双向联邦**（既 expose 又消费 remote）的宿主/远程需显式 `true`，否则 prod 双 vue 实例 |
| `automaticAsyncBoundary` | — | 恒为 `true` | 接受任意值：TLA 自动异步边界，无需手工 bootstrap |
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
    timeout: 15000,            // 加载超时 ms
    retries: 2,                // 失败重试次数
    fallback: ['http://backup/remote-b'],  // 备用 remoteEntry，依次尝试
    breaker: { threshold: 5, resetMs: 30000 }, // 连续失败熔断
  },
  // ④ 函数：promise-based remote（构建时地址未知；等价 webpack "promise new Promise"，
  //    需在运行时配合 registerRemote 注册，见下文运行时 API）
  'remote-c': () => fetch('/api/remote-url').then(r => r.text()),
}
```

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

版本裁决语义对齐 webpack：满足 requiredVersion 的最高版本胜出；已加载版本永不替换；singleton 收敛到唯一实例（skew 告警 MFU-010）；strictVersion 不满足抛 MFU-003。

### 2. 运行时 API — `virtual:fulgurjs-runtime`

**任何文件都直接静态导入**——宿主页面、exposes 目标文件（远程页面）都一样，插件自动保证同一页面只有一个运行时实例（远程页面里的导入会被自动改写为惰性单例委托）：

```ts
// 宿主页面、远程页面，写法完全一致
import { loadRemote } from 'virtual:fulgurjs-runtime'
```

> 仍可绕过代理直取全局单例（等价，调试用）：`(globalThis as any).__FULGURJS_RUNTIME__`。

#### 函数总表

> **TS 提示**：`virtual:fulgurjs-runtime` 的类型随包发布。dev 启动时插件自动在类型目录（默认 `src/fulgurjs/types/`，联邦产物集中一个文件夹）生成远程模块声明与运行时类型垫片——src 布局项目零配置即全量生效；手工方式则在 tsconfig `compilerOptions.types` 加 `"@fulgurjs/federation/client"`。

| 函数 | 签名 | 说明 |
|---|---|---|
| `loadRemote` | `(spec: string, opts?) => Promise<模块命名空间>` | 加载远程模块。`spec = '远程名/./Expose键'`（`./` 可省）；opts 见下 |
| `loadShare` | `(name: string, opts?) => Promise<命名空间>` | 共享模块协商（最高版本胜出/已加载优先/singleton 收敛）。opts：`{ requiredVersion?, singleton?, strictVersion?, shareKey?, shareScope?, fallback? }` |
| `preloadRemote` | `(spec: string, opts?: { mode?: 'preload' \| 'prefetch' }) => Promise<void>` | 按 manifest 精确预载该远程全部 expose chunk + CSS（prefetch = 空闲时低优先级） |
| `getContainer` | `(name: string) => Promise<容器>` | 取远程容器（触发加载 + init），容器协议 `{ name, init, get }` |
| `registerRemote` / `registerRemotes` | `(config \| list) => void` | 运行时注册远程（promise remote / 动态地址）。`RemoteInput`：`{ name, entry, shareScope?, timeout?, retries?, fallback?, breaker? }` |
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

#### 运行时插件（`runtimePlugins: ['./src/fulgurjsPlugin.ts']`）

```ts
import type { RuntimePlugin } from 'virtual:fulgurjs-runtime'

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
| `window.__FULGURJS_INFO__` | `{ remotes: { [名]: { entry, status, lastLoadMs, error } }, errors: [] }` |
| `window.__FULGURJS_APP_CONFIG__` | W4 全局配置镜像 |
| `window` 事件 `fulgurjs:error` | `CustomEvent<{ remote, error }>`，所有远程加载/共享错误都会发出 |

### 3. `definePages` — 宿主页面路由表（`@fulgurjs/federation/pages`）

宿主把「URL 路径 → 远程 exposes 键」的映射表交给它校验，带参路由的静默冲突在启动期报错而不是运行时加载错组件：

```ts
import { definePages } from '@fulgurjs/federation/pages'
import remoteSchema from 'virtual:fulgurjs-remote-schema' // dev 自动生成；build 恒为空（诚实降级）

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

### 4. `fulgurjs.config.ts` — CLI 单配置文件（`@fulgurjs/federation/config`）

```ts
import { defineRepoConfig } from '@fulgurjs/federation/config'

export default defineRepoConfig({
  root: process.cwd(),            // 工程根（monorepo 根或单应用仓库根）
  apps: [
    {
      path: 'apps/host',          // 相对 root 的应用目录
      name: 'host-app',           // 联邦容器名
      port: 5173,                 // dev 端口
      base: '/',                  // 部署/dev 的 URL 前缀
      deployDir: 'main',          // 部署目录名（缺省取 base 去斜杠）
      host: {
        remotePrefixes: { '/remote-a/': 'remote-a' },
        remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
        pages: [{ route: '/remote-a/home', name: 'RemoteAHome', spec?: 'pages/remote-a/home', title: '首页' }],
      },
      remote: {                   // 该应用同时是远程时（双向联邦）
        exposes: { './pages/remote-a/home': './src/views/Home.vue' },
        remotes: { /* 反向消费 */ },
      },
      shared: { vue: { singleton: true } },
    },
  ],
  deploy: { webRoot: '/var/www/your-site', listen: 8080 }, // 仅供 init 输出 NGINX 样板
})
```

### 5. CLI 命令参考

| 命令 | 说明 |
|---|---|
| `fulgurjs init` | 在当前目录生成带注释的 `fulgurjs.config.ts` 起步模板；`--template <path>` 指定输出路径；已存在拒绝覆盖，`--force` 强制 |
| `fulgurjs init --config <path>` | 校验配置（CFG 三段式报错）+ 输出各应用 `federation()` 粘贴块、NGINX no-cache 站点模板、8 条通用核对清单 |
| `fulgurjs doctor --base <URL> --apps <a,b,c>` | 部署体检：remoteEntry/manifest/index.html 的 200/no-cache/JS 形态、CORS、chunk 抽样可达、版本 skew 预演。`--dev` 检查 dev 容器入口；`--json` 输出 JSON（CI 断言）；`--chunk-sample N` 控制抽样数（默认 16）。**退出码：有 FAIL 即 1**，可直接做 CI 门禁 |

### 6. 错误码总表（30 个）

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
| DEV 开发期 | `DEV-001` | remote dev server 不可达（manifest 拉取失败） |
| | `DEV-002` | remote dev manifest 为空或格式不识别 |
| | `DEV-004` | 已知 UMD-only 依赖不在 optimizeDeps.include（预构建内联本地 vue 风险） |
| | `DEV-005` | remotes dev URL 端口无监听 |
| | `DEV-006` | 宿主/远程插件版本不一致 |
| | `DEV-009` | 门面/虚拟模块 404（.vite 缓存漂移，需清缓存重启） |
| | `DEV-010` | dev 冷启动预构建窗口提示（首轮 30~60s 瞬态，非故障） |
| BLD 构建期 | `BLD-001` | expose 源文件解析失败 |
| | `BLD-002` | 构建目标低于 es2022（TLA 需要） |
| | `BLD-003` | expose 目标组件含必填 props（文档化核对项） |
| MFU 运行时 | `MFU-001` | 远程容器/模块加载失败（网络/超时/重试耗尽/熔断） |
| | `MFU-002` | remoteEntry 自报名与配置名不一致 |
| | `MFU-003` | strictVersion 版本不满足 |
| | `MFU-004` | 共享模块缺失且无本地 fallback |
| | `MFU-005` | 同一容器用不同 share scope 重复 init |
| | `MFU-006` | 请求的模块未被该远程 exposes |
| | `MFU-007` | 预加载失败（不阻断业务） |
| | `MFU-008` | 未知远程 |
| | `MFU-009` | 加载到的模块没有任何导出 |
| | `MFU-010` | singleton 共享版本漂移（使用作用域版本，告警） |
| CC 跨应用上下文 | `CC-001` | AppContext 必需字段缺失（三段式：got/expected/example，修法指向宿主桥 `provideAppContext`） |
| | `CC-002` | 运行时单例不可用（独立直开远程页；修法 = 经宿主联邦加载，时序契约 bridge → federatedBoot → loadRemote） |

错误排查三段式文案见「配置出错？报错看得懂」一节（下文）；`fulgurjs doctor` 可提前把部署面的 MFU-001 类问题拦在上线前。

### 7. 产物与端点约定

| 环境 | 路径 | 说明 |
|---|---|---|
| dev | `/<base>/@fulgurjs-entry.js` | 远程容器入口（插件中间件直出，自包含） |
| dev | `/<base>/@fulgurjs-manifest.json` | dev manifest（宿主 dts / preloadRemote 消费） |
| prod | `/<base>/fulgurjs-remoteEntry.js` | 固定文件名容器入口（内容每次构建变——**必须 no-cache**） |
| prod | `/<base>/fulgurjs-manifest.json` | expose chunk/CSS 清单（preloadRemote 消费，**no-cache**） |

NGINX 部署模板（no-cache 规则 + 深链回退）用 `fulgurjs init --config` 自动生成。

### 8. `remoteComponent` — Vue 远程组件直渲染（`@fulgurjs/federation/vue`）

```ts
import { remoteComponent } from '@fulgurjs/federation/vue'

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
- `vue` 为**可选 peerDependency**（`peerDependenciesMeta.optional`）：仅使用 `./vue` 子路径时才需要安装 Vue；runtime.js 保持框架无关（不 import vue），体积零增量；
- 运行时实例经 `globalThis.__FULGURJS_RUNTIME__` 页面级单例复用，与 `virtual:fulgurjs-runtime` 的导入殊途同归，无需额外接线。

### 9. `AppContext` — 跨应用传值与方法引用（`@fulgurjs/federation/context`）

宿主向子应用传值、子应用向宿主反向注册方法，一律走这条一等公民通道（对标乾坤 `props`，但带类型与错误契约）——不再各自挂 `window.*` 裸口子。

```ts
// —— 宿主桥（host/src/fulgurjs/host/bridge.ts）：登录完成后一次性提供 ——
import { provideAppContext } from '@fulgurjs/federation/context'

provideAppContext({
  user,                                  // 宿主登录用户原始形态
  getToken,                              // 取最新 token（拉取式防过期）
  store: piniaInstance,                  // 宿主 pinia：子应用 useUserStore(ctx.store) 共享响应式状态
  hostApp: app,                          // 宿主 Vue App 实例：全局组件/指令注册目标
  locale,                                // EP locale 等 UI 配置
  events: { main: mainEvents },          // 事件/方法池：宿主提供 main；子应用反向注册 bpm.* / lowcode.*
  // 只传有真实消费的键。项目自定义键经扩展位按需自行提供（如 baseUrl: '/demo'）
})

// —— 远程 boot（exposes/federatedBoot.ts）：显式校验消费 ——
import { requireAppContext } from '@fulgurjs/federation/context'

const { store, user, hostApp } = requireAppContext('store', 'user', 'hostApp')
// 缺任一键 → [fulgurjs:CC-001] 三段式抛错（got / expected / example 指向宿主桥）；
// 页面无运行时单例（独立直开远程页）→ [fulgurjs:CC-002] 显式，修法 = 经宿主联邦加载。

// —— 远程页面读点 ——
import { getAppContext } from '@fulgurjs/federation/context'
const dict = getAppContext().events?.main?.getDictItems?.('sex')

// —— 子应用反向注册方法给宿主（页面 onUnmounted 时记得摘除，见迁移指南「页面卸载清理清单」）——
getAppContext().events!.bpm = { formEvent, formSubmitEvent }
```

标准字段表：

| 字段 | 类型 | 语义 | 写方 |
|---|---|---|---|
| `user` | `Record<string, any>` | 宿主登录用户原始形态 | 宿主桥（只读约定） |
| `getToken` | `() => string \| undefined` | **取最新 token**（拉取式调用，永不过期；context 不提供一次性 token 快照字段） | 宿主桥（只读约定） |
| `store` | `unknown`（运行时为宿主 pinia） | 子应用挂载/读取宿主共享响应式状态 | 宿主桥（只读约定） |
| `hostApp` | Vue App 实例（同 realm 直引用） | 全局组件/指令注册目标 | 宿主桥（只读约定） |
| `locale` | `unknown` | EP locale 等 UI 配置 | 宿主桥（只读约定） |
| `events` | `Record<string, any>` | 事件/方法池：`events.main.*` 宿主提供、`events.bpm.*` / `events.lowcode.*` 子应用反向注册 | 宿主桥建池，子应用挂载 |
| （扩展位） | `[key: string]: unknown` | 项目自定义键（`formUrl` / `baseUrl` 等按需自行提供，模板默认不传） | 宿主桥；远程 boot 只增不改宿主键 |

变更语义与时序契约：

- `provide` = 顶层 merge（后写覆盖，幂等可多次）；约定「宿主先写标准字段，远程只增不改宿主键」；嵌套对象（如 `events`）是**引用共享**，子应用挂属性即时可见（同 realm 直引用）；
- 时序契约：**bridge（provide）→ federatedBoot（require）→ 页面 loadRemote**——违反即在 boot 处显式失败（CC-001），不静默；
- 数据语义 = **传输层快照 + 函数引用，非响应式**（与乾坤 props 同语义）。"实时"由三条正规通道承担：① `getToken()` / `events.main.*` 函数引用每次调用执行宿主最新闭包；② `context.store` 把宿主 pinia 递给子应用（共享响应式实例）；③ 登录态变更 = 重新登录 = 页面刷新 = bridge 重跑全新 context。context 本体不做 Vue reactive（runtime 框架无关 + gzip 红线 + 跨包 proxy 双份陷阱）；"中途变更需通知"的场景：等真实需求出现再设计（当前无此场景，不预留空 API）。

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

这些能力随 `fulgurjs init` 生成的模板直接带出（手工集成的项目按下述接入点自行落位），插件 runtime.js 零参与。配置面总览：

| 能力 | 配置项 | 类型 | 默认值 | 配置位置 |
|---|---|---|---|---|
| 页面保活 | `keepAlive` | `boolean` | `false` | 页面路由表条目（`src/fulgurjs/host/pages.ts`） |
| 页面加载骨架屏 | —（内置，无配置项） | — | 见下方内置参数 | `src/fulgurjs/host/pages.ts` 页面工厂 |
| 空闲预载 | `PREFETCH_REMOTES` | `string[]` | 全部 remotes 键 | `src/fulgurjs/host/bridge.ts` 顶部常量 |
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

#### 9.1.3 空闲预载 — `PREFETCH_REMOTES`

宿主桥（登录完成后）经 `requestIdleCallback` 在浏览器空闲期逐个调用 `preloadRemote(name, { mode: 'prefetch' })`，把各远程的 remoteEntry / expose chunk / CSS 以**低优先级**（`fetchPriority="low"` 的 modulepreload）预取到本地——用户首次点开子应用菜单时无需等待网络。

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `host.prefetch`（fulgurjs.config.ts，集成器项目） | `'all' \| string[] \| false` | `'all'` | `'all'` = 预载全部 remotes 键；`string[]` = 指定名单；`false` = 关闭。init 生成 bridge.ts 时注入 |
| `PREFETCH_REMOTES`（手工项目，bridge.ts 顶部常量） | `string[]` | 全部 remotes 键 | 与 vite.config `remotes` 键一致 |

```ts
// 集成器项目：fulgurjs.config.ts → apps[].host.prefetch（改后删已生成 bridge.ts 重跑 fulgurjs init）
prefetch: 'all'                  // 默认：全部 remote
prefetch: ['mes-bpm']            // 部分 remote
prefetch: false                  // 关闭

// 手工项目：src/fulgurjs/host/bridge.ts 顶部常量
const PREFETCH_REMOTES: string[] = ['mes-bpm', 'mes-lowcode'] // 默认（init 生成形态）

// 只预载部分 remote
const PREFETCH_REMOTES: string[] = ['mes-bpm']

// 关闭空闲预载：置空数组
const PREFETCH_REMOTES: string[] = []
```

行为与边界：

- 预载失败**不阻断业务**：runtime 按 MFU-007 语义发出 `window` 的 `fulgurjs:error` 事件并 console 警告（诊断面板⑤可查历史）；
- 预载仅注入 `<link rel="modulepreload">`，不执行模块——首次打开页面时才真正初始化容器；
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
- 升级插件版本后若 `import '@fulgurjs/federation/context'` 报 ts(2307)：是 IDE 的 TS 服务缓存了旧包——`Restart TS Server`（⌘⇧P）或重开窗口即可。
- **根治红波浪线**：`federation({ dts: { mode: 'shim' } })` —— 生成物不再引用跨工程源文件（宽松占位形态），IDE 全程干净；取舍是失去"跳转直达远程源码"的补全能力（默认 `source` 不变，按项目偏好选择）。

## ⚠️ 首次使用避坑指南（真实迁移项目踩坑实录）

以下每一条都在真实企业工程（qiankun → 联邦迁移，3 万模块级）中实际踩到过：

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
[fulgurjs] Invalid federation() config — remotes["remote-a"] has no address (need one of external / dev / prod)
  got:      {"dev":""}
  expected: at least one address; with only one URL it is used for both dev and prod
  example:  remotes: { 'remote-a': 'http://localhost:5101' }
  // or split: { 'remote-a': { dev: 'http://localhost:5101', prod: '/remote-a' } }
```

运行时加载失败同样给排查指引（remote dev server 未启动 / 地址配错 / CORS / NGINX 回退），并携带统一错误码：

统一错误码体系（CFG/DEV/BLD/MFU 四段共 30 个）——**完整总表见上方 [API 参考 §6](#6-错误码总表30-个)**；报错文案一律「现象 → 根因 → 修法」三段式。

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

pnpm test:unit   # 单测（188）
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
