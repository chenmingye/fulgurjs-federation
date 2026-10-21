# 系统架构：从工程接入到浏览器执行

这组图用于选择接入方式和理解执行边界。普通组件、逐页接入和完整应用桥接是三条并列路径，不要求全部启用。参数与错误合同仍以[配置参考](../reference/configuration.md)、[API 参考](../reference/api.md)和对应指南为准。

[下载离线图册 HTML](../../diagrams/architecture.zh.html) · [English](../../en/guide/architecture.md)

图中的 `application.start` 独立分支展示可选统一启动方式；已有 main 也可保持原启动，并另外提供桥接契约。图不要求移动业务入口或增加组件包装文件。

## 1. 总体架构与推荐路径

![系统总体架构：本地工具链、资源服务和浏览器执行，包含三条并列接入路径](../../diagrams/overview.zh.svg)

[打开完整 SVG](../../diagrams/overview.zh.svg) · [高清 PNG](../../diagrams/overview.zh.png)

| 需求 | 推荐入口 | 职责边界 |
|---|---|---|
| 复用另一个应用的组件/函数 | `exposes` + `remoteComponent` / `loadRemote` | 组件按各自框架渲染；不需要页面表或完整应用桥接 |
| 宿主持有远程页面集合的路由 | `createHostPages` / `createReactHostPages` | 宿主维护页面表、菜单与路由；适配器加载对应 expose |
| 完整应用保留自己的导航与状态 | `defineBridgeApp` + 宿主桥接工厂 | 复用已有业务初始化，原独立入口保持；子应用维护自身 root/router/store |
| 主动选择统一启动 | 可选 `defineApplication` + 宿主桥接工厂 | 项目选择时才由插件同时管理独立/嵌入启动 |

宿主与远程各自在自己的 Vite 工程注册插件、开发和构建；图中的插件节点表示相同能力，不是跨进程共用一个插件实例。serve 通过开发服务提供联邦端点；生产产物由 HTTP 静态服务器/CDN 提供。远程代码最终在消费方浏览器执行，插件不提供托管或业务后端。

浏览器页面共享运行时内核、共享注册表及 AppContext；这不表示所有组件和桥接应用都单例。契约模块可以缓存复用，挂载实例按 DOM 容器和代次区分。`shared` 协商的是库；业务 store 的归属、共享或隔离需要显式装配。

这些路径在同一浏览器 realm 执行，不提供 JS/CSS 沙箱；样式和全局变量仍可能相互影响。跨框架 UI 使用完整应用桥接，普通组件加载不把 Vue 组件转换为 React 组件或反向转换。支持条件见[兼容性与真实限制](../troubleshooting/compatibility.md)。

