# 同框架完整子应用桥接（examples/demos/same-frame）

Vue 套 Vue、React 套 React 的「应用级桥接」完整演示（README §8.2 `/bridge` API 的同框架形态）。
每个子应用是一个**自带路由与状态、可整站挂载/卸载**的完整业务系统（工单中心），
每个宿主以三页对照呈现「组件级联邦 vs 应用级桥接」的差异与各自适用场景。

四个工程互相独立：依赖从 npm registry 安装正式包（`@fulgurjs/federation` 精确 `6.1.9` + lockfile），
不使用 workspace / file: / link: 引用。

| 工程 | 角色 | 端口 | 容器名 |
|---|---|---|---|
| [vue-remote](vue-remote) | Vue 子应用（先启动） | **5323** | `sf-vue-remote` |
| [vue-host](vue-host) | Vue 宿主 | **5324** | `sf-vue-host` |
| [react-remote](react-remote) | React 子应用（先启动） | **5325** | `sf-react-remote` |
| [react-host](react-host) | React 宿主 | **5326** | `sf-react-host` |

## 快速开始

```bash
# Vue 对：先远程后宿主
cd vue-remote && npm install && npm run dev   # 终端 1：http://localhost:5323
cd vue-host   && npm install && npm run dev   # 终端 2：http://localhost:5324

# React 对：先远程后宿主
cd react-remote && npm install && npm run dev # 终端 3：http://localhost:5325
cd react-host   && npm install && npm run dev # 终端 4：http://localhost:5326
```

打开宿主 5324（Vue）或 5326（React），左侧菜单三页：

| 菜单 | 内容 |
|---|---|
| 页面1 · 组件级联邦 | `remoteComponent('sf-xxx-remote/components/TicketSummary')` 直渲染远程单个组件（对比项） |
| 页面2 · 应用级桥接 | `createVueBridgeApp` / `createReactBridgeApp` 挂载完整子应用 + 受控会话演示 |
| 页面3 · 对比说明 | 组件级 vs 应用级对比表 + API 文档锚点链接 |

## 远程表单链路（宿主 → 子应用 → 远程表单，6.1.0）

Vue 对额外演示「三层嵌套」的样式正确性：子应用内部菜单「远程表单（宿主提供）」页面，
经 `remoteComponent('sf-vue-host/form/ApprovalForm')` **反向消费宿主暴露的审批表单**，
业务数据由子应用以显式 props 传入（表单不读 window/URL 全局状态）。

表单模板使用字符串标签 `<sf-form-section>`（分节线）——这类标签依赖**提供方 app 的全局注册**，
不随组件打包走。宿主在 `src/fulgurjs/setup.ts` 声明 `globalComponents` 后，
插件在每次 `loadRemote` 时把声明幂等安装进**当次消费方 app**（含桥接子应用每次挂载新建的 app 实例），
分节线渲染为带橙色边框的分节卡片。若消费方未拿到注册，标签会退化为无样式的字面自定义元素
（真实业务里 `app.use(Antd)` 的 `<a-divider>`/`<a-button>` 即此类）——该页即此缺陷的可视化对照。

操作与预期：

1. 先启动 vue-remote（5323）与 vue-host（5324）（两个都要运行：表单来自宿主）。
2. 打开宿主 5324 → 页面2 · 应用级桥接 → 子应用菜单点「远程表单（宿主提供）」。
3. 预期看到两张橙色边框分节（基本信息/审批意见），字段为工单数据；
   DOM 中不残留 `<sf-form-section>` 字面元素；控制台 0 error。
4. 「卸载再挂载」后重进该页：分节样式仍在（每次加载重新安装注册，幂等）。

## 演示操作步骤与预期结果（实测记录）

以 Vue 宿主（http://localhost:5324）为例，React 宿主逐条同构等价：

1. **打开「页面2 · 应用级桥接」**：约 1 秒内看到绿色边框的完整子应用——身份栏显示
   「子应用 sf-vue-remote · 框架 Vue · 内部路由 /tickets · 宿主会话 session-1-alice · 用户 Alice」，
   下方是工单列表（9 条，4 待处理 / 3 进行中 / 2 已完成，客户端筛选 + 分页 3 页）。
   页面徽标行显示「宿主 sf-vue-host · Vue · 宿主角色 / 远程 sf-vue-remote · Vue · 子应用 /
   @fulgurjs/federation/runtime v5.4.1」（版本为运行时真实导出值；锁 6.1.0+）。
