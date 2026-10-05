# 6.0.0 迁移指南

> 6.0.0 完成**公共入口统一**：Vue 应用、React 应用、框架无关模块各有一个唯一入口，全部桥接与路由同步 API 并入 `/vue` 与 `/react`。本指南覆盖 5.x → 6.0.0 的全部破坏性变化，每条给出旧写法 → 新写法的对照与代码前后示例。历史版本（≤5.9.x）的更早破坏性变化（5.0.0 删除项）见文末附录。

## 一、6.0.0 破坏性变化总表

| # | 变化 | 影响 | 迁移动作 |
|---|---|---|---|
| 1 | 删除入口 `/bridge`（聚合） | 从 `/bridge` 导入 `createVueBridgeApp`/`createReactBridgeApp` 的代码报 exports 解析错误 | 分别改从 `/vue`、`/react` 导入（见下文对照） |
| 2 | 删除入口 `/bridge/vue`、`/bridge/react` | Vue/React 桥接宿主工厂导入失败 | `createVueBridgeApp` → `@fulgurjs/federation/vue`；`createReactBridgeApp` → `@fulgurjs/federation/react` |
| 3 | 删除入口 `/bridge/router/vue`、`/bridge/router/react` | URL 同步 API 导入失败 | 四个路由同步 API 全部并入 `/vue`、`/react` |
| 4 | `/runtime` 不再导出 Vue 的 `remoteComponent`、`createHostPages`、`defineBridgeApp` | 曾从 `/runtime` 导入这三个 Vue API 的代码报导入为 undefined/类型错误 | 改从 `@fulgurjs/federation/vue` 导入；`/runtime` 保持框架无关（运行时全量 + context + pages + remoteSchema，零 Vue/React/router 依赖） |
| 5 | `fulgurjs init` 参数收敛：`--template` 更名 `--out` | 旧写法仍接受但按输出路径解释并打印更名提示（后续版本移除） | 改用 `fulgurjs init --out <路径>` |

聚合 `/bridge` 在生产构建可摇树、但 **dev 原生 ESM 无摇树保证**（会同时执行两个宿主适配器）——统一入口后此问题消失：`/vue` 零 React、`/react` 零 Vue。

## 二、导入对照表（旧 → 新）

| API | 旧导入（≤5.9） | 新导入（6.0.0） |
|---|---|---|
| `federation` / `FederationOptions` | `@fulgurjs/federation` | `@fulgurjs/federation`（不变） |
| `loadRemote`/`loadShare`/`preloadRemote`/`getContainer`/`registerRemote(s)`/`registerShare`/`initSharing`/`registerPlugins`/`getRuntime`/`shareScopeMap`/`unwrapDefault`/`version`/`clearSessionState`/`parseSpec`/`getLoadedShare`/`pinLoadedShare` | `@fulgurjs/federation/runtime`（或 `/vue`、`/react` 同名） | 不变；React 应用也可统一从 `/react` 导入 |
| `provideAppContext`/`getAppContext`/`requireAppContext`/`clearAppContext` | `/runtime`（或 `/vue`、`/react`） | 不变；框架无关 |
| `definePages`/`validatePages`/`remoteSchema` | `/runtime`（或 `/vue`、`/react`） | 不变 |
| `remoteComponent`（Vue 形态） | `@fulgurjs/federation/runtime` | **`@fulgurjs/federation/vue`** |
| `createHostPages`（Vue 形态） | `@fulgurjs/federation/runtime` | **`@fulgurjs/federation/vue`** |
| `remoteComponent`/`useLoadRemote`/`RemoteErrorBoundary`/`createReactHostPages`（React） | `@fulgurjs/federation/react` | 不变 |
| `defineBridgeApp`（Vue 子应用） | 旧入口 `/runtime` 或聚合 `/bridge` | **`@fulgurjs/federation/vue`** |
| `defineBridgeApp`（React 子应用） | 旧入口 `/react` 或聚合 `/bridge` | 不变（`/react`） |
| `createVueBridgeApp` | 旧入口 `bridge/vue`（或聚合 `/bridge`） | **`@fulgurjs/federation/vue`** |
| `createReactBridgeApp` | 旧入口 `bridge/react`（或聚合 `/bridge`） | **`@fulgurjs/federation/react`** |
| `createVueBridgeNavigation`/`connectVueBridgeRouter` | 旧入口 `bridge/router/vue` | **`@fulgurjs/federation/vue`** |
| `createReactBridgeNavigation`/`createReactBridgeRouter` | 旧入口 `bridge/router/react` | **`@fulgurjs/federation/react`** |
| `RuntimePlugin`/`RemoteConfig`/`SharedHint` 等类型 | `/runtime`、包根 | 不变 |

