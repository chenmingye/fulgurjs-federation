# @fulgurjs/federation

**让一个 Vite 应用使用另一个应用提供的组件、页面、函数或完整子应用。**

例如：主系统加载独立部署的审批页面，Vue 页面中嵌入 React 子应用，多个应用共享同一套依赖版本。提供方与使用方可以分仓库开发、独立构建部署。支持 Vue 3 与 React 18/19，Vite 5.1–8。

[English](README.en.md) ｜ **[完整文档中心](docs/README.md)**（中文 [docs/zh](docs/zh/README.md) · English [docs/en](docs/en/README.md)）

## 快速开始

**新建工程**（推荐）：用 CLI 从完整模板创建可独立运行的联邦工程：

```bash
npx @fulgurjs/federation create vue-vue --dir my-federation
cd my-federation
pnpm dev
```

**已有工程接入**：安装后在 `vite.config.ts` 注册插件，应用代码按框架从统一入口导入：

```bash
npm add @fulgurjs/federation
```

```ts
// vite.config.ts —— 构建配置用包根
import federation from '@fulgurjs/federation'

export default {
  plugins: [federation({
    name: 'my-app',
    // exposes / remotes / shared 按需配置，见文档「已有项目接入」
  })],
}
```

```ts
// Vue 应用代码统一入口 @fulgurjs/federation/vue
import { loadRemote, remoteComponent } from '@fulgurjs/federation/vue'
const RemoteButton = remoteComponent('remote-a/Button')
const math = await loadRemote<{ add(a: number, b: number): number }>('remote-a/math')
```

```tsx
// React 应用代码统一入口 @fulgurjs/federation/react
import { remoteComponent, useLoadRemote, RemoteErrorBoundary } from '@fulgurjs/federation/react'
```

```ts
// 框架无关的浏览器模块 @fulgurjs/federation/runtime（零 Vue/React 依赖）
import { loadRemote, loadShare } from '@fulgurjs/federation/runtime'
```

## 导入入口

| 使用位置 | 入口 |
|---|---|
| Vite 配置、`FederationOptions` 类型 | `@fulgurjs/federation` |
| Vue 应用代码（组件/页面/桥接/路由同步） | `@fulgurjs/federation/vue` |
| React 应用代码（组件/页面/桥接/路由同步） | `@fulgurjs/federation/react` |
| 框架无关浏览器模块 | `@fulgurjs/federation/runtime` |

记忆口诀：应用跑什么框架，就从哪个框架入口导入；两者都要用的纯 TS 模块从 `/runtime`；Vite 配置从包根。

## 能力地图

- **组件与模块**：`remoteComponent`（Vue/React）、`useLoadRemote`、`RemoteErrorBoundary`、`loadRemote` —— 失败显式错误态可重试，不静默兜底。
- **逐页接入**：`definePages` + `createHostPages`（宿主页面路由表 → 远程页面），CLI `check-pages` 启动期契约核对。
- **完整子应用桥接**：`defineBridgeApp`（子应用）+ `createVueBridgeApp` / `createReactBridgeApp`（宿主）；挂载/卸载、会话代次、卸载失败封锁。
- **URL 同步**：`createVueBridgeNavigation` / `createReactBridgeNavigation`（宿主）+ `connectVueBridgeRouter` / `createReactBridgeRouter`（子应用）；深链刷新、守卫取消、query/hash 保留。
- **共享依赖**：singleton / requiredVersion / strictVersion / shareScope / eager，同步与异步裁决，React 18/19 多版本隔离。
- **CLI**：`create` / `init` / `explain` / `check-pages` / `doctor` / `port`。

## 文档

| 需求 | 入口 |
|---|---|
| 新建工程 / 已有项目接入 | [快速开始](docs/zh/guide/getting-started.md) |
| Vue/React 组件与普通模块 | [组件与模块](docs/zh/guide/components-and-modules.md) |
| 完整子应用 / 跨框架嵌套 | [子应用桥接](docs/zh/guide/app-bridge.md) |
| 路由同步 / 刷新深链 | [URL 同步](docs/zh/guide/url-sync.md) |
| 全部配置项与默认值 | [配置参考](docs/zh/reference/configuration.md) |
| 全部 API 签名与语义 | [API 参考](docs/zh/reference/api.md) |
| CLI 命令与退出码 | [CLI 参考](docs/zh/reference/cli.md) |
| 错误码（现象/原因/修法） | [错误码总表](docs/zh/reference/errors.md) |
| 按症状排错 / 兼容范围 | [排错](docs/zh/troubleshooting/README.md) |
| 模板与示例运行 | [示例总览](examples/README.md) |

## 示例

五个完整模板（`vue-vue` / `react-react` / `vue-host-react-remote` / `react-host-vue-remote` / `showcase`）与功能 Demo 统一维护在 [examples/](examples/README.md)，均可整目录复制后独立安装运行。

## 贡献与安全

- 贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)；架构与发布见 [docs/maintainers/](docs/maintainers/README.md)。
- 安全问题请按 [SECURITY.md](SECURITY.md) 的渠道私下报告。

## License

[MIT](LICENSE)
