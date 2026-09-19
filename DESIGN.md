# @fulgurjs/federation 设计方案 v0.2（全量对齐 Webpack MF 版）

> **品牌**：fulgur，拉丁语「闪电 · 辉光」，取自作者名中「烨」字的意译。
> 系列规划：`@fulgurjs/federation`（模块联邦）→ `@fulgurjs/micro`、`@fulgurjs/dts` …
> 内外命名统一 `fulgur`（`virtual:fulgur-*` 虚拟模块、`window.__FULGUR_*` 调试出口、`FulgurError` / MFU 错误码）。

> 状态：已实现并验证（2026-09-13）。测试结果：单测 76/76、fixtures dev e2e 10/10、容错/HMR-L3 2/2、fixtures prod e2e 8/8（隔离 NGINX 8999）、testbed dev 实测全通、testbed prod（本地 NGINX 测试站点）最小宿主消费真实远程产物实测通过；runtime gzip 4.4KB。已知问题见手册 §7。
> 日期：2026-09-12

## 0. 已锁定的决策

| # | 决策项 | 结论 |
|---|--------|------|
| 1 | 包名 | `@fulgurjs/federation` |
| 2 | 技术栈范围 | Vue 3 生态优先（fixtures / e2e 全部 Vue3） |
| 3 | 兼容旧写法 | 不做（不兼容 originjs 的 `virtual:__federation__`） |
| 4 | Remote 地址 | 一个地址，dev/prod 自动切换（可显式覆盖） |
| 5 | Vite 版本范围 | Vite 5 / 6 / 7 / 8（含 rolldown-vite） |
| 6 | 效果目标 | 与 Webpack Module Federation 配置面 + 运行时行为 100% 对齐，不做残缺版 |

## 1. "100% 对齐"的精确定义

**Vite ↔ Vite 场景**（宿主和远程都是 Vite 项目）：
- 配置面 100%：webpack 官方 `ModuleFederationPlugin` 的每一个选项都有对应实现（见 §2A/§2C）
- 行为语义 100%：版本协商、容器 init/get、异步边界、singleton/strictVersion、动态 remote、错误码——逐条按 webpack 语义实现并有 e2e 验收（见 §2B）

**唯一例外**：`remoteType: 'script' / 'var'`（Vite remote 被 Webpack 宿主消费的跨打包器互操作）列为 P3 里程碑，不进首发承诺（见 §5）。

## 2. 配置面对齐总表

### 2A. 核心配置（webpack 官方文档全部选项）

| # | webpack 选项 | fulgur | 实现方式与语义说明 |
|---|---|---|---|
| 1 | `name` | ✅ | 容器名；同时作为 uniqueName 决胜来源。重名冲突构建期检测并警告（对齐 webpack 对 `output.uniqueName` 的要求） |
| 2 | `filename` | ✅ | remoteEntry 文件名，稳定命名，利于 CDN 长缓存 |
| 3 | `exposes` 字符串形式 | ✅ | `{ './Button': './src/Button.vue' }` |
| 4 | `exposes` 对象形式 | ✅ | `{ import, name }`，`name` = 稳定 chunk 文件名（对齐 webpack：不写则内部 id、随构建变化） |
| 5 | `remotes`（`app1@url` 语法） | ✅ | 完整支持。`@` 前名称与 remote 自报 `name` 不匹配 → 校验报错（对齐 webpack）；键可重命名（`checkout: "shop@..."`，导入前缀用 checkout） |
| 6 | `remotes` 对象形式 `{ external, shareScope }` | ✅ | 单个 remote 独立 shareScope |
| 7 | `remotes` promise-based remote | ✅ | 值为函数返回 `Promise<container>`，支持运行时选环境/选版本 |
| 8 | `remoteType` | 🔶 | 默认 `'module'`（ESM 动态 import remoteEntry）。`'script'/'var'` 属跨打包器场景 → P3 |
| 9 | `library` | 🔶 | 同 remoteType |
| 10 | `runtime`（命名 runtime chunk） | ✅ | prod 抽独立 runtime 文件；dev 无 chunk 概念，等价单独 serve |
| 11 | `runtimeChunk` | ✅ | `boolean \| 'single'` |
| 12 | `shareScope`（顶级） | ✅ | 默认 `'default'` |
| 13 | `shared` 数组形式 | ✅ | `["vue"]`——version 与 requiredVersion 从 package.json 推断，推断失败警告 |
| 14 | `shared` semver 简写 | ✅ | `{ vue: "^3.4.0" }` |
| 15 | `shared` 完整 hint ×9 | ✅ | `eager` / `import` / `packageName` / `requiredVersion` / `shareKey` / `shareScope` / `singleton` / `strictVersion` / `version` 全部支持。`requiredVersion` 支持完整 semver range 语法（精确/部分/比较器/连字符/`||`/URL）+ `false`；`strictVersion` 默认值逻辑照抄 webpack（有本地 fallback 且非 singleton → true） |

