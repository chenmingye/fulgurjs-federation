# webpack Module Federation：当前能力与使用边界对照

> 核对版本：`@fulgurjs/federation@5.7.1`（2026-10-03）。本页描述当前能力；早期任务书、设计方案及分版本验收报告保留历史记录，不作为当前支持范围。
> 对照对象是 webpack 5 内置 `ModuleFederationPlugin`；Module Federation enhanced runtime、Bridge、DevTools 等独立生态工具不是 webpack 内置插件的同一功能面。本插件不承诺完整配置或产物互操作兼容。

## 一、已经实现

| 能力 | 本插件当前状态 | 使用说明 |
|---|---|---|
| exposes / remotes | 支持 | dev 容器直连；production 生成 ESM remoteEntry 与 manifest |
| 动态远程 | 支持 | `registerRemote` / `registerRemotes`；promise remote 解析容器或地址 |
| shared 版本协商 | 支持 | `requiredVersion`、singleton、strictVersion、eager、shareKey、多 shareScope；真实实例版本登记与并发保护 |
| `shared.import: false` | 支持 | 纯消费，不提供本地 fallback；不能与 eager 同时使用 |
| 双向联邦与嵌套容器 | 支持 | 各应用可同时提供和消费模块；这不等于自动代理任意层级的桥接路由 |
| Vue 3 / React 18–19 | 支持浏览器客户端 | 各框架组件加载、页面适配器；纯 TS 模块可跨框架消费 |
| Vue ↔ React 子应用桥接 | 支持 | `/bridge` 整站挂载/卸载、props/context、会话切换、错误占位 |
| 子应用路由 ↔ 宿主 URL | 支持，显式启用 | `/bridge/router/vue`、`/bridge/router/react`；深链、刷新、push/replace、前进后退与导航取消；默认关闭 |
| React 18/19 隔离共存 | 支持按作用域隔离 | 整组 React、renderer 和消费者使用相应 scope；跨树传普通 props/回调，不能混用 ReactElement/Context |
| 运行时策略 | 支持 | `runtimePlugins`；HTML 入口/expose 执行前准备异步共享策略。无 HTML 的入口及启动后修改策略须先协商再导入新消费者 |
| 加载恢复与诊断 | 支持 | 超时、重试、熔断、显式 fallback、错误码；静态依赖失败的恢复边界见 §三 |
| 工程辅助 | 支持 | dts、manifest 预载、setup/onSession、CLI 检查与 Demo |

入门步骤见 [中文 README](../README.md)、[英文 README](../README.en.md)；公开签名及默认值见 [中文 API 手册](API.md)、[English API reference](API.en.md)。版本隔离与恢复例子见 [examples/demos/react-versions](../examples/demos/react-versions/README.md)。

## 二、当前不提供的能力

| 能力 | 当前范围 | 与 webpack 的关系 |
|---|---|---|
| SSR / Node 服务端联邦、RSC、Next.js 全栈 | 不支持 | webpack 联邦概念支持 web/Node 等环境；不意味着自动获得完整 SSR/RSC 集成。本插件当前仅支持浏览器客户端 |
| webpack `script` / `var` 容器互操作 | 不支持 | 本插件产出 ESM remote；不要因为都有 init/get 就直接混用两种产物。remoteType/library 已删除，传入报迁移错误 |
| Vue/React 组件级直接混渲染 | 不提供转换层 | webpack 核心负责模块加载，不转换框架组件；本插件的子应用桥接允许两个框架各自管理组件树 |
| JS 沙箱 / 自动 CSS 隔离 | 不提供 | 普通同页面联邦不会自动隔离全局变量、全局 CSS、Portal/Teleport 的容器外 DOM；需要额外隔离方案 |
| 独立浏览器 DevTools 扩展 | 无 | 本插件提供 `window.__FULGURJS_SCOPE__ / __FULGURJS_INFO__`。其他联邦生态工具的扩展不能计为 webpack 内置能力 |
| React 页面 KeepAlive | 不承诺 | 已下载模块可复用；组件状态保活需要应用或专门库实现 |
| 其他框架与路由库的内置适配 | 无 | URL 同步内置 Vue Router / React Router data router；其他库可实现导航端口。多层桥接路由自动代理、跨窗口同步不在当前支持面 |

## 三、使用限制与 webpack 的区别