组件需要的 Provider、全局组件/指令和 Pinia 归属不会自动从提供方原应用根部继承。固定表单接口推荐联邦组件暴露；不同宿主向同一子应用提供不同实现时，才选择业务 `getContext` 装载器。详见[组件复用的选择依据](components-and-modules.md#宿主向子应用提供组件推荐方式与选择依据)。

## 2. 模块加载、初始化与会话去重

![模块加载顺序：并行资源准备、setup、onSession 校验/去重、环境交付、模块缓存及渲染](../../diagrams/loading.zh.svg)

[打开完整 SVG](../../diagrams/loading.zh.svg) · [高清 PNG](../../diagrams/loading.zh.png)

此图描述 `loadRemote('remote/expose')` 这一完整模块入口。仅调用 `loadRemote('remote')` 取得容器，不执行 setup/onSession；主动 `preloadRemote` 只准备资源，不执行业务模块或初始化。

- 默认 `setup` 函数按**远程容器**成功执行一次；这里的容器是远程入口对应的容器，不是 DOM 挂载元素。没有默认函数时，环境声明仍可被读取；没有初始化模块元数据时跳过初始化段。
- 声明了 `onSession` 就必须提供有效的非空 `sessionKey`。缺失或无效时抛 `MFU-013`，本次加载失败，不能静默跳过。
- 同一代次的成功结果/进行中 Promise 会复用；新代次才重新执行会话同步，失败阶段允许重试。成功模块缓存命中也先经过会话检查，不等于每次访问都重跑 `onSession`。
- runtime 根据实际消费方安装 Vue 全局组件、交付 Provider 声明；组件适配器解析所需 Provider 并包装渲染。手动 `loadRemote` 不自动包装组件树。组件框架、权限和业务数据仍由应用负责。
- `preloadRemote` 的 `prefetch` 模式不自动等待空闲；样式表仍可能影响当前页面。模块加载、首次根提交与业务接口完成是不同阶段。

## 3. 完整应用的挂载、换代与卸载

![完整应用生命周期：契约定义、mount 内工厂执行、首次提交、失效与实际卸载、登出空态和新代次重挂](../../diagrams/lifecycle.zh.svg)

[打开完整 SVG](../../diagrams/lifecycle.zh.svg) · [高清 PNG](../../diagrams/lifecycle.zh.png)

`defineApplication(factory)` / `defineBridgeApp(factory)` 先定义契约，不立即执行业务工厂。宿主加载桥接契约后调用 `mount`。保留原 main 的工程由业务独立入口自行启动；只有选择 `defineApplication` 统一启动时，才调用 `application.start` 进入独立模式挂载。**业务工厂在 mount 内执行**，按业务定义创建本次 app/root 与 router，并安装或复用相应的 store 和业务插件；插件不会替业务自动改写成隔离状态实例。

图中的会话换代/登出分支适用于启用了会话控制的宿主桥接；公开应用可以省略会话配置，独立运行由业务主动卸载。

首次根提交完成表示挂载成功，不保证业务接口、异步页面或权限数据均已就绪。初始化途中离开也会作废旧代次，迟到结果不得重新挂入 DOM；业务异步回写仍须检查自己的 signal/实例状态。

| 触发 | 行为 |
|---|---|
| 同身份 token 轮换、普通 `appProps` 顶层替换 | 不因这两项自动重挂；`appProps` 是挂载快照，实时数据使用稳定 getter/订阅 |
| 登出 `sessionKey = null` 或宿主移除视图 | 作废代次并实际卸载；保持空容器，不再加载或自动重新挂载 |
| 有效新代次到来、宿主仍需显示该应用 | 先卸载旧实例，成功后按新代次初始化/加载契约、再次 mount；成功模块可复用 |
| `unmount` 抛错 | 封锁该 DOM 容器，同页重试/换代不绕过；修复清理逻辑后整页刷新恢复 |

Vue 常规登录桥接推荐响应式 `session` 身份 getter，由插件管理代次；React 或需要显式控制时使用 `sessionKey`。二者不要混用。同页受控桥接实例共用一套会话，不能以不同存储键模拟同页双账号隔离。详见[会话合同](app-bridge.md#会话sessionkey与-appcontext)。

URL 同步是可选能力：宿主拥有浏览器历史，嵌入子应用使用受控 memory router，双方都要接线。独立启动正常使用 web/hash 路由；插件不会把任意已有 web router 自动转换成 memory。详见[URL 同步](url-sync.md)。

## 4. 源码与维护入口

| 图中职责 | 实现位置 |
|---|---|
| 开发/构建接入、虚拟模块与导入转换 | [index.ts](../../../packages/plugin/src/index.ts)、[virtual.ts](../../../packages/plugin/src/virtual.ts)、[transform.ts](../../../packages/plugin/src/transform.ts) |
| 远程容器、共享协商、setup/onSession、模块缓存与预载 | [runtime/index.ts](../../../packages/plugin/src/runtime/index.ts) |
| 公开入口与三条消费路径的装配 | [vue.ts](../../../packages/plugin/src/vue.ts)、[react.ts](../../../packages/plugin/src/react.ts)、[host-pages-core.ts](../../../packages/plugin/src/host-pages-core.ts) |
| 页面级快照上下文 | [context.ts](../../../packages/plugin/src/context.ts) |
| 统一装配、契约与宿主生命周期 | [application-core.ts](../../../packages/plugin/src/application-core.ts)、[bridge-app-vue.ts](../../../packages/plugin/src/bridge-app-vue.ts)、[bridge-app-react.ts](../../../packages/plugin/src/bridge-app-react.ts)、[bridge-host-vue.ts](../../../packages/plugin/src/bridge-host-vue.ts)、[bridge-host-react.ts](../../../packages/plugin/src/bridge-host-react.ts) |
| 自动会话与可选路由通道 | [bridge-session-auto.ts](../../../packages/plugin/src/bridge-session-auto.ts)、[bridge-router-core.ts](../../../packages/plugin/src/bridge-router-core.ts) |

图源、生成命令和导出规则见[图册维护说明](../../diagrams/README.md)。图片与离线 HTML 来自同一图源；没有具体业务代码、登录凭据或私有验收现场。图中的正常分支和明确标出的失败分支用于解释机制，不替代真实工程的兼容、故障恢复和部署验收。