记忆口诀：**「应用跑什么框架，就从哪个框架入口导入」**——Vue 的一切从 `/vue`，React 的一切从 `/react`，两者都要用的纯 TS 模块从 `/runtime`，Vite 配置从包根。

## 三、代码前后示例

### 3.1 Vue 子应用桥接契约

```ts
// ── 旧（5.x）──
import { defineBridgeApp } from '@fulgurjs/federation/runtime'

export default defineBridgeApp((props) => {
  const app = createApp(App, props)
  return app
})
```

```ts
// ── 新（6.0.0）──
import { defineBridgeApp } from '@fulgurjs/federation/vue'

export default defineBridgeApp((props) => {
  const app = createApp(App, props)
  return app
})
```

### 3.2 Vue 宿主挂载 React 子应用

```ts
// ── 旧（5.x）：导入自旧入口 bridge/vue（@fulgurjs/federation 包根下，6.0.0 已删除）──
import { createVueBridgeApp } from '…/bridge/vue'
const RemoteReactApp = createVueBridgeApp('react-remote/bridge', { retries: 1 })
```

```ts
// ── 新（6.0.0）──
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
const RemoteReactApp = createVueBridgeApp('react-remote/bridge', { retries: 1 })
```

### 3.3 URL 同步（Vue 宿主 + Vue 子应用两端）

```ts
// ── 旧（5.x）──（旧入口 bridge/router/vue，6.0.0 已删除）
// 宿主
import { createVueBridgeNavigation, type BridgeHostRouting } from '…/bridge/router/vue'
const navigation = createVueBridgeNavigation(router)
const routing: BridgeHostRouting = { basePath: '/approval', navigation }
// 子应用
import { connectVueBridgeRouter } from '…/bridge/router/vue'
await connectVueBridgeRouter(ctx.routing!, router, { signal: ctx.signal }).ready
```

```ts
// ── 新（6.0.0）──
// 宿主（与 createVueBridgeApp 同一入口）
import { createVueBridgeApp, createVueBridgeNavigation, type BridgeHostRouting } from '@fulgurjs/federation/vue'
const navigation = createVueBridgeNavigation(router)
const routing: BridgeHostRouting = { basePath: '/approval', navigation }
// 子应用（与 defineBridgeApp 同一入口）
import { defineBridgeApp, connectVueBridgeRouter } from '@fulgurjs/federation/vue'
await connectVueBridgeRouter(ctx.routing!, router, { signal: ctx.signal }).ready
```

### 3.4 React 宿主 URL 同步

```tsx
// ── 旧（5.x）──（旧入口 bridge/react 与 bridge/router/react，6.0.0 已删除）
import { createReactBridgeApp } from '…/bridge/react'
import { createReactBridgeNavigation, createReactBridgeRouter } from '…/bridge/router/react'
```

```tsx
// ── 新（6.0.0）──
import {
  createReactBridgeApp,
  createReactBridgeNavigation,
  createReactBridgeRouter,
  defineBridgeApp,
} from '@fulgurjs/federation/react'
```

### 3.5 Vue 宿主逐页接入（`/runtime` 的 Vue API 迁出）

```ts
// ── 旧（5.x）──
import { createHostPages, remoteComponent } from '@fulgurjs/federation/runtime'
```

