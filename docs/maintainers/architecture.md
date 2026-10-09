# 架构导读

> 设计决策与命名约定见 [DESIGN.md](../../DESIGN.md)；与 webpack MF 的能力对照见[对照与缺口](webpack-mf-对照与缺口.md)；测试与发布见本目录 [testing.md](testing.md) / [releasing.md](releasing.md)。

## 定位与边界

- 目标：在 Vite 上提供模块联邦能力——远程组件/页面/普通模块、共享依赖协商、完整子应用桥接（含可选 URL 同步）；
- 「对齐 webpack」指语义对齐（版本裁决、singleton 收敛、已加载优先），不是产物互操作——本插件产出 ESM remote，不与 webpack `script`/`var` 容器互通；
- 边界：不做沙箱、不做组件类型转换、不支持 SSR/RSC 与 webpack 容器互通；完整边界见[对照与缺口](webpack-mf-对照与缺口.md)。

## 源码结构（packages/plugin/src/）

| 模块 | 职责 |
|---|---|
| `index.ts` | 插件主体：config/resolveId/transform/transformIndexHtml/configureServer/build 钩子编排 |
| `options.ts` | 配置规范化与前置校验（CFG 三段式报错；shared/requiredVersion 推断；devSharedSelf 角色推断） |
| `virtual.ts` | 虚拟模块：runtime/init/provides/remote-entry/shared 门面（`virtual:fulgurjs-*`） |
| `runtime/`（生成源 `runtime-code.gen.ts`） | 浏览器运行时内核（gzip 红线 ≤ 10496B）：loadRemote/loadShare/协商/超时重试熔断/setup 生命周期 |
| `transform.ts` | 远程页面运行时导入改写为惰性单例代理；dev shared 协商改写（devSharedSelf） |
| `manifest.ts` / `dts-*.ts` | prod manifest 生成与契约校验；远程类型链：dts-generate（提供方声明闭包，TS API/vue-tsc）、dts-ambient（宿主 ambient+注册表生成）、dts-sync（下载/校验/原子同步/轮询）、dts-serve（dev 端点）、dts-shared（类型协议）、dts-discovery（tsconfig 发现检查）、dts-cli（fulgurjs types）；注册表唯一声明在包内静态 types/registry.d.ts（跨入口共享，经 ./internal/registry.js 引用） |
| `dev-cors.ts` | devCorsOrigins 归一化（端点与 server.cors 共用来源） |
| `context.ts` / `pages.ts` / `host-pages-core.ts` | AppContext、definePages R1–R5、createHostPages 共用内核（Vue/React 共享纯解析层） |
| `bridge-*.ts` / `vue-adapter.ts` / `react-adapter.ts` | 桥接契约核心、Vue/React 子应用与宿主适配器、路由同步（core/vue/react 三层） |
| `cli.ts` / `commands.ts` / `init.ts` / `create.ts` / `doctor.ts` / `port.ts` | CLI：create/init/explain/check-pages/doctor/port |
| `diagnostics.ts` | 错误码登记表 `CODE_REGISTRY`（与源码码表、文档三方一致性门禁） |

## 关键机制

- **单实例运行时**：宿主页面与远程 exposes 目标文件都直接静态导入运行时 API；插件把远程页面里的导入改写为惰性单例代理（求值期零副作用、调用期转发页面级 `__FULGURJS_RUNTIME__` 单例）——宿主与远程写法完全一致；
- **dev 协作引擎**：`@fulgurjs-entry.js`/`@fulgurjs-manifest.json` 中间件直出容器与 manifest；宿主 dev 拉取远程 manifest 驱动 dts 生成与预载；
- **build 引擎**：rollup 原生输出 + `emitFile chunk` 生成 ESM remoteEntry 与 manifest；协商门面隔离进插件专属 chunk（`fulgurjs-runtime`/`fulgurjs-shared-<key>`），共享包本体隔离进 `fulgurjs-provider-<key>` 组（优先于用户 manualChunks，防自等待环与跨 chunk TDZ）；
- **入口分层**：包根（插件）/`/vue`/`/react`/`/runtime` 四入口；`/vue` 零 React、`/react` 零 Vue、`/runtime` 零框架零路由库；路由同步 API 对路由库仅类型导入 + 模块级按需预热（各入口 ≤4096B gzip 门禁）。

## 阅读顺序建议

1. [DESIGN.md](../../DESIGN.md)（已锁定的决策）→ 本页源码结构表；
2. 结合源码读：`options.ts`（配置面）→ `virtual.ts` + `runtime/`（运行时与门面）→ `index.ts`（钩子编排）；
3. 桥接与路由：`bridge-core.ts` → `bridge-app-vue.ts`/`bridge-app-react.ts` → `bridge-host-*.ts` → `bridge-router-*.ts`（对照 [API 参考 · 桥接](../zh/reference/api.md#bridge-api)与[URL 同步](../zh/reference/api.md#url-sync-api)）；
4. 测试与发布：[testing.md](testing.md) → [releasing.md](releasing.md)。