### 2B. 运行时行为语义（"效果一模一样"的实体，逐条 e2e 验收）

| # | webpack 行为 | fulgur 验收语义 |
|---|---|---|
| 1 | 版本协商：消费方拿到 scope 中**满足其 requiredVersion 的最高版本** | e2e 断言双版本场景加载的是高版本 |
| 2 | 多版本共存（非 singleton、不同 requiredVersion 可并存） | e2e 断言两版本模块图并存且各自正常 |
| 3 | 已加载的版本永不替换 | e2e：先加载 → 注册更高版本 → 断言仍用已加载版本 |
| 4 | 同版本冲突按 uniqueName 决胜 | 单测 + 构建期重名警告 |
| 5 | `init()` 收养语义：双向供给、兄弟 remote 互享、嵌套传播（带循环图守卫） | e2e：remote-A 提供的 shared 版本，remote-B 直接复用 |
| 6 | 对同一容器用不同 scope 重复 `init()` → 抛错 | e2e 断言错误文案 |
| 7 | 容器 API `get('./X')` / `init(scope)` 直接可用（用户可手写容器协议） | e2e：绕过语法糖手工加载成功 |
| 8 | singleton 冲突 → 控制台 warning + 使用已注册版本 | e2e 断言 console 警告与最终版本 |
| 9 | strictVersion 不满足 → 运行时抛错 | e2e 断言抛错 |
| 10 | `import: false` → 不提供本地副本，缺版本即失败 | e2e |
| 11 | `shareKey` 重定向（导入 `lodash-es` 复用以 `lodash` 共享的模块） | e2e |
| 12 | 多 shareScope 命名空间互相隔离 | e2e |
| 13 | `eager: true`：初始 chunk 同步可用 + provided/fallback 总被下载 | e2e 网络断言两个都要 |
| 14 | 动态 remote：构建时 URL 未知，运行时注册 | e2e：URL 来自接口 → `registerRemote` → `loadRemote` |
| 15 | 静态 remote 自动加载；加载失败 → 等价 `ScriptExternalLoadError` 的统一错误码（MFU-0xx 体系） | e2e：kill remote 断言错误码 + UI 错误边界 |
| 16 | `import('app1/Button')` 语法 + default/named unwrap 语义 | 所有用例的基础断言 |
| 17 | exposed 模块的样式自动随模块注入（dev / prod 都生效） | e2e：远程组件样式生效断言 |
| 18 | 异步边界：fulgur **自动注入**（等效 `automaticAsyncBoundary: true` 默认开启），用户不需要 webpack 的 bootstrap.js 手工模式；提供开关可关 | e2e：不写 bootstrap 直接跑通 |

### 2C. MF 2.0 / @module-federation/enhanced 配置

| # | 选项 | fulgur | 说明 |
|---|---|---|---|
| 1 | `manifest` | ✅ | `mf-manifest.json`（资源清单 + 版本 + 公共路径），部署回滚 = 切 manifest 指针 |
| 2 | `runtimePlugins` | ✅ | runtime 钩子 API（init / get / loadShare 前后钩子） |
| 3 | `dts` | ✅ | dev：tsconfig paths 直连 remote 源码；build：提取 exposes 的 `.d.ts` 随产物发布，host 缓存 `node_modules/.mf-types` |
| 4 | `automaticAsyncBoundary` | ✅ | 默认开启（见 2B-18） |
| 5 | `dataPrefetch` | ✅ | `preloadRemote(name, { mode })`，manifest 驱动精确预载 chunk 依赖图 |
| 6 | Chrome DevTools 扩展 | ❌ 不做 | 深度绑定 MF runtime 生态；以 `window.__MF_SCOPE__` 调试出口替代（share 协商结果、已加载 remote、耗时） |

## 3. 比 webpack 更进一步的点

1. **自动异步边界**——webpack 要求手工 `import('./bootstrap')`，fulgur 自动注入，配置零改动
2. **类型直连**——dev 下 remote 的补全与跳转是真源码级（webpack 需要额外 dts 工具链折腾）
3. **runtime 内核 gzip < 5KB**（CI 硬指标，对比 @module-federation/runtime 的 40KB+）
4. **一套配置 dev/prod 自动切换**——webpack 的 dev/prod 配置经常分裂两份
5. **tree-shaking 天然更优**——Rollup/Rolldown 的 ESM 静态分析优于 webpack 对 shared 的 usedExports 处理

## 4. HMR 对齐承诺（dev 体验）