```ts
// ── 新（6.0.0）──
import { createHostPages, remoteComponent } from '@fulgurjs/federation/vue'
```

### 3.6 纯 TS 模块（无迁移）

```ts
// 旧与新完全一致：框架无关代码始终从 /runtime 导入
import { loadRemote, loadShare } from '@fulgurjs/federation/runtime'
```

## 四、迁移步骤（机械替换即可完成）

1. **全局搜索旧子路径**：在源码里搜 `bridge/vue`、`bridge/react`、`bridge/router/vue`、`bridge/router/react`、`/bridge'` 等旧入口引用——6.0.0 的包已删除这些 exports，构建会直接报错指出每一处；
2. **按第二节对照表逐条改 import**：`/bridge/vue`、`/bridge/react`、`/bridge/router/vue`、`/bridge/router/react` 的内容分别并入 `/vue`、`/react`；同一文件多种桥接 API 会合并成一个 import 语句；
3. **检查 `/runtime` 导入面**：从 `/runtime` 导入 `remoteComponent`/`createHostPages`/`defineBridgeApp` 的（Vue 专属 API），改从 `/vue` 导入；`/runtime` 其余导出不变；
4. **TS 诊断收尾**：对改动文件跑 `vue-tsc --noEmit`/`tsc --noEmit`，确认无 `Failed to resolve import`/ts(2307)；IDE 报 ts(2307) 时先 `Restart TS Server` 清 TS 服务缓存；
5. **dev 验证请求图**：桥接宿主的 dev 首屏不再加载对方框架适配器（`/vue` 宿主零 React 执行，反之亦然）；
6. **`fulgurjs init --template` 调用方**：改用 `--out`（旧名仍可用但会打印更名提示）。

## 五、从其他微前端方案接入（概念映射）

从 qiankun 类方案迁入时的 API 级概念对应（通用技术结论，与具体业务无关）：

| 旧方案概念 | @fulgurjs/federation 对应 |
|---|---|
| 主应用 registerMicroApps | 宿主 `federation({ remotes })` |
| 子应用 entry（HTML） | remote entry（dev: `@fulgurjs-entry.js` 中间件 / prod: `fulgurjs-remoteEntry.js`） |
| 子应用生命周期 mount/unmount | 页面级 exposes（组件即入口，无生命周期样板）；启动期初始化 = 远程 `federation({ setup })`（setup/onSession）；整应用嵌入 = 桥接契约的 `mount`/`unmount`（`defineBridgeApp`） |
| window 隔离/沙箱 | 无沙箱：同 realm 直渲染（结论与边界见[沙箱边界审计](../maintainers/沙箱边界审计.md)） |
| props 传递 | 组件 props（组件级）；`appProps`（桥接级，挂载快照语义）；AppContext（跨应用上下文） |
| 公共依赖 externals | `shared`（singleton 协商，"已加载优先"） |
| qiankun 运行时 + single-spa | `@fulgurjs/federation/runtime`（运行时内核 20KB 级，无 single-spa） |

## 六、页面卸载清理清单

乾坤的 `unmount` 会强制子应用清理 window 级资源；联邦**组件级**卸载不会自动清——以下资源必须在页面组件 `onUnmounted`（React 用 effect cleanup）里自行摘除，否则切走再切回会重复注册/重复触发：

| 资源 | 清理方式 |
|---|---|
| `getAppContext().events.<前缀>.xxx = fn` 反向注册 | 卸载时删除该属性（比对函数引用后 delete） |
| `window.addEventListener(...)` | 记住函数引用，卸载时 `removeEventListener` |
| `setInterval` / `setTimeout` | 卸载时 `clearInterval` / `clearTimeout` |
| 自挂的其他全局键 | 同理显式删除 |

```ts
import { onUnmounted } from 'vue'
import { getAppContext } from '@fulgurjs/federation/vue'

const onHostEvent = (e: unknown) => { /* ... */ }
getAppContext().events!.bpm = { onHostEvent }
onUnmounted(() => {
  const events = getAppContext().events
  if (events?.bpm?.onHostEvent === onHostEvent) delete events.bpm.onHostEvent
})
```