2. **子应用内部导航不写宿主 URL**：点击列表第一条「登录页验证码不显示」进入详情
   （#101，字段齐全），浏览器地址栏仍停留在 `/app-bridge`——子应用 memory 路由与宿主 history 路由互不干扰。
3. **编辑与保存**：详情页点「编辑」→ 改标题为「登录页验证码不显示（已修复）」、状态改「进行中」→「保存」
   → 回到详情页字段已更新、更新时间为当前时刻；「返回列表」后第一行同步显示新标题——
   列表/详情/编辑共享子应用模块级内存数据。
4. **会话快照可输入**：在「用户名快照」输入框把 `Alice` 改成 `Bob`。
5. **切换会话（受控顺序）**：点「切换会话」→ 子应用卸载 → AppContext 清理 → 新快照 → 重挂。
   展开诊断面板，事件日志按真实时序记录：
   `切换会话开始：sessionKey → null` → `[child] 子应用 onGone：已卸载` → `clearAppContext 完成`
   → `新快照就绪：sessionKey=session-2-Bob，user=Bob` → `sessionKey 更新 → 桥接按新代次重挂`
   → `[child] 子应用 onReady：挂载完成`。
   子应用身份栏变为「宿主会话 session-2-Bob · 用户 Bob」；AppContext 快照 JSON 实时显示
   `sessionKey / user / getToken（函数引用）/ hostLabel`。计数变为 mount 2 · unmount 1 · 会话切换 1。
6. **卸载再挂载**：点「卸载再挂载」→ 容器清空后按同一 sessionKey 重挂（模块缓存复用，不重新下载）。
   mount/unmount 计数各 +1；重挂后列表里第 3 步编辑过的数据**仍在**——应用级桥接的子应用
   状态属于模块级单例，不随容器销毁（这是与组件级的关键差异之一）。
7. **页面1 · 组件级联邦（对照）**：`remoteComponent` 直渲染远程 `TicketSummary` 组件——
   只有统计卡片（数据同样来自子应用模块），没有子应用路由、没有身份栏、没有 AppContext 协议；
   点「远程组件内交互」按钮可正常计数，证明是活的远程组件而非静态快照。
8. **页面3 · 对比说明**：7 行对比表（交付单元/路由/宿主传值/会话协议/生命周期/状态边界/适用场景）
   + 三个 API 文档锚点链接（§8 remoteComponent、§8.2 /bridge、§9 AppContext）。
9. **控制台纪律**：以上全流程（含两次会话操作与页面切换）浏览器控制台 0 error 0 warning。
   子应用不向共享实例注册任何全局组件/插件，每次挂载新建 app + router 实例。

React 宿主（5326）差异说明：react-host 未启用 `StrictMode`——为让 mount/unmount 计数与
Vue 宿主一一对应（StrictMode 双 effect 语义下首次挂载计数会各多一次；桥接契约对两种模式都安全）。
其余行为逐条一致（实测：session-2-Carol、mount 3 · unmount 2、子应用身份栏同步）。

## API ↔ 源码对照表