webpack 里 remote 模块 HMR 天然可用（同一构建系统）。fulgur 通过 host↔remote 双 dev-server HMR 桥对齐，分三档自动化验收：

- L1 组件热替换成功（页面不整页刷新）
- L2 状态保留（组件热替换后 local state 不丢，对齐 vue HMR 行为）
- L3 编译报错 → 页面覆盖层提示 → 修复后自动恢复

remote 样式改动立即生效；host 自身业务 HMR 不受影响。

## 5. 诚实边界

`remoteType: 'script'/'var'` = 让 webpack 宿主消费 Vite remote（跨打包器互操作）。真实需求存在但成本高、依赖 webpack 端 shim，列为 **P3 里程碑**，首发承诺范围是 Vite↔Vite 的 100%。

## 6. 测试与验证计划（真实项目实测版 v2）

**分层策略**：fixtures 快扫（配置全量矩阵）+ 真实同族工程副本（testbed）深测（dev + NGINX 生产双环境）+ 单测/产物断言托底。全部可脚本化重复执行，不靠手动。

### 6.1 测试基座：真实同族工程副本（testbed）

- 来源：从真实工程本地拷贝（原件只读不碰，副本独立安装依赖；副本不入学件仓库）
- 角色分配：宿主（Vite **6.4.3**）= MF 宿主；远程×2（Vite **5.1.4 / 5.2.12**，两家不同组件库体系）= MF 远程——刻意覆盖跨 Vite 版本与异构体系
- 改造原则：**现有 qiankun 集成一律不动**（原路径保留，可随时回归对比），新增 MF 平行通道——admin 增加"联邦体验"路由页，经 loadRemote 加载两个 remote 暴露的模块
- exposes 素材（每个 remote 三类，避开登录墙）：纯 UI 组件 / 纯工具函数模块 / 带样式的业务组件
- shared 真实素材：vue@3.5.22（singleton）+ pinia@2.1.7（singleton）+ element-plus（bpm 2.9.1 vs lowcode 2.10.2，**真实双版本共存场景**）
- 后台：本地后台地址（按各自环境在副本 .env.backend 配置，连通性以 200 实测为准）

### 6.2 环境矩阵

| 环境 | 组成 | 验证内容 |
|---|---|---|
| A. 真实工程 dev | 三 dev server 并跑，接口按 base 代理到本地后台 | §2B 18 条语义中 dev 可测全部条目 + HMR L1/L2/L3 + shared 单例（网络面板计数）+ remote 带 base 的路径处理 |
| B. 真实工程 prod + NGINX | 三应用构建 → 测试站点 serve + 反代后台 | §2B 18 条中 prod 可测全部条目 + gzip/缓存头 + 同源接口 + remoteEntry/manifest 可达性 |
| C. fixtures 矩阵（快扫） | Vite 5/6/7/8 × {vue单例/不共享/双版本/冲突} × exposes{组件/工具/CSS} | §2A/§2C 配置项全量（每项至少一用例） |

### 6.3 NGINX 实测规范（本机 NGINX 1.31.4，homebrew）

- 新增独立端口 NGINX 测试站点（不碰用户现有站点）：root 指向测试副本 dist；SPA 回退 + remoteEntry/manifest no-cache + 反代后台（含 WebSocket Upgrade 三件套）
- 流程：`nginx -t` 校验 → reload → curl 冒烟（remoteEntry 200 / manifest 200 / CORS 头 / gzip 生效）→ Playwright 全量 prod e2e
- 附带发现：8661 站点 302 是正常行为（`/ → /main` 重定向）；8088 的 500 是 touch 应用 dist 缺失所致，与本插件无关，不处理

### 6.4 Vite 8 查证结论（2026-09）

- Vite 8 = Rolldown（Rust 统一打包器，替换 esbuild + Rollup），插件 API 兼容 Rollup/Vite
- **没有原生内置模块联邦**：Rolldown 团队官方声明不做原生 MF、走插件生态路线；voidzero（Vite/Rolldown 团队）官方推荐 `module-federation/vite`。"原生支持"是误传——实际是 Rolldown 的构建能力让 MF 插件能做得更好
- 对本插件影响：Vite 8 下**不需要换实现**（适配验证即可），但 Rolldown 的 transform/虚拟模块行为差异必须进 C 层矩阵（fixture 增设 vite8 组），prod 改写器保持 Rollup / Rolldown 双路径断言

### 6.5 功能全量尝试验证