以下区分实例正确性、网络开销和失败恢复，不将“已测场景”扩大成所有工程保证。

| 场景 | 本插件当前表现 | webpack 5 内置 MF 的对应表现 | 处理方法 |
|---|---|---|---|
| 共享库额外网络副本 | Vite 8 同步消费门面可能把未采用的本地副本也拉入模块图；已测双版本场景 ≤2 份。这不是所有应用图的数量上限；同 singleton scope 的实例身份仍统一 | 不是 webpack 的必然限制。异步 shared 可按协商结果加载；eager/fallback、未共享路径或不同 scope 也可能增加下载量，不能宣称 webpack 永远只下载一份 | 区分网络文件数与运行时实例数，按实际构建图评估；不要将本插件这项代价归为所有 MF 实现共有 |
| dev 冷启动依赖优化重载 | Vite 新发现依赖时可能重新预构建并 full reload（DEV-010）；稳定态需等优化完成 | webpack dev 也有编译/HMR 等待，但没有同一套 Vite 依赖优化机制 | 排查冷/热态区别，按需配置预构建；这不是生产限制，也不是 webpack MF 的相同缺陷 |
| expose 的静态 ESM 依赖下载失败 | 已缓存失败的依赖 URL 可能阻止同页恢复；只变换 expose 入口 URL 不会改写静态依赖 URL，提供用户主动刷新恢复 | 常见 script/JSONP chunk loader 失败后清掉该 chunk 的加载状态，后续请求可以重新加载；仍需调用方触发重试。404 旧产物、持续网络故障等不保证靠重试恢复；使用原生 ESM 路径时需单独评估 | 不笼统写“webpack 也只能刷新”。本插件控制的入口/动态加载边界可变换 URL；静态依赖失败仍保留刷新操作 |
| React 与 renderer 不兼容或实例不一致 | React 18 的 renderer 不能因 singleton 协商就自动兼容 React 19。对齐版本，或分 scope 隔离整组依赖及消费者 | 同样受 React 的版本与实例要求约束；singleton 不会转换框架 ABI，strictVersion 可拒绝冲突 | 共享树使用兼容 React/renderer；不同大版本使用独立树和作用域，传普通数据/回调 |

异步协商的启动时序同样需要关注：webpack 推荐异步 bootstrap 边界。本插件对 HTML 入口自动处理相关边界；自定义入口仍应先 `await loadShare`，再动态导入消费者。已经求值的静态绑定不能追溯替换。

### 官方依据

- [webpack 联邦概念与异步 bootstrap](https://webpack.js.org/concepts/module-federation/)：容器、shareScope、已加载实例、eager 下载代价及不同运行环境。
- [webpack shared 配置](https://webpack.js.org/plugins/module-federation-plugin/)：singleton / requiredVersion / strictVersion / eager。
- [webpack 5.102.1 JSONP chunk loader 源码](https://github.com/webpack/webpack/blob/v5.102.1/lib/web/JsonpChunkLoadingRuntimeModule.js)：失败时清除 installedChunks 状态。此结论针对该加载器，由源码推导，不代表所有加载器或任意故障都能自动恢复。
- [HTML 标准：模块脚本加载](https://html.spec.whatwg.org/multipage/webappapis.html#fetch-a-single-module-script)：原生 ESM 的 module map 与失败记录。
- [Vite 依赖预构建](https://vite.dev/guide/dep-pre-bundling)：新依赖触发重新优化及必要的页面重载。
- [React 的版本与重复实例诊断](https://react.dev/warnings/invalid-hook-call-warning)：消费方与 renderer 必须使用一致的 React 模块实例。

## 四、迁移入口

- Vite 工程按 [README](../README.md) 配置 remotes/exposes/shared，不照搬已经删除的 webpack 配置字段。
- 从 iframe/其他微前端方案迁移：先选择模块/页面加载或子应用桥接；需要地址恢复时显式开启 URL 同步。
- React 18/19 同页运行：先运行 [版本隔离 Demo](../examples/demos/react-versions/README.md)，再按实际应用依赖图配置作用域。
- 旧报告里的“React 未支持”“URL 同步待实现”“Vite 8 生产挂起未解”属于旧版本记录。当前补修证据见 [完整验收报告 §14](完整Demo展示与全面复测-验收报告-20261002.md#14-共享协商收尾与证据订正571)。
