# 中文文档目录

> 应用代码只从四个公开入口导入：包根（Vite 插件）、`@fulgurjs/federation/vue`、`@fulgurjs/federation/react`、`@fulgurjs/federation/runtime`。


**已有完整应用首次接入**：[单一路径操作](guide/first-integration.md)。

**先看整体关系**：[系统架构图与执行顺序](guide/architecture.md)（总体架构、模块加载、完整应用生命周期）。

## 先选接入形态，再读对应指南

| 你要完成的事 | 当前推荐 | 先读 |
|---|---|---|
| 新建可运行示例工程 | CLI create，整套模板一起安装/运行 | [快速上手](guide/getting-started.md) |
| 在现有页面使用另一个应用的组件/函数 | exposes + remoteComponent / loadRemote；不加完整应用桥接 | [组件与模块](guide/components-and-modules.md) |
| 宿主掌握一组远程页面的路由 | 页面表 + createHostPages/createReactHostPages | [逐页接入](guide/remote-pages.md) |
| 完整应用保留自己的路由、菜单与状态 | 保留原启动，defineBridgeApp 复用初始化，宿主工厂挂载 | [首次接入](guide/first-integration.md) |
| 主动选择由插件管理独立与嵌入启动 | 可选 defineApplication | [桥接合同](guide/app-bridge.md) |
| 让完整子应用的内部位置出现在浏览器 URL | 在桥接基础上显式接通 routing，两端都配置 | [URL 同步](guide/url-sync.md) |

宿主/子应用是挂载关系，提供方/消费方是模块关系，允许同一应用兼任两种角色。Vue 应用从 /vue、React 应用从 /react 导入；这不转换组件框架。Vue 常规桥接会话推荐 session getter，React 或需手动管理时用 sessionKey。各指南代码中的业务模块/变量来自真实工程，不是插件自动生成的全局对象。

## 推荐阅读路径

**第一次接触（从零建工程）**：

1. [快速上手](guide/getting-started.md) —— 安装、`fulgurjs create` 建工程、启动（含 pnpm 11+ 安装提示）
2. [组件与模块加载](guide/components-and-modules.md) —— 最常用的 `remoteComponent` / `loadRemote`
3. 出问题查[排错目录](troubleshooting/README.md)；参数细节查[配置参考](reference/configuration.md)与 [API 参考](reference/api.md)

**已有项目接入**：

1. [快速上手 · 已有项目接入](guide/getting-started.md#已有项目接入) —— `fulgurjs init` / 手工接入，按角色（提供方/消费方/双角色）选配置
2. 按需深入：[共享依赖](guide/sharing.md)（同作用域的库实例协商，非自动共享业务 store）→ [远程页面](guide/remote-pages.md)（逐页接入）或[子应用桥接](guide/app-bridge.md)（整应用嵌入）
3. 远程业务页需要登录态时读[子应用桥接](guide/app-bridge.md#会话sessionkey与-appcontext)的 AppContext 一节与 [API 参考 · setup/onSession](reference/api.md#setuponsession-远程初始化生命周期)

**跨框架嵌入（Vue 宿主嵌 React 或反向）**：

1. [子应用桥接](guide/app-bridge.md) —— defineBridgeApp / createVueBridgeApp / createReactBridgeApp、appProps 快照、会话切换
2. 需要刷新/分享恢复子应用内部页面时：[URL 同步](guide/url-sync.md)
3. 部署前读[部署指南](guide/deployment.md)并跑 `npx @fulgurjs/federation doctor`

## 目录

### 使用指南（guide/）

| 文档 | 内容 |
|---|---|
| [系统架构图](guide/architecture.md) | 三条接入路径、开发/浏览器边界、会话去重与挂载/卸载顺序 |
| [已有应用接入参考](guide/existing-apps.md) | 保留原启动、复用初始化、可选统一启动、状态绑定与接入预检 |
| [快速上手](guide/getting-started.md) | 安装、`create` 新建工程、已有项目 `init`/手工接入（Vue/React/纯 TS；consumer/provider/dual）、从 qiankun 类方案迁入的概念映射 |
| [组件与模块加载](guide/components-and-modules.md) | remoteComponent（Vue/React）、useLoadRemote、RemoteErrorBoundary、loadRemote、开发类型直连 |
| [远程页面接入](guide/remote-pages.md) | definePages / createHostPages / createReactHostPages、hostPages 导出、check-pages、业务菜单归应用自管的边界 |
| [子应用桥接](guide/app-bridge.md) | defineBridgeApp、createVueBridgeApp/createReactBridgeApp、sessionKey 生命周期、appProps 快照、挂载/卸载/嵌套 |
| [URL 同步](guide/url-sync.md) | createVueBridgeNavigation/createReactBridgeNavigation（宿主）、connectVueBridgeRouter/createReactBridgeRouter（子应用）、深链/守卫取消/query+hash/history 与 hash 宿主 |
| [共享依赖](guide/sharing.md) | initSharing、shared 配置、singleton/requiredVersion/strictVersion/shareScope/eager、加载顺序、同步异步裁决 |
| [部署指南](guide/deployment.md) | base 对齐、产物端点、no-cache、SPA 回退、CORS、doctor 体检 |
| [示例与模板](guide/examples.md) | 五个模板与功能 Demo 的选择、运行与端口 |

### 参考（reference/）

| 文档 | 内容 |
|---|---|
| [配置参考](reference/configuration.md) | `federation(options)` 全部字段：类型/默认值/省略语义/有效范围；remotes 四形态、SharedHint 全项、hostPages 具名导出 |
| [API 参考](reference/api.md) | 四个入口的全部公共 API：用途/导入位置/签名/默认值/返回/生命周期/错误边界/完整用法 |
| [CLI 参考](reference/cli.md) | create / init / explain / check-pages / doctor / port：语法/参数/默认值/副作用/退出码/示例 |
| [错误码总表](reference/errors.md) | 全部错误码，逐条现象/原因/修法 |

### 排错（troubleshooting/）

| 文档 | 内容 |
|---|---|
| [按症状找问题](troubleshooting/README.md) | 远程加载失败/白屏/共享版本冲突/URL 前缀/缓存/类型获取失败… |
| [支持范围与真实限制](troubleshooting/compatibility.md) | Vite 5.1+/6/7/8、React 18/19、Vue 3.2+、路由库版本、跨框架边界 |

### 维护者（../maintainers/）

| 文档 | 内容 |
|---|---|
| [维护者导航](../maintainers/README.md) | 仓库约定与文档入口 |
| [架构导读](../maintainers/architecture.md) | DESIGN.md 摘要与导读 |
| [测试方法](../maintainers/testing.md) | 单测 / e2e / fixtures / 门禁 |
| [发布流程](../maintainers/releasing.md) | Release 触发 publish.yml、npm 核验、文档同步 |
| [webpack MF 对照](../maintainers/webpack-mf-对照与缺口.md) | 与 webpack ModuleFederationPlugin 的能力对照与边界 |
| [沙箱边界审计](../maintainers/沙箱边界审计.md) | CSS / 全局变量 / 公共依赖的同 realm 结论 |
| [Vite 兼容性验证](../maintainers/compatibility-testing.md) | 支持版本的验证方法 |

- [公共类型参考](reference/types.md)