> 轻量提醒而非插件机制：绝大多数页面只有数据请求（随组件销毁自然结束），无需任何清理；有全局副作用的页面按清单逐项过一遍即可。桥接挂载的完整子应用由契约 `unmount` 负责容器级清理；unmount 抛错会导致该容器被持久封锁（只能整页刷新），子应用清理逻辑务必健壮。

## 七、首次使用避坑清单（通用工程问题）

| # | 坑 | 症状 | 解法 |
|---|-----|------|------|
| 1 | 插件升级后未清 `.vite` | 页面渲染回旧逻辑 / 门面签名漂移 404（DEV-009） | `rm -rf node_modules/.vite` + 重启 dev + 换浏览器 profile |
| 2 | pnpm 装 tarball 软链断链 | `Cannot find module '@fulgurjs/federation'` | 重新安装并验证目录可达 |
| 3 | UMD/CJS 依赖被移出预构建 | dev 裸 CJS 白屏、`Cannot destructure property 'node'`（DEV-004） | 放回 `optimizeDeps.include`（插件自动外部化 shared 键） |
| 4 | 给 shared 依赖加 ESM 别名 | 构建期 `xxx.default.extend is not a function` | **build 必删**（prod rollup 双重 interop）；dev 侧若该依赖已移出预构建，其 CJS 子路径需 dev 专用别名兜住（`command==='serve'` 才注入） |
| 5 | 登录异步链未完成就断言 | e2e 偶发被弹回登录页 | 等「登录表单消失」而非固定秒数；慢链留足超时 |
| 6 | 多版本组件库 CSS | 后加载覆盖 `:root` 变量 | 主流版本变量一致则无感；升级时留意 |
| 7 | 后端缺端点 | 404/401 资源报错 | 代理/NGINX 层加诚实空响应垫片（不伪造业务数据） |
| 8 | 远程页面（exposes 目标文件）静态导入运行时 | 担心双实例 | 直接静态导入即可——插件自动改写为惰性单例代理，远程与宿主写法完全一致 |

## 附录：5.0.0 删除的旧 API（跨版本升级者查阅）

5.0.0 是有意的破坏性清理。旧 API 传入时一律得到中文的「当前值 → 原因 → 迁移写法」错误，不会被静默接受：

| 已删除（5.0.0） | 替代写法 |
|---|---|
| `@fulgurjs/federation/config` 子路径（`defineRepoConfig` / `loadRepoConfig` / `federationOptionsForApp` / `RepoConfig` 等聚合类型） | 每个应用根目录一份 `fulgurjs.config.ts`，默认导出直接 `satisfies FederationOptions`；`host.pages`/`remotePrefixes`/`deriveSpec` 改具名导出 `hostPages` |
| CLI `--app <应用名>`（聚合配置选择器） | 在各应用根目录直接运行 `fulgurjs explain` / `fulgurjs check-pages`；传 `--app` 会报中文错误 |
| check-pages 旧聚合形态的本地 dist 回退 | `--manifest <远程>=<路径\|URL>` 或 `--site <URL>`（显式来源失败如实报「无法验证」，不假装通过） |
| `federation()` 选项：`remoteType`、`library`、`automaticAsyncBoundary`、`dataPrefetch`、`usedExports`、`ignoreUnusedSharedExports` | 直接删除该字段：remoteEntry 恒为 ESM、TLA 异步边界恒开、tree-shaking 由打包器原生完成；需要预载时运行时调用 `preloadRemote()`（`/runtime` 导出）。传入任何值（含历史合法值）报 `CFG-011` |
| 旧「expose 启动器 + 宿主手动调用」初始化范式 | `federation({ setup })`：默认导出 `setup(context)` 应用级一次 + 具名导出 `onSession(context)` 会话级去重 |

版本历史的完整变更记录见 [CHANGELOG](../../CHANGELOG.md)。
