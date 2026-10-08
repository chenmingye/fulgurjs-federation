# 支持范围与真实限制

> 「已测通过」不等于「所有工程保证」。本文写清当前支持面、真实限制与跨框架边界，避免把已测场景扩大成普适承诺。能力对照 webpack MF 的完整表格见[维护者 · webpack MF 对照](../../maintainers/webpack-mf-对照与缺口.md)。

## 版本支持

| 维度 | 支持范围 | 说明 |
|---|---|---|
| Vite | 5.1 及以上的 5 / 6 / 7 / 8 系列 | fixtures 全矩阵实测：5.1.4 / 5.2.12 / 6.4.3 / 7.3.6 / 8.3.0 dev+prod e2e 通过；Vite 8（Rolldown）dev 73/73 + prod 33/33 随 CI 常驻矩阵。项目必须同时满足所用 Vite 和框架插件的版本要求 |
| Node.js | 插件本体 ≥ 18；**Vite 7/8 要求 20.19+ 或 22.12+** | 不能只按插件最低版本选 Node；模板工程按 `engines.node` 校验（≥ 20.19.0） |
| Vue | 3.2+（浏览器端） | 普通工程零 vue-router 依赖；URL 同步按需引用 vue-router |
| vue-router | 4.1 – 5.x | 仅 URL 同步使用（`createVueBridgeNavigation`/`connectVueBridgeRouter`）；history 与 hash 模式皆可 |
| React | 18 / 19（浏览器端） | 普通工程零 react-router-dom 依赖；react-dom 与 React 版本必须兼容 |
| react-router-dom | 6.11 – 7.x | 仅 URL 同步使用；**宿主仅支持 data router**（`createBrowserRouter`/`createHashRouter` + `RouterProvider`），declarative 模式（BrowserRouter）不支持；≥ 6.11（`createMemoryRouter`） |
| 浏览器基线 | Chrome 108+ | 需要相应 ESM、动态导入、顶层 await 支持 |
| 构建目标 | `es2022` 或更新 | 低于该目标构建报 `BLD-002`（TLA 需要） |
| 平台口径 | macOS 与 Linux（CI）实测 | 模板启动器含 Windows 兜底路径但未经验证 |

## 支持的能力面

- 浏览器端组件/模块/页面联邦（Vue↔Vue、React↔React、纯 TS 跨框架消费）；
- Vue 3 宿主 ↔ React 18/19 子应用、React 宿主 ↔ Vue 3 子应用的**子应用级**双向桥接；
- 子应用路由 ↔ 宿主 URL 同步（显式开启）；
- shared 版本协商（singleton/requiredVersion/strictVersion/eager/shareKey/多 shareScope）；
- 动态远程（registerRemote / promise remote）、超时/重试/熔断/显式 fallback；
- dts 类型直连、manifest 预载、setup/onSession 生命周期、CLI 工程辅助。

## 明确不提供

| 能力 | 说明 |
|---|---|
| SSR / RSC / Node 服务端联邦 / Next.js 全栈 | 仅支持浏览器客户端 |
| webpack `script`/`var` 容器互操作 | 产物恒为 ESM remote；`remoteType`/`library` 已删除（传入报 CFG-011） |
| Vue/React 组件级直接混渲染 | 不提供组件类型转换层——**组件可互载**（Vue 应用可 loadRemote 纯 TS 模块、React 应用同样），但 **Vue↔React 组件混渲染不支持**：Vue 的 `remoteComponent` 不能渲染 React 组件，反之亦然。跨框架走子应用桥接（各自管理组件树） |
| JS 沙箱 / 自动 CSS 隔离 | 同 realm 共存 + 依赖级隔离（见[沙箱边界审计](../../maintainers/沙箱边界审计.md)）；全局样式与 `:root` 变量仍可能互相影响 |
| 独立浏览器 DevTools 扩展 | 提供 `window.__FULGURJS_SCOPE__` / `__FULGURJS_INFO__` 调试面 |
| React 页面 KeepAlive | 不承诺组件状态保活（模块复用不等于状态保活）；Vue 侧 `keepAlive` 是页面级可选能力 |
| 其他框架与路由库内置适配 | URL 同步内置 Vue Router / React Router data router；其他库可实现 `BridgeHostNavigation`/`BridgeChildRoute` 端口 |

## 真实限制（与直觉不同的点）

| 限制 | 边界 | 处理 |
|---|---|---|
| expose 的**静态依赖** chunk 失败后同页重试不可恢复 | 浏览器 module map 缓存了该依赖 URL 的失败；插件控制的入口/动态加载边界可通过换 URL 重试，但不保证任意动态依赖 | 默认错误占位提供「刷新页面重试」（用户点击，保留当前地址，永不自动刷新）；不做全站依赖图递归改写。这是当前原生 ESM 加载路径的限制，不是 webpack MF 的共同限制 |
| Vite 8 部分共享场景多下载文件 | 同步消费门面可能把未采用的本地副本拉入模块图（已测双版本场景 ≤2 份；不是所有应用图的上限） | 区分网络文件数与运行时实例数；同 singleton scope 的实例身份仍统一 |
| dev 冷启动预构建窗口 | 新依赖发现可能触发重新预构建 + full reload（DEV-010，首轮 30~60s 瞬态） | 先预热页面再断言；这不是生产限制 |
| singleton 不转换框架 ABI | React 18 renderer 不会因 singleton 协商兼容 React 19 | 对齐版本，或分 shareScope 隔离整组依赖及消费者 |
| 同步消费者遇异步共享裁决 | 配 runtimePlugins 且 hook 异步时，未准备的同步门面报 MFU-004 | 自定义入口先 `await loadShare` 再动态导入消费者；已求值的静态绑定不能追溯改写 |
| 桥接 appProps 是挂载快照 | 顶层字段浅拷贝；之后的顶层替换不重渲染子应用 | 稳定回调 / 共享 store / key 显式重挂 |
| 桥接宿主错误边界捕不到子应用内部错误 | 跨 root 渲染错误归子应用自己的错误边界 | 子应用自建错误处理 |
| 多层桥接路由不自动代理 | A→B→C 时 C 的 URL 同步由 B 自己作为宿主配置 | 每层独立配置；不做多级路由代理 |

## 求证途径

对任何「是否支持 X」的问题，最快的求证路径：

1. 查 [webpack MF 对照 · 当前不提供的能力](../../maintainers/webpack-mf-对照与缺口.md#二当前不提供的能力)；
2. 查对应 Demo 是否覆盖（[示例与模板](../guide/examples.md)）；
3. 用最小 fixture 实测（fixtures/e2e 基建在仓库内可复用，见[维护者 · 测试方法](../../maintainers/testing.md)）。