| API（README 锚点） | 导出入口 | 本 demo 使用位置 | 插件源码（packages/plugin/src） |
|---|---|---|---|
| `defineBridgeApp(factory)` | `@fulgurjs/federation/runtime` | [vue-remote/src/bridge.ts](vue-remote/src/bridge.ts) | `bridge-app-vue.ts` |
| `defineBridgeApp(factory)` | `@fulgurjs/federation/react` | [react-remote/src/bridge.tsx](react-remote/src/bridge.tsx) | `bridge-app-react.ts` |
| `createVueBridgeApp(spec, options)` | `@fulgurjs/federation/vue` | [vue-host/src/pages/AppBridgePage.vue](vue-host/src/pages/AppBridgePage.vue) | `bridge-host-vue.ts` |
| `createReactBridgeApp(spec, options)` | `@fulgurjs/federation/react` | [react-host/src/pages/AppBridgePage.tsx](react-host/src/pages/AppBridgePage.tsx) | `bridge-host-react.ts` |
| `remoteComponent(spec, options)` | `@fulgurjs/federation/runtime`（React 侧 `/react`） | vue-host / react-host 的 `pages/ComponentLevelPage.*` | `runtime/` |
| `provideAppContext` / `clearAppContext` / `getAppContext` | `@fulgurjs/federation/runtime`（React 侧 `/react`） | 宿主 `host-session.ts` + 桥接层内部写入；子应用 `App.vue` / `ChildLayout.tsx` 读取 | `context.ts` |
| 受控 `sessionKey`（undefined/null/非空串） | 桥接组件 prop | 两宿主 `AppBridgePage` 的 `handleSwitchSession` / `handleRemount` | `bridge-core.ts`（`assertControlledSessionKey`、`resolveBridgeContext`） |
| `getContext`（同步纯 getter 快照） | 工厂选项 | 两宿主 `host-session.ts` 的 `getLatestHostContext` | `bridge-core.ts` |
| `exposes: { './bridge' }` 契约约定 | fulgurjs.config.ts | 四工程的 `fulgurjs.config.ts` | 插件容器/manifest 逻辑 |
| shared singleton（同框架单键） | fulgurjs.config.ts | vue 对：`vue`；react 对：`react` + `react-dom` | 插件 shared 协商 |

## 与 examples/templates（跨框架版）的差异

| 维度 | examples/templates（跨框架） | examples/demos/same-frame（本场景） |
|---|---|---|
| 框架组合 | Vue 宿主 × React 子应用、React 宿主 × Vue 子应用 | Vue 套 Vue、React 套 React（同框架） |
| 宿主依赖合同 | 宿主必须同时装 vue + react + react-dom，shared 三键全 singleton | 宿主只装自己框架：vue 对 shared 仅 `vue`、react 对仅 `react` + `react-dom`（纯项目零对方依赖承诺不受影响） |
| 演示重心 | 最小接线：契约 + 受控会话 + appProps 快照 | 完整业务子应用（列表/详情/编辑、筛选分页）+ 三页对照 + 诊断面板 |
| 子应用路由 | memory 路由两个页面（首页/关于） | Vue 侧 vue-router `createMemoryHistory`、React 侧 `createMemoryRouter` 自包含（列表/详情/编辑带参路由） |
| 组件级对照项 | 无（bridge 专属示例） | 每宿主页面1 用 `remoteComponent` 直渲染远程组件，与页面2 形成显式对照 |
| 诊断能力 | 页面级 onReady 计数 | 每页 `<details>` 诊断面板：mount/unmount/会话切换计数 + 真实事件日志（含 `fulgurjs:error` 监听）+ AppContext 快照 JSON |
| 版本 / 端口 | 5.3.3；5303/5313 + 5314/5304 | **6.1.9**（registry 精确版本 + lockfile）；5323/5324 + 5325/5326 |
| 相同点 | 同一套 `/bridge` 契约、同一套受控 sessionKey 顺序（null → clearAppContext → 新快照 → 新 key）、同一套 MFU-015/016/017 错误语义 | |

## 构建 / 类型检查 / 部署

```bash
# 每工程独立执行
npm run build       # vite build（四工程全部通过）
npm run typecheck   # Vue 工程：vue-tsc --noEmit --skipLibCheck；React 工程：tsc --noEmit
```

生产构建：子应用产物在 `/sf-vue-remote/`、`/sf-react-remote/` 子路径，宿主 fulgurjs 配置的
`prod` 已按根相对写法指向对应子路径。部署时对各 `fulgurjs-remoteEntry.js`、
`fulgurjs-manifest.json`、`index.html` 设置 no-cache，其余带哈希资源可长缓存。

## 边界声明（如实）

- 子应用 memory 路由不与宿主 URL 同步（URL 同步是 §8.3 `/bridge/router/*` 的能力，本场景未启用）；
- 无 JS 沙箱 / CSS 隔离：双方样式用 `.sfh-`（宿主）/ `.sfc-`（子应用）类名命名空间治理；
- 子应用工单数据为本地内存数据（模块级单例）：页面会话内跨卸载/重挂持久，整页刷新后重置；
- vue-remote / react-remote 的 `index.html` + `main.ts(x)` 只是独立开发态入口，被宿主桥接消费时走
  `./bridge` 契约，与独立入口无关。