- §2A/§2C 每个配置项 → fixtures 至少 1 用例
- §2B 18 条运行时语义 → 真实项目副本 dev + prod(NGINX) 双环境各跑一遍，fixtures 兜底
- 每用例统一断言：DOM 渲染正确、shared 单例网络计数、console 干净、（dev）HMR 无刷新
- 容错专项：kill remote dev server / NGINX 摘除 remoteEntry → 错误码 + UI 错误边界 → 恢复后自动重载
- 基准：runtime+remoteEntry gzip < 5KB 红线；与 originjs / @module-federation/vite 同场景对比；dev 冷启动与 remote 首载耗时

### 6.6 单测与产物断言（托底层）

1. **单测（Vitest）**：semver 全语法解析（精确/部分/比较器/连字符/`||`/URL/false）；版本协商全分支（最高版本/已加载不替换/uniqueName 决胜/singleton/strictVersion/import:false）；AST 改写快照（输入源码→输出源码）；manifest 生成与解析 roundtrip；runtime 重试/熔断（fake timers）
2. **产物断言（Node 层，快）**：build 后扫描 dist——remoteEntry 稳定文件名、每个 expose 独立 chunk、shared 剥离、exposes 对象形式稳定 chunk 名、manifest 完整、无顶层 await 泄漏（非 esnext target）

### 6.7 浏览器真实测试与截图证据规范（强制）

- **所有功能验证必须浏览器真实打开页面执行**（Playwright 接管真实 Chromium），禁止只看 console/日志下结论
- **每个功能验证都必须产出截图证据**，随 e2e 脚本自动截图到 `docs/screenshots/`，命名规则 `{环境}-{功能}-{序号}.png`，如 `dev-hmr-l1-before.png` / `dev-hmr-l1-after.png`、`prod-nginx-shared-single.png`
- **截图必须能看清验证内容**：涉及数据/状态的断言配合 DOM 高亮或表格化验证页（测试专用浮层显示 share scope 实际协商结果、已加载 remote、请求数），保证"截图即证据"
- **dev 与 prod（NGINX）两套截图各自备齐**，手册按环境归档引用
- 手动冒烟（如后台接口连通、NGINX reload）同样截图留证

## 7. 交付物：HTML 使用手册（测试完成后编写）

单文件 HTML（`docs/manual.html`，双击浏览器打开即可浏览全部功能，无外部服务依赖）：

1. **功能总览**：§2 配置对齐表直接入册——每个 webpack 选项/运行时语义一行，标注 **与 webpack 原版一致性**（✅ 完全一致 / 🔶 适配差异 + 差异说明），明确回答"是否和 webpack 一模一样"
2. **快速开始**：安装、remote/host 配置完整代码块（高亮），配 vite.config 实际文件截图
3. **逐功能章节**：每个功能一节 = 功能说明 + 配置代码 + 操作步骤（点击哪、打开哪）+ **dev 截图 + prod 截图 + 断言说明**（截图来自 §6.7 的实测证据，非摆拍）
4. **dev/prod 环境对照章节**：同一功能两环境的行为与截图并排展示
5. **已知差异与限制章节**：诚实列出（如 remoteType script/var 为 P3、Chrome DevTools 不做等）
6. **故障排查**：常见错误码 MFU-0xx、NGINX 配置样例、后台代理配置样例

## 7. 里程碑（每阶段 = 对应测试全绿）

| 阶段 | 内容 | 验收 |
|---|---|---|
| M0 | 脚手架 + 测试框架 + CI 骨架 | 空插件跑通一条 e2e |
| M1 | prod 核心闭环：exposes / remotes / 基础 shared / remoteEntry / manifest | 产物断言 + e2e 渲染全绿 |
| M2 | dev 核心闭环：双 dev-server 协作 + shared 拦截 | dev 矩阵 e2e 全绿 |
| M3 | shared 全语义（§2A-15 + §2B-1~13）+ 容器 API + 动态 remote + promise remote | 协商专项 e2e 全绿 |
| M4 | HMR 全链路 | L1 → L2 → L3 逐级验收 |
| M5 | dts 类型 + runtimePlugins + preload/prefetch | 类型补全冒烟 + 产物断言 |
| M6 | 容错（重试/熔断/fallback URL/错误码体系）+ 体积基准 + Vite 5/6/7/8 矩阵全绿 | CI 报告 |
| M7 | HTML 使用手册（§7 交付物），全部章节引用实测截图 | 手册双击可浏览，dev/prod 截图齐备 |
| P3 | 跨打包器互操作（remoteType script/var） | 单独立项 |

**验收环境补充**：
- M0 前置动作：建立 testbed 副本 + NGINX 测试站点配置 + 后台连通性基线（200 实测验证）
- M2（dev 闭环）验收加：副本三 dev server 实测
- M3（shared 全语义）验收加：element-plus 双版本共存（bpm 2.9.1 vs lowcode 2.10.2）实测
- M6 验收加：NGINX 测试站点 prod 全量 e2e 绿 + 后台接口经反代连通
