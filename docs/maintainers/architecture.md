# 架构导读

> 本文是 [DESIGN.md](../../DESIGN.md) 的摘要与阅读顺序导读，不复制全文；细节与决策记录以 DESIGN.md 为准。

## DESIGN.md 是什么

`DESIGN.md` 是插件的设计方案文档（v0.2 起「全量对齐 Webpack MF 版」），记录了从决策锁定、配置面对齐总表、运行时行为语义、dev 协作引擎、构建引擎到测试与验证计划的完整设计。改架构前先读它；改完同步更新它。

## 核心设计（摘要）

### 1. 定位与对齐口径

- 目标：在 Vite 上提供与 webpack `ModuleFederationPlugin` 等效的联邦能力，配置面对齐 webpack 官方选项（接受/适配/告警各有唯一归宿，见 DESIGN.md §2 配置面对齐总表）；
- 「对齐」的精确含义见 DESIGN.md §1：语义对齐（版本裁决、singleton 收敛、已加载优先）而非产物互操作——本插件产出 ESM remote，不与 webpack `script`/`var` 容器互通。

### 2. 源码结构（packages/plugin/src/）

| 模块 | 职责 |
|---|---|
| `index.ts` | 插件主体：config/resolveId/transform/transformIndexHtml/configureServer/build 钩子编排 |
| `options.ts` | 配置规范化与前置校验（CFG 三段式报错；shared/requiredVersion 推断；devSharedSelf 角色推断） |
| `virtual.ts` | 虚拟模块：runtime/init/provides/remote-entry/shared 门面（`virtual:fulgurjs-*`） |
| `runtime/`（生成源 `runtime-code.gen.ts`） | 浏览器运行时内核（gzip 红线 ≤ 10496B）：loadRemote/loadShare/协商/超时重试熔断/setup 生命周期 |
| `transform.ts` | 远程页面运行时导入改写为惰性单例代理；dev shared 协商改写（devSharedSelf） |
| `manifest.ts` / `dts.ts` | prod manifest 生成与契约校验；dev 类型直连生成（source/shim 双模式、React 双轨 paths） |
| `dev-cors.ts` | devCorsOrigins 归一化（端点与 server.cors 共用来源） |
| `context.ts` / `pages.ts` / `host-pages-core.ts` | AppContext、definePages R1–R5、createHostPages 共用内核（Vue/React 共享纯解析层） |
| `bridge-*.ts` / `vue-adapter.ts` / `react-adapter.ts` | 桥接契约核心、Vue/React 子应用与宿主适配器、路由同步（core/vue/react 三层） |
| `cli.ts` / `commands.ts` / `init.ts` / `create.ts` / `doctor.ts` / `port.ts` | CLI：create/init/explain/check-pages/doctor/port |
| `diagnostics.ts` | 错误码登记表 `CODE_REGISTRY`（与源码码表、文档三方一致性门禁） |

### 3. 关键机制

- **单实例运行时**：宿主页面与远程 exposes 目标文件都直接静态导入运行时 API；插件把远程页面里的导入改写为惰性单例代理（求值期零副作用、调用期转发页面级 `__FULGURJS_RUNTIME__` 单例）——宿主与远程写法完全一致；
- **dev 协作引擎**：`@fulgurjs-entry.js`/`@fulgurjs-manifest.json` 中间件直出容器与 manifest；宿主 dev 拉取远程 manifest 驱动 dts 生成与预载；
- **build 引擎**：rollup 原生输出 + `emitFile chunk` 生成 ESM remoteEntry 与 manifest；协商门面隔离进插件专属 chunk（`fulgurjs-runtime`/`fulgurjs-shared-<key>`），共享包本体隔离进 `fulgurjs-provider-<key>` 组（优先于用户 manualChunks，防自等待环与跨 chunk TDZ）；
- **入口分层**：包根（插件）/`/vue`/`/react`/`/runtime` 四入口；`/vue` 零 React、`/react` 零 Vue、`/runtime` 零框架零路由库；路由同步 API 对路由库仅类型导入 + 模块级按需预热（各入口 ≤4096B gzip 门禁）。

### 4. 诚实边界（DESIGN.md §5）

不做沙箱、不做组件类型转换、不支持 SSR/RSC 与 webpack script/var 互操作；「已测场景」不扩大为普适保证——完整边界与 webpack 的区别见[webpack-mf 对照](webpack-mf-对照与缺口.md)。

## 阅读顺序建议

1. DESIGN.md §0（已锁定的决策）→ §1（对齐的精确定义）→ §2（配置面对齐总表）；
2. 结合源码读：`options.ts`（配置面）→ `virtual.ts` + `runtime/`（运行时与门面）→ `index.ts`（钩子编排）；
3. 桥接与路由：`bridge-core.ts` → `bridge-app-vue.ts`/`bridge-app-react.ts` → `bridge-host-*.ts` → `bridge-router-*.ts`（对照 [API 参考 §7/§8](../zh/reference/api.md#bridge-api)）；
4. 测试与验证计划：DESIGN.md §6（测试基座、环境矩阵、NGINX 规范、单测与产物断言）+ 本目录[测试方法](testing.md)。
