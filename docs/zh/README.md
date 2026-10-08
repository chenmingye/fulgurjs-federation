# 中文文档目录

> 应用代码只从四个公开入口导入：包根（Vite 插件）、`@fulgurjs/federation/vue`、`@fulgurjs/federation/react`、`@fulgurjs/federation/runtime`。

## 推荐阅读路径

**第一次接触（从零建工程）**：

1. [快速上手](guide/getting-started.md) —— 安装、`fulgurjs create` 建工程、启动（含 pnpm 11+ 安装提示）
2. [组件与模块加载](guide/components-and-modules.md) —— 最常用的 `remoteComponent` / `loadRemote`
3. 出问题查[排错目录](troubleshooting/README.md)；参数细节查[配置参考](reference/configuration.md)与 [API 参考](reference/api.md)

**已有项目接入**：

1. [快速上手 · 已有项目接入](guide/getting-started.md#已有项目接入) —— `fulgurjs init` / 手工接入，按角色（提供方/消费方/双角色）选配置
2. 按需深入：[共享依赖](guide/sharing.md)（跨应用同实例）→ [远程页面](guide/remote-pages.md)（逐页接入）或[子应用桥接](guide/app-bridge.md)（整应用嵌入）
3. 远程业务页需要登录态时读[子应用桥接](guide/app-bridge.md#会话sessionkey与-appcontext)的 AppContext 一节与 [API 参考 · setup/onSession](reference/api.md#setuponsession-远程初始化生命周期)

**跨框架嵌入（Vue 宿主嵌 React 或反向）**：

1. [子应用桥接](guide/app-bridge.md) —— defineBridgeApp / createVueBridgeApp / createReactBridgeApp、appProps 快照、会话切换
2. 需要刷新/分享恢复子应用内部页面时：[URL 同步](guide/url-sync.md)
3. 部署前读[部署指南](guide/deployment.md)并跑 `npx @fulgurjs/federation doctor`

## 目录

### 使用指南（guide/）

| 文档 | 内容 |
|---|---|
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
| [错误码总表](reference/errors.md) | 48 个错误码，逐条现象/原因/修法 |

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
| [Vite 7/8 兼容矩阵](../maintainers/compatibility-testing.md) | fixtures 全版本 e2e 矩阵 |
