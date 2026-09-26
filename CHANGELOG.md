# Changelog

## 4.3.1（2026-09-26）

- 将插件自身的配置、共享依赖和远程加载诊断改为中文，保留错误码与原始底层异常；修复 `MFU-010` 将多个兼容候选版本误判为冲突的问题，真正不兼容时显示原因与修法，并对同一版本组合去重。
- 移除基于裸导入前缀猜测“漏配远程”的提示；它会将 `vite/modulepreload-polyfill`、`@vue/runtime-dom` 等普通依赖误报为远程配置问题。真正无法解析的导入仍由构建工具报错。
- 中文诊断使运行时 gzip 从 7547B 增至约 8649B；体积门禁由 8192B 调整为 9216B，仍限制无意增长。

## 4.3.0（2026-09-25）

### 修复（4.2.1 复核问题）

- **`check-pages` 远程地址全形态推导**：新增 `manifestUrlForRemoteAddress` 共享解析（与运行时同语义）——绝对 prod 地址支持目录 URL / 完整 `fulgurjs-remoteEntry.js` URL / `name@url` 前缀 / `fulgurjs-manifest.json` 直链；`name@url` 形态此前被 `^https?://` 门禁误判为相对地址而报「无法验证」。相对 prod + `--site` 组合同样经统一推导。
- **`check-pages` manifest 来源优先级**：显式 `--manifest` > 显式 `--site`（只用指定来源，失败=「无法验证」）> 本地 dist（仅在未指定任何线上来源时兜底）。修复旧聚合配置在 `--site` 指定死地址时仍回退本地旧 dist 并退出 0 的问题——指定线上站点验证时不再可能被本地产物冒充。来源报告带实际命中 URL（含 localhost 回退）。
- **CLI 独立目录 TS 配置加载**（`app-config.ts`）：esbuild 定位改为「受控编译器」——候选（配置工程直连 → 经 vite 传递依赖 → CLI 自身依赖树）必须先通过 `satisfies` 语法能力探针（esbuild ≥0.14.49），不再按「找到就用」收编偶然悬挂的旧版（曾实测 esbuild 0.11.23 使合法配置报 `Expected ";" but found "satisfies"`）；`esbuild` 成为包直接依赖（^0.27.0），无本地 Vite 的独立目录 `init`/`explain` 开箱可用（Node 18/24 实测）。
- **CLI localhost 回环回退**：Node 18 的 fetch 将 `localhost` 只解析到 `::1`（本机服务通常只监听 IPv4），CLI 抓取 manifest 失败时自动改试 `127.0.0.1` 并以实际命中的 URL 作为来源报告（Node 18 下 `--site http://localhost:8662` 不再误报「无法验证」）。

### 文档订正

- **remoteEntry 缓存语义统一**：修正「固定文件名利于 CDN 长缓存」与部署章节「必须 no-cache」的自相矛盾——统一为「文件名稳定便于引用，入口内容每次构建变必须 no-cache；只有带内容哈希的 chunk 才可长缓存」。
- **README「真实工程验证」表述**：移除「27 页零报错、逐页写操作闭环」等以 23/23 页有字为证据的过度结论，改为「以 26 条页面记录 + 27 个菜单入口的逐项业务断言为准，结论见对应版本验收报告」。
- **示例重构**：`examples/fulgurjs.config.example.ts`（无默认导出、不可运行）拆为 `examples/remote-a/` 与 `examples/host/` 两个真实可复制、可 CLI 校验的单项目配置（含最小源文件），附 README 复制方法。

### 修复（续）

- **`createHostPages` 异步组件包装结构回归 4.2.1 已验证形态**：直接命名 `defineAsyncComponent`
  包装器（按 spec 独立创建，不触碰远程模块导出对象），移除外层 stateless `defineComponent`
  包装——外层包装会在「保活页 → 登出/切换布局」的卸载路径上触发 Vue core
  `parentComponent.ctx.deactivate is not a function`（KeepAlive + async component 竞态，
  vue 3.5.43 实测复现）。
- **会话组件缓存只在新的非空 `sessionKey` 出现时重置**：登出（sessionKey 变 undefined）不清缓存——
  `clearAppContext` 后路由过渡期宿主布局仍会重渲染当前联邦页，此刻重建组件会让 KeepAlive
  在激活路径上换子组件。会话语义不受影响：onSession 去重由 runtime 在 `loadRemote` 时按当前
  sessionKey 判定；下一次登录出现新代次 ID 时缓存照常重置。

### 性能

- **整远程预载默认关闭**（宿主桥模板契约）：`PREFETCH_REMOTES` 默认 `[]`——首次进入联邦页只下载该页所需资源（dashboard 不再因登录而预载全部 expose 清单）。`preloadRemote('remote')` 显式整远程预载能力保留；README §9.1.3 新增四层区分（路由表声明 / 页面真实加载 / 单页预取 / 整远程预取）与「预取是下载不等于执行」语义。

## 4.2.1（2026-09-25）

### 修复

- **`check-pages --require-verified` 退出码语义**：此前只要传了该开关，即使全部页面验证命中也以非零退出（开关位被误当结果位）。现按「`--require-verified` 且实际存在无法验证项」判定——registry fixture 验收中发现（4.2.0 发布后），补回归用例。

## 4.2.0（2026-09-25）

### 新能力：每项目一份 `fulgurjs.config.ts`（单项目契约，默认主路径）

- **默认导出直接是 `federation()` 选项**：`fulgurjs.config.ts`（应用根目录）默认导出
  `satisfies FederationOptions` 的选项对象，`vite.config.ts` 只需
  `import fulgurjsConfig from './fulgurjs.config'` + `federation(fulgurjsConfig)` 一次注册——
  无 `loadRepoConfig`/`federationOptionsForApp`/父目录配置/应用名字符串查找。宿主与远程分属
  互不相邻的仓库时各自独立构建/部署/诊断（只声明对方 URL 与容器名）。
- **宿主页面核对数据具名导出 `hostPages`**（`{ pages, remotePrefixes, deriveSpec? }`）：仅供
  CLI `explain`/`check-pages` 读取，与运行时 `createHostPages` 消费同一份数据模块——页面表
  唯一手工维护位置，`check-pages` 核对的就是浏览器实际使用的页面数据。
- **CLI 配置加载器**（内部，不入项目 Vite 代码）：以原配置文件为解析基准 esbuild-bundle
  （支持项目内相对导入的纯数据模块、extensionless、Node ≥ 18、pnpm 严格布局经 vite 依赖树
  解析 esbuild）；缺失文件/无 name/字段形状错/expose 指向项目外或不存在文件三段式报错。
- **CLI 单项目化**：`init` 默认生成单项目起步模板（不再生成聚合配置样板）；`explain`
  按**实际 federation 选项**判角色（配 remotes=消费、配 exposes/setup=提供，两者均有=双角色），
  单项目形态免 `--app`；`check-pages` 支持 `--manifest <remote>=<路径|URL>`（可多次）、
  `--site` 按消费方 prod 地址推导、输出每个 remote 的 manifest 实际来源、
  `--require-verified` 严格模式（无法验证也非零退出）。
- **`FederationOptions` 类型公开导出**（4.1.0 已导出，4.2.0 起为单项目契约的正式依赖）。

### 行为变更

- **`fulgurjs init` 只生成配置起步模板**：不生成桥/路由/启动器/NGINX 文件（NGINX 内容仅作
  打印样板随旧聚合配置输出）。README/迁移指南同步订正：删除不存在的 `host.prefetch` 配置面
  说法（预载名单 = 宿主桥 `PREFETCH_REMOTES` 常量）。
- **旧聚合配置（`root + apps[]`）自动识别、兼容期保留**：`defineRepoConfig`/`loadRepoConfig`/
  `federationOptionsForApp` 行为不变（`explain`/`check-pages` 需 `--app`）；但文档主路径、
  `init` 模板与示例一律为单项目形态。`explain` 对聚合配置同样按实际选项判角色（双向联邦
  应用显示「双角色」）。

## 4.1.0（2026-09-24）

### 新能力：远程初始化生命周期 + 宿主页面适配器 + 单配置驱动

- **`federation({ setup })` 远程初始化（可选）**：声明初始化入口文件（默认导出 `setup(context)` 应用级执行一次，可选具名导出 `onSession(context)` 按宿主 `sessionKey` 去重执行；换账号/重登自动重跑，退出 `clearAppContext()` 清理会话状态）。`loadRemote('remote/模块')` 是统一触发入口（容器 init 后、返回模块前）；`loadRemote('remote')`、`getContainer()`、`preloadRemote()` 不执行初始化。失败显式报错可重试：`MFU-011`（导出非法）/ `MFU-012`（执行失败）/ `MFU-013`（有 onSession 缺 sessionKey）/ `MFU-014`（自递归）。内部 expose 键 `./__fulgurjs_setup__`（CFG-012 拦截占用），不进 dts/公开 exposes 清单。旧的「expose 启动器 + 宿主手动 loadRemote 调用」写法继续可用（兼容形态）。
- **`createHostPages({ pages, remotePrefixes, ... })` 宿主页面适配器**：一份页面表供宿主路由与布局共用；URL 解析（base 剥离/深链/参数解码失败不崩）、最长前缀远程归属、`definePages` R1–R5 校验、异步组件缓存（会话切换自动重建）、骨架屏/错误占位、保活名称内置。包装组件不修改远程模块导出对象。
- **`federationOptionsForApp(config, app)`**（`@fulgurjs/federation/config`）：仓库配置直转 Vite 插件选项（name/remotes/exposes/setup/shared/devSharedSelf）；同键不同地址报错带两边值。`HostConfig.pages` 转为可选（应用代码页面表为运行时真源），新增 `deriveSpec`/`devSharedSelf` 字段。
- **`clearAppContext()`**：退出清理——删 context + 作废全部远程会话信号与 onSession 去重状态；不重置模块缓存/共享模块图/应用级 setup。无运行时单例时静默幂等（不阻断登出）。
- **CLI**：`fulgurjs explain`（配置解释器：角色/remotes/exposes/setup/shared/页面映射/devSharedSelf 来源/加载链，纯本地）；`fulgurjs check-pages`（页面表 ↔ 远程 manifest exposes 契约核对，确定性错误非零退出，远程不可达报「无法验证」）。

### 行为变更

- **`devSharedSelf` 角色推断（§12.4）**：提供 `exposes`（或 `setup`）的应用默认 `true`（此前双向联邦默认 `false`、README 要求显式 `true`——漏配曾是已知错误配置来源）；纯宿主默认 `false`；显式配置永远优先。
- **不支持选项硬报错（§12.6）**：`remoteType` 非 `module`、`library.type` 非 `module/esm`、`automaticAsyncBoundary: false` 从「warning + 静默回落」改为配置期 `CFG-011` 报错；`remoteType` 类型收窄为字面量 `'module'`。
- **runtime gzip 门禁 6144B → 8192B**：setup/onSession 生命周期固有增量（4.1.0 实测 7585B）。
- `@fulgurjs/federation/runtime` 新增导出：`clearAppContext`、`createHostPages`；类型新增 `RemoteSetupContext`、`RemoteSetupModule`、`HostPages`、`HostPagesOptions`、`ResolvedHostPage`；`AppContext` 新增 `sessionKey` 字段。

## 4.0.0（2026-09-24）

### 应用代码改用物理入口

- 唯一公开应用入口改为 `@fulgurjs/federation/runtime`，提供实际的 ESM 文件与类型声明；配置入口仍为包根和 `/config`。
- `virtual:fulgurjs-api` 与 `@fulgurjs/federation/client` 删除。3.x 用户将应用导入改为 `/runtime`，并清除 tsconfig 中的 `client` 类型项及旧生成的 `fulgurjs-runtime.d.ts`。
- 开发态 exposes 使用内部页面级代理；`remoteComponent()` 保持同步返回 Vue 组件。`remoteSchema` 静态具名导入由插件拆出，非开发环境为空清单。
- Vue 适配层与运行时内核分离，公开 ESM 图只引用一份 `runtime.js`。
- `/runtime` 只提供 ESM `import` 条件，使用时需安装 Vue；包根和 `/config` 的 CJS 条件不变。新入口沿用 3.0.x 实际 JS 门面的值导出，不提供 `runtime` 对象或 default（旧 `client.d.ts` 曾多声明这两项）。

| 旧应用写法 | 4.0.0 写法 |
|---|---|
| `virtual:fulgurjs-api`（3.0.x） | `@fulgurjs/federation/runtime` |
| `virtual:fulgurjs-runtime`（≤2.x） | `@fulgurjs/federation/runtime` |
| `@fulgurjs/federation/context`、`/pages`、`/vue`（≤2.x） | `@fulgurjs/federation/runtime` |
| `import remoteSchema from 'virtual:fulgurjs-remote-schema'` | `import { remoteSchema } from '@fulgurjs/federation/runtime'` |
| tsconfig `types` 中的 `@fulgurjs/federation/client` | 删除该项；类型由 `/runtime` 的包导出解析 |

## 3.0.1（2026-09-24）

### 修复

- **runtime-proxy 的 `parseSpec` 保持同步语义**：3.0.0 的 serve 门面把 runtime 部分转发到惰性单例委托时，`parseSpec` 也在 promise 转发列表里——同步纯函数经 promise 转发返回 Promise，返回对象的属性全部为 undefined。修复：`parseSpec` 同步直读页面级单例（时序契约同 shareScopeMap）。


## 3.0.0（2026-09-24）

### 破坏性变更：应用代码唯一 API 入口 `virtual:fulgurjs-api`

应用代码的一切联邦导入收敛为一个虚拟模块；旧入口从包 exports 白名单删除（import 即解析失败）。

**迁移映射**：

| 3.x 之前 | 3.0.0 起 |
|---|---|
| `import { loadRemote, … } from 'virtual:fulgurjs-runtime'` | `import { loadRemote, … } from 'virtual:fulgurjs-api'` |
| `import { provideAppContext, getAppContext, requireAppContext } from '@fulgurjs/federation/context'` | 同一来源改为 `'virtual:fulgurjs-api'` |
| `import { definePages, validatePages } from '@fulgurjs/federation/pages'` | 同一来源改为 `'virtual:fulgurjs-api'` |
| `import { remoteComponent } from '@fulgurjs/federation/vue'` | 同一来源改为 `'virtual:fulgurjs-api'` |
| `import remoteSchema from 'virtual:fulgurjs-remote-schema'`（default） | `import { remoteSchema } from 'virtual:fulgurjs-api'`（具名） |

不变（构建期/配置面，非应用代码导入）：`vite.config.ts` 的 `import { federation } from '@fulgurjs/federation'`、`fulgurjs.config.ts` 的 `import { defineRepoConfig } from '@fulgurjs/federation/config'`、tsconfig 类型入口 `@fulgurjs/federation/client`。`virtual:fulgurjs-runtime` 保留为插件内部实现细节（门面/容器入口/改写管线引用），不再是公开 API。

技术说明：serve 形态的门面对 runtime 部分转发惰性单例委托（远程页面导入不拉起副本链），prod 形态为静态 re-export（各副本经 `globalThis.__FULGURJS_RUNTIME__` 收敛）；`remoteComponent` 在 dev 下调用期惰性加载。类型声明整体聚合到 `virtual:fulgurjs-api`（`@fulgurjs/federation/client`）。

### 破坏性变更：2.x 全部旧入口不再可用

`@fulgurjs/federation/pages`、`./context`、`./vue` 子路径的 d.ts/typesVersions 映射同步删除。升级方式：全局搜索上述五个旧来源，按映射表替换为 `virtual:fulgurjs-api`（`fulgurjs init` 生成的模板与核对清单已全部是新写法）。


## 2.1.0（2026-09-23）

### 兼容性与健壮性强化（WP1~WP8，方案见 docs/兼容性与健壮性强化实施方案.md）

- **新增单一 API 入口 `virtual:fulgurjs-api`**：一个虚拟模块拿全联邦 API（runtime 全部公开函数 + `definePages` / `validatePages` + `remoteSchema`）；旧入口（`virtual:fulgurjs-runtime`、`@fulgurjs/federation/pages`、`virtual:fulgurjs-remote-schema`）全部继续可用且与新旧入口收敛同一运行时单例。
- **修复 auto-import 后置注入绕过门面化的一类缺陷**（WP1）：unplugin-auto-import 的 vite 适配器硬编码 `enforce: 'post'`，注册在 federation() 之后时其注入的 shared 导入会静态绑定本地副本（双响应性系统：ref 赋值不触发渲染）。修复 = 解析期兜底改道（已被本插件改写过的模块内后置出现的裸 shared specifier → 协商命名空间门面），与插件注册顺序无关。
- **manifest 契约**（WP4）：`fulgurjs-manifest.json` / dev manifest 携带 `schemaVersion: 1`；Node 侧消费端（dts / remote-schema probe / doctor）统一经契约校验器取数；未知主版本拒绝消费并给出诊断（不再静默当空 manifest）；2.0.x 无 schemaVersion 形态按 v1 兼容。
- **修复根相对 remote 地址的资产解析**（WP4）：`remotes: { x: { prod: '/xxx' } }` 目录形态 entry 下，manifest 相对资产此前解析到站点根（404）；现按 entry 所在目录解析。manifest fetch 增加 8s 超时。
- **dts 路径边界**（WP5）：dev manifest 的 `exposes[].src` 只接受相对路径（拒绝绝对路径 / `..` / 空）；`fsRoot` 与目标 realpath 后做包含判定（symlink 逃逸拒绝）；异常 remote 只跳过自身不落半截声明；生成声明中的模块名统一合法 TS 字符串序列化。
- **新增 `devCorsOrigins` / `devFsRoot` 选项**（WP5）：dev 跨源访问策略统一（插件端点与 server.cors 同一来源；用户显式 `server.cors` 永远优先；数组按 Origin 反射 allowlist）；`devFsRoot: false` 时 dev manifest 不携带本机路径。非 loopback host 下通配 CORS / fsRoot 暴露分别提醒（DEV-011 / DEV-012）。
- **运行时容错**（WP6）：注册表全部无原型字典（`__proto__` / `constructor` 等键不再误读误写原型链）；`registerRemote` 参数校验当场抛错（`timeout` 有限正数 / `retries` 0..10 整数 / `breaker` 有限正数；配置期 CFG-009 先拦）；熔断 `threshold`/`resetMs` 按 remote 生效（重复注册刷新参数、保留计数状态）；重试退避封顶 4s + 随机抖动；entry 动态 import 单一 in-flight（超时≠取消，慢成功后容器 init 恰一次）；promise remote 的解析受 timeout 约束；观测 hook（`beforeLoadRemote`/`afterLoadRemote`）抛错只告警不改写加载结果、决策 hook（`resolveShare`）抛错向调用方传播；MFU-001 错误信息对 URL 脱敏（去凭证与 query）。
- **新增 `parseSpec` 运行时导出**（WP7 顺带修复）：类型声明早已存在但 runtime bundle 未导出（导出面漂移），现补齐。
- **受控诊断 `DEBUG=fulgurjs:*`**（WP8，默认关闭）：`FULGURJS_DEBUG` / `DEBUG` 环境变量开启分类诊断（`transform` / `facade` / `manifest`，JSON → stderr）；模块路径脱敏（root 内相对路径、root 外仅文件名），不输出源码文本与凭证；替代一切 /tmp 临时日志。
- **错误码新增**：CFG-009（remote 运行参数非法）、CFG-010（devCorsOrigins 形态非法）、DEV-011 / DEV-012（非 loopback 暴露面提醒），总数 31 → 35（三方一致性门禁自动校验）。
- **测试与 CI**（WP1~WP3）：新增 fixtures `remote-auto` / `host-auto`（auto-import 插件链回归）；真实构建单测覆盖双引擎（Rollup 6.4.3 / Rolldown 8.3.0）× 双注册顺序 / manualChunks 对象/函数/无/数组四形态 / 危险环检测器 / manifest 资产存在性；prod-setup.sh 隔离改造（mktemp 专属目录、8999 被占自动选空闲端口、`--stop` 只停自己启动的实例）；CI 新增 prod-e2e（runner 内 NGINX）、vite5 每周定时兼容（vite@5.1.4）、tarball consumer smoke（npm pack → 临时 consumer → exports/类型/build/dev 加载）作业。


## 2.0.3（2026-09-23）

### 修复（production remote CSS manifest / preload）

- **修复 expose manifest 漏报 CSS**：Vite 可将 expose 导入的全局 CSS 归属到其静态依赖 chunk；此前插件只读取 expose facade 自身的 `viteMetadata.importedCss`，导致样式不进入 `fulgurjs-manifest.json`。现在在 `generateBundle` post 阶段递归收集 expose 静态依赖图中的 CSS，再写入对应 expose 条目。
- **修复根相对 remote 地址**：配置 `prod: '/lowcode'` 时也能生成 `/lowcode/fulgurjs-manifest.json`；保留绝对地址与协议相对地址的 origin/path 语义。
- **运行时按 expose 加载样式**：`loadRemote('remote/Expose')` 在 manifest 可用时预载该 expose 的 JS chunk 与 CSS，并等待 stylesheet load/error 后再返回模块；仅传 remote 名时保留预载全部 exposes 的行为。CSS 失败报告 `MFU-007`，不阻断 JS 模块加载。
- **补齐 build 后置转换**：build 阶段允许处理 pre 阶段标记过、但随后由 auto-import 等插件注入新 import 的模块；依赖 `transformModule` 幂等，serve 路径维持原有重复处理守卫。
- **回归验证**：覆盖静态依赖 chunk 持有 CSS、根相对 manifest URL、请求 expose 的 CSS 预载与等待行为；8662 实际运行态认证弹窗验收 computed `z-index: 5000`。

## 2.0.2（2026-09-22）

### 修复（D6：双向宿主 devSharedSelf 开启后 prod 构建产物 chunk 循环崩溃）

- **缺陷**：双向联邦宿主（既 expose 又消费 remote）按文档口径设置 `devSharedSelf: true` 后，
  `vite build` 成功但 prod 运行时崩溃——`SyntaxError: Unexpected token '<'`（chunk 被 SPA 回退）
  + `TypeError: _e is not a function`（协商函数未初始化）。仅在「宿主 + 用户 manualChunks 强制
  分组（对象/函数形式）」组合下触发（实测 mes-zc admin：vue-vendor ⇄ antd-vue-vendor 环）。
- **根因**：`devSharedSelf` 使 node_modules 参与门面化，被 manualChunks 强制分组的包
  （如 vue-vendor 组内 vue-router）内部的 shared 导入被改写为协商门面；门面为静态
  `import` 运行时的 TLA 模块，被 rollup 按消费方归组拖入其他强制组 → 跨组静态环 →
  门面 TLA 求值顺序错位。
- **修复 1（门面形态参数化，virtual.ts）**：`genSharedFacade` / `genSharedNsFacade` /
  `genBindingFacade` / `genRemoteBindingFacade` 新增 dynamic 形态——门面对运行时与 shared
  本体的依赖全部改为 TLA 内 `await import(...)`，命名空间门面以 `{ ...ns }` 复制阻断 rollup
  透传内联——门面 chunk 对外零静态依赖（"汇"形态），与任何 manualChunks 分组正交，不可能成环。
  **dynamic 仅在 devSharedSelf 宿主（build）启用；其余一切场景（纯 remote、dev serve）保持
  2.0.0 静态形态，产物与行为零变化**（硬约束；纯 remote 若启用动态化会在自动分包下出现
  「门面 TLA → 动态 import 本体 chunk ← 静态 import 门面」死锁，实测确认）。
- **修复 2（shared 闭包静态化，transform.ts + index.ts）**：devSharedSelf 宿主（build）下，
  provide 键本体闭包内的模块（如 vue-router 包、vue-demi 转发层——经 shared 本体文件解析
  传递依赖）对 shared 键的导入**不做门面化**（同一 provide 闭包天然同实例）——斩断
  「fallback 动态 import 本体 chunk ← 本体消费方静态 import 门面」的 TLA 混合环（实机死锁：
  页面停在骨架屏、零报错）。别名转发层的 `export * from <key>` 因此保持静态、不再触发
  ESM 门面化硬报错。纯 remote 不启用，行为零变化（硬约束）。
- **修复 3（manualChunks 包装注入，index.ts）**：devSharedSelf 宿主 + 用户配置了
  manualChunks 时，插件包装注入归组函数——运行时隔离进 `fulgurjs-runtime` 组、协商门面按
  shareKey 隔离进 `fulgurjs-shared-<key>` 组、远程绑定门面进 `fulgurjs-remote-facades-*` 组。
  对象形式的 specifier 解析延迟到 buildStart（走完整解析管线含 alias），解析失败丢组并告警。
- **修复 4（post 阶段 auto-import 兜底，index.ts）**：build 下 post.transform 不再跳过非
  `.vue` 文件——unplugin-auto-import 等后置插件注入的 `import { ref } from 'vue'` 发生在
  pre.transform 之后，此前会绕过门面化、静态绑定本地 vue 副本，与协商实例形成**双响应性
  系统**（实测：同一组件内 A ref 的赋值不触发渲染、B ref 的赋值正常；jsdelivr 级表现即
  「弹窗 model 置 true 却不渲染」）。pre 已改写过的文件由 `isPluginProcessedModule` 守卫
  拦下，不会双重改写。
- **新增诊断**：`BLD-006`——output 为数组形态时无法自动注入，三段式提示手工加隔离分支。
- **集成器**：宿主为双向（有 exposes 且有 remotes）时 vite.config 模板产出
  `devSharedSelf: true`（落实 README 口径；须配合本版插件使用）。
- **测试**：+10（门面 dynamic/static 双形态断言 ×6、真实 vite build 产物形态用例 ×1——
  覆盖「宿主 + devSharedSelf + manualChunks 对象形式」这条此前零覆盖的路径，断言产物无环、
  门面隔离、"汇"形态、node_modules 门面化指向隔离 chunk；post 兜底源码契约 ×3）。

### 已知边界

- devSharedSelf 宿主的协商门面 chunk 集中在插件专属组：与「门面分散在各业务 chunk」的
  旧形态相比，首屏会多下载所属 shareKey 的门面 chunk（未压缩量级 = 门面行数，gzip 后显著
  缩小）；这是换取「与 manualChunks 共存」的结构性代价。
- 入口文件（index.html 直引的模块）内的 remote 导入在 build 下不参与改写（入口只内联 init
  即短路返回，既有边界）：remote 导入请放在非入口模块。

## 2.0.1（2026-09-22）

### 变更（文档与包面，零运行时变化）

- **README 补全公开类型/函数名**（对齐「README 写全所有 API」）：`FederationOptions`、
  `PageRouteLike` / `PagesOptions` / `PageViolation` / `RemoteSchemaEntry`、
  `RepoConfig` / `UserConfig` / `AppConfig` / `HostConfig` / `RemoteConfig` / `DeployConfig` /
  `PageEntry` / `RemoteAddress`、`loadRepoConfig`；§1 与 §4 的 import 示例带上类型。
- **peer 下限对齐实测值**：`vite` `>=5.0.0` → `>=5.1.0`（历史兼容矩阵实测下限为 5.1.4）。
- **发布物收窄**：移出内部草稿 `docs/vite-upstream-issue-irregexp.md`（仅存档性质，非用户文档）。
- **仓库公开面整理**：8 个内部工作文档（已执行的 0.9.0 任务书、Trusted Publishing 迁移清单、
  改进项评估、三个设计方案、qiankun 调研、上述草稿）移入 `docs/_workspace/`（本地工作区、不入库），
  `docs/` 只保留面向用户的四个文档；相关代码注释与 CHANGELOG 引用同步修正，全仓零失效引用。
- 两处过时文档元数据修正：webpack-mf 对照文档的版本戳、vite-upstream 草稿的断链引用与失效 commit 号。

## 2.0.0（2026-09-22）

### 破坏性变更（公开 API 去掉冗余品牌前缀，无兼容别名）

背景：包名与子路径已承担命名空间职责（`@fulgurjs/federation/context` 等），标识符再挂 `Fulgurjs`
前缀属纯冗余，且长度失控（`provideFulgurjsAppContext` 达 26 字符）。本版统一去前缀，**旧名直接移除**。

| 子路径 | 旧名 | 新名 |
|---|---|---|
| `/context` | `provideFulgurjsAppContext` | `provideAppContext` |
| | `getFulgurjsAppContext` | `getAppContext` |
| | `requireFulgurjsAppContext` | `requireAppContext` |
| | `FulgurjsAppContext` | `AppContext` |
| `/pages` | `defineFulgurjsPages` | `definePages` |
| | `validateFulgurjsPages` | `validatePages` |
| | `FulgurjsPagesOptions` / `FulgurjsPageRouteLike` | `PagesOptions` / `PageRouteLike` |
| `/config` | `defineFulgurjsConfig` | `defineRepoConfig` |
| | `loadFulgurjsConfig` | `loadRepoConfig` |
| | `FulgurjsRepoConfig` / `FulgurjsAppConfig` / `FulgurjsUserConfig` | `RepoConfig` / `AppConfig` / `UserConfig` |
| | `FulgurjsHostConfig` / `FulgurjsRemoteConfig` / `FulgurjsDeployConfig` | `HostConfig` / `RemoteConfig` / `DeployConfig` |
| | `FulgurjsPageEntry` / `FulgurjsRemoteAddress` | `PageEntry` / `RemoteAddress` |
| 主入口 | `FulgurjsOptions` | `FederationOptions` |
| 运行时 | `FulgurjsRuntime`（类型） | `FgRuntime` |
| | `FulgurjsError`（内部类，仅经 `err.name` 可见） | `FgError` |

两处命名取舍：

- `defineRepoConfig` 而非 `defineConfig`——避开与 vite 的 `defineConfig` 撞名（`fulgurjs.config.ts`
  描述的是「一个仓库的多个应用」）。
- 运行时错误 `err.name` 由 `FulgurjsError` 变为 `FgError`：该类不在导出面（用户从不 import，
  只经 `err.code` / `err.name` 观察），若有按 `name` 匹配错误的监控配置需同步。`err.code`（MFU-xxx 等）
  语义与取值不变。

### 刻意保持不变的品牌元素

- **跨应用单例键** `globalThis.__FULGURJS_RUNTIME__` / `__FULGURJS_APP_CONFIG__` / `__FULGURJS_SCOPE__`：
  跨版本互操作契约——改了会让新旧版本互相看不见对方的运行时与 context 存储。
- 虚拟模块 `virtual:fulgurjs-runtime`、CLI `fulgurjs`、配置文件 `fulgurjs.config.ts`、错误码前缀 `[fulgurjs:MFU-001]`。
- 运行时函数名（`loadRemote` / `loadShare` / `preloadRemote` / `registerRemote(s)` / `initSharing` /
  `getContainer` / `getRuntime` / `unwrapDefault` / `parseSpec`）：对齐 webpack Module Federation 命名，便于迁移对照。

### 迁移

按上表把旧名替换为新名即可，语义一一对应、无行为变化。注意 `provide/get/requireFulgurjsAppContext`
三个是「含前缀的完整函数名」，新名为 `provide/get/requireAppContext`（去的是 `Fulgurjs` 与 `AppContext`
之间的品牌词，`AppContext` 保留）。

## 1.0.0（2026-09-22）

### 破坏性变更（正式定版，API 面冻结）

- **删除旧配置 API**：`provideFulgurjsAppConfig` / `getFulgurjsAppConfig` 从 runtime、虚拟门面
  （`virtual:fulgurjs-runtime` 委托模块）、`client.d.ts` 类型面全部移除——跨应用传值**唯一通道**为
  `@fulgurjs/federation/context` 的 `provideFulgurjsAppContext` / `getFulgurjsAppContext` /
  `requireFulgurjsAppContext`。存储本体即全局镜像对象 `window.__FULGURJS_APP_CONFIG__`（不再经
  runtime 转发），runtime 包体相应缩减。
- 迁移：全局搜索 `provideFulgurjsAppConfig` / `getFulgurjsAppConfig` 替换为 context 子路径对应函数
  （语义一一对应，仅函数名与导入路径变化）。

### 清理（无历史遗留）

- **移除 `docs/manual.html`**（早期手册的历史存档，其引用的截图已不在仓库）——README 为唯一权威文档。
- 设计文档状态勘误：D.2 / D.4 / D.5 已实施项的状态标记修正（原标注"待执行/未实现"）。


## 0.9.0（2026-09-21）

### 新增（发布可靠性 + IDE 边界 + 配置面）

- **`dts: { mode: 'source' | 'shim' }`**（默认 `source`，行为不变）：`shim` 形态的类型声明不引用跨工程源文件（宽松占位），根治 VSCode/Volar 打开 `types/*.d.ts` 时的跨工程诊断红波浪线；取舍为无源码级补全/跳转（README §9.1.5）。
- **`fulgurjs.config.ts` 新增 `host.prefetch: 'all' | string[] | false`**（默认 `'all'`，行为不变）：空闲预载名单成为正式配置面，init 生成 bridge.ts 时注入 `PREFETCH_REMOTES` 常量（README §9.1.3）。
- **`npm run typecheck:latest`**：用最新 TypeScript + vue-tsc 对 `tests/types-repro/` 典型消费形态做类型回归——根治"工程内旧 TS 绿、用户 IDE（新 TS）红"的盲区（0.8.2 的 EP locale ts2345 即由此暴露）。
- **CI 流水线**：`.github/workflows/ci.yml`（push/PR：单测 + 双口径 typecheck + build/gzip 门禁）与 `.github/workflows/publish.yml`（GitHub Release 触发 `npm publish --provenance`，Trusted Publishing 迁移已完成）。

### 变更

- **gzip 门禁真实化**：`scripts/check-gzip.mjs` 接入 build（阈值 ≤6144B，实测基线 5232B）；`version.ts` 注释口径修正（原"≤5120 CI 守卫"与事实不符）。
- **发布物移除 `docs/manual.html`**（早期手册，内容停留在较早形态，避免双源漂移）：本 README 为唯一权威文档；仓库内文件保留为历史存档。

### 修复

- types-repro 样例集 + `buildShimModule`/`resolveDtsMode` 单测（单测 183 → 188）。

## 0.8.4（2026-09-21）

### 文档（README / 迁移指南全面清理历史沿革表述，只保留当前形态，零代码变化）

- 删除全部"X.X 起 / 原规则已废除 / 早期版本~~删除线~~"式版本沿革叙述（静态导入改写、目录默认值、
  缓存自动清理、三B-1 历史段等十余处）——使用文档只描述当前行为，版本史归 CHANGELOG。
- 特性列表与 API 参考标题去除版本后缀（"（0.7.0 起）/（0.8.0 起）"）；deprecated 标注保留（当前事实），
  去"0.9 删"类未来预告。
- 语句复核：快速开始的运行时导入说明重写为单句当前形态。

## 0.8.3（2026-09-21）

### 文档（README §9.1 / 迁移指南三E 重写为标准配置参考格式，零代码变化）

- 按成熟开源库的 Options Reference 体例重写：每个能力给出**配置项名 / 类型 / 默认值 / 配置位置**四要素，
  配「开启 / 关闭 / 自定义」三态可运行示例与行为边界清单——替换原先「默认开启、可关闭」式的行为性描述。
- 新增 §9.1 配置面总览表（能力 × 配置项 × 类型 × 默认值 × 配置位置）。
- 骨架屏如实标注为「无配置项」并列出内置参数（`loadingComponent` / `delay: 200ms` / `errorComponent`），
  自定义路径指向 §8 `remoteComponent`；诊断面板标注「无配置项」并给出 prod 访问路径。

## 0.8.2（2026-09-21）

### 修复（类型兼容，用户 IDE 实测暴露）

- **`provideGlobalConfig(getFulgurjsAppContext(), app)` 的 ts(2345)**：EP `ConfigProviderProps.locale`
  为 `Language` 类型，context 的 `locale` 按设计是 `unknown` 扩展位——集成模板三处消费端
  （宿主桥 + bpm/lowcode federatedBoot）改为 `as Record<string, any>` 断言（消费端按 UI 库形状收窄）。

### 精简（AppContext 默认 provide 9 键 → 6 键，用户反馈"互相传的东西太多"）

- **`token` 一次性快照移出默认 provide**：与 `getToken` 函数引用重复且会过期（拉取式永不过期）；
  `FulgurjsAppContext` 类型同步删除 `token` 字段。取值一律 `getToken()`。
- **`formUrl` / `baseUrl` 移出默认 provide**：自 0.7.0 `remoteComponent` 直渲染（iframe 通道删除）后
  无消费点。项目如需可经扩展位 `[key: string]: unknown` 自行提供。
- 取证依据：testbed 全量 grep 上述三键零消费（除 bridge 传参本身）；`user` / `getToken` / `store` /
  `hostApp` / `locale` / `events` 六键各有真实消费点（boot 双注入 / EP 注入 / 方法池 / 组件注册），保留。
- 单测同步（扩展位语义用例）；README §9 示例与字段表、迁移指南三C 同步。

## 0.8.1（2026-09-21）

### 文档（0.8.0 使用文档补齐，零运行时变化）

- **README 新增 §9.1「乾坤功能融合三件套 + 联邦诊断面板」**：A 保活（`keepAlive: true` 页面级配置、include 白名单与 max=8 语义、默认关的原因）/ B 骨架屏（内置自动，无需配置）/ C 空闲预载（`PREFETCH_REMOTES` 开关）/ D 诊断面板（`/fulgurjs-demo` 六块内容表）/ E IDE 说明。
- **README §9 方法模块补端到端示例**（exposes 声明 → api.ts 纯函数 → loadRemote 调用三步）。
- **迁移指南新增「三E 乾坤融合三件套 + 诊断面板」速查表**（配置入口/默认值/行为），含 IDE 提示。
- **IDE 说明**（同入每应用 `src/fulgurjs/README.md` 模板）：`types/*.d.ts` 生成物在 VSCode/Volar 打开时可能显示跨工程「找不到模块 '@/...'」波浪线（推断项目检查工程外 .vue 的显示问题）——命令行 `vue-tsc --noEmit` 走本应用 tsconfig 为 0 错误，构建不受影响；升级后 context 导入报 ts(2307) 为 IDE 旧包缓存，Restart TS Server 即消。
- 修复：集成器 pages.ts 模板注释与现场对齐（`defineAsyncComponent` 不支持 `name` 选项的表述清理）。

## 0.8.0（2026-09-20）

### 新增（跨应用传值与方法引用收编 + 乾坤功能融合，设计文档定稿后实施）

- **`@fulgurjs/federation/context` 新子路径（~2KB 独立文件，与 `./vue` 同模式）**：
  - `provideFulgurjsAppContext(config)`——宿主桥一次性写入跨应用上下文（merge 语义，幂等可多次，后写覆盖）；
  - `getFulgurjsAppContext()`——读快照（传输层快照 + 函数引用，非响应式，与乾坤 props 同语义；嵌套对象如 `events` 引用共享）；
  - `requireFulgurjsAppContext(...keys)`——远程 boot 显式校验消费：缺任一键 → **`CC-001`** 三段式抛错（got/expected/example 指向宿主桥），页面无运行时单例（独立直开远程页）→ **`CC-002`** 显式（修法 = 经宿主联邦加载）；
  - `FulgurjsAppContext` 类型（标准字段表：`user` / `token` / `getToken` / `store` / `hostApp` / `locale` / `events` + `[key: string]` 项目扩展位）随子路径与 `client.d.ts` 双发布。
- **方法引用一等公民两条通道**：① context 携带函数引用（`getToken` / `events.main.getDictItems` 高频热路径直调、子应用反向注册 `events.bpm.formEvent`）；② exposes 方法模块 `loadRemote('remote/api')`（低频/重逻辑跨应用调用，dts 类型直连自动覆盖）。
- **架构边界（gzip 红线不破）**：runtime.js 逻辑 0.8.0 **零改动**（仅版本常量随版本走）——context 子路径内部经 `globalThis.__FULGURJS_RUNTIME__` 单例委托运行时既有方法，存储与旧 W4（`__FULGURJS_APP_CONFIG__`）同一份。
- **旧名 deprecated**：`provideFulgurjsAppConfig / getFulgurjsAppConfig` 继续可用（存储同一份），`client.d.ts` 与 README 标 `@deprecated` 指向新名，0.9 删除。
- **错误码总表 30 → 32**：新增 CC 段（`CC-001` context 必需字段缺失 / `CC-002` 运行时单例不可用）。

### 文档（乾坤功能融合配套，全部宿主/模板侧，插件 runtime 零改动）

- README 特性声明新增「CSP 友好（原生 ESM 无 eval）」；新增 §9 AppContext API 参考（字段表/时序契约/方法模块规范）；迁移指南新增「跨应用传值」节与「页面卸载清理清单」节（乾坤 unmount 强制清理的联邦等价物：`onUnmounted` 摘除 window 级监听/定时器/context.events 反向注册）。
- 乾坤功能融合三件套（保活 keep-alive 白名单 / 页面加载骨架屏 / 空闲预载编排）与联邦诊断面板均为**集成器模板/宿主项目侧**能力，用法见迁移指南与 `fulgurjs.config.ts` 模板注释；调研依据：16 项逐项对照（：9 项已有、4 项与架构哲学冲突不搬、3 项值得搬 + inspector 概念轻量化落地）。

## 0.7.1（2026-09-20）

### 修复（TS 子路径类型兼容，demo-app testbed 用户 IDE 实测暴露）

- **`typesVersions` 子路径类型映射**：`moduleResolution: "node"`（node10 语义，vben/jeecg 一代工程常见，如 TS 4.9 + `moduleResolution: "node"`）不读 package.json `exports`，`import ... from '@fulgurjs/federation/pages'` 报 ts(2307)。新增 `typesVersions` 把 `./pages` / `./config` / `./vue` 映射到对应 `dist/*.d.ts`——TS 3.1+ 任意解析模式可用；TS ≥4.7 的 bundler/node16 仍走 `exports`，两者互不冲突。运行时无任何变化（Vite 一直认 exports）。
- 新增清单防漂移测试（exports 子路径 ↔ typesVersions ↔ 磁盘 d.ts 三方一致）。

## 0.7.0（2026-09-20）

### 新增（Vue 直渲染 API，设计文档定稿后实施）

- **`remoteComponent(spec, opts)`（`@fulgurjs/federation/vue` 子路径）**：远程组件直渲染的标准封装——`defineAsyncComponent({ loader: () => loadRemote(spec, opts).then(m => m.default ?? m) })`。选项：`loadingComponent` / `errorComponent`（不传时内置错误占位：错误码+根因+修法三段式）/ `retries`（透传 loadRemote）/ `delay` / `timeout`。H3 零兜底：加载失败显式进错误态，`fulgurjs:error` 事件照常发出；模块去重沿用 loadRemote Promise 缓存；`vue` 为可选 peerDependency。
- **架构边界**：runtime.js 保持框架无关（不 import vue），gzip 红线零增量——Vue 封装独立子路径文件、按需引入。

### 变更（集成模板与文档）

- **集成器 detail 页模板简化**：30 行 D.1 防御式样板（`globalThis.__FULGURJS_RUNTIME__` 单例 + 手动 try/catch + shallowRef）替换为一行 `remoteComponent(spec)`；**删除 `isFederatedRealm()` + iframe 乾坤旧通道**（H3 零兜底 + 新插件定位，用户拍板）。后果：乾坤基线（如 8661）详情页表单区随 iframe 通道下线降级为存档；独立直开远程页从静默 iframe 改为显式错误态。
- 迁移指南「三B-1 远程页面如何取宿主运行时」更新：0.4.1 起静态导入已是标准（自动惰性单例代理），globalThis 直取降级为特殊场景；坑 #10 同步改写。
- README API 参考新增 §8（remoteComponent 选项表与语义）。

## 0.6.2（2026-09-20）

### 变更（目录结构定稿，宿主应用补齐）

- **宿主应用的桥接文件归位 `src/fulgurjs/host/`**（原散在文件夹根部）：`bridge.ts`（token/用户/EP locale 桥）+ `pages.ts`（联邦页面路由表）——三应用形态统一为「按角色子目录」（远程=exposes/，宿主=host/，人人有 types/）；每个应用 `src/fulgurjs/` 内附 README.md 说明各子目录归属与手改边界（迁移工具自动生成）。
- 迁移指南「目录约定说明」同步 host/ 结构。

## 0.6.1（2026-09-20）

### 修复（发布面）

- **包内 README/CHANGELOG 与 0.6.0 行为对齐**：0.6.0 构建时打包的仍是 0.5.9 文案（默认目录写成 `.fulgurjs/types`）——实际行为已改为 `src/fulgurjs/types/`。npm 文档以本版为准。

## 0.6.0（2026-09-20）

### 变更（默认值，目录统一）

- **dts 生成目录默认 `src/fulgurjs/types/`**（src 布局项目 tsconfig 零配置生效；无 src 布局回退根目录 `.fulgurjs/types`；`dts: { dir }` 可覆盖）——联邦所有产物集中 `src/fulgurjs/` 一个文件夹（用户评审定稿）：`types/`=插件生成（勿手改），`exposes/`=迁移工具脚手架的用户代码（联邦启动引导 + 暴露组件）。防火墙原则不变：插件只写 `types/`，绝不触碰用户文件。
- 迁移指南「目录约定说明」同步：宿主侧桥接文件等脚手架约定可按团队习惯重组。

## 0.5.9（2026-09-20）

### 变更（默认值，src 零污染）

- **dts 生成目录默认收敛到根目录 `.fulgurjs/types/`**（原 `src/fulgurjs-types/`，Nuxt `.nuxt` 同款体验）：插件的自动生成物不再出现在用户 src 里；tsconfig `include` 加一行 `".fulgurjs"` 即全量生效（远程模块类型直连 + 运行时类型垫片）。`federation({ dts: { dir } })` 可自定义/回退旧位置。迁移方式：删除旧目录 → 升级后重启 dev → tsconfig include 换成 `".fulgurjs"`。
- 迁移指南新增「目录约定说明」：`src/fulgurjs-exposes/` 等为迁移工具脚手架约定而非插件要求，可按团队习惯重组。

## 0.5.8（2026-09-20）

### 修复

- **dts 具名枚举的 as 别名**：`export { a as b }` 导出名取别名 b（0.5.7 误取原名）。

## 0.5.7（2026-09-20）

### 修复

- **dts 生成：环境模块改显式具名重导出**——`declare module` 里的 `export *` 不转发具名导出（TS 实测限制，远程 TS 模块类型直连为空）。生成时枚举源文件顶层具名导出，输出 `export { names } from`（正则面枚举 const/let/var/function/class/interface/type/export{}，含 as 别名）；无可枚举名退回 export * 保副作用导入。

## 0.5.6（2026-09-20）

### 修复

- **dts 生成：非 .vue 源码的 re-export 去掉 `.ts` 扩展名**——TS 默认禁止 `.ts` 后缀导入（需 allowImportingTsExtensions），带后缀的 `export * from "x.ts"` 在用户 skipLibCheck 下静默解析失败 → 远程 TS 模块（如共享状态文件）类型直连为空。.vue 保留扩展名（SFC 解析必需）。

## 0.5.5（2026-09-20）

### 修复

- **client.d.ts 改 script 形态**：0.5.3/0.5.4 的声明文件顶层含 export interface → 整个文件成为 module，其中的 `declare module` 退化为 augmentation 被静默忽略（TS 环境声明必须住非 module 文件）——全部类型内联进 declare module 块，垫片加载即全局生效。对外类型仍经 `virtual:fulgurjs-runtime` 导出（`import type { LoadRemoteOptions } from "virtual:fulgurjs-runtime"`）。

## 0.5.4（2026-09-20）

### 修复

- **类型垫片改 import 式**：0.5.3 生成的 `fulgurjs-runtime.d.ts` 用 `/// <reference types>` 指令指向包内声明，实测该指令解析不了 npm 包子路径（TS 5.6/vue-tsc 实证），垫片不生效——改用副作用 import 加载 `@fulgurjs/federation/client`（client.d.ts 本体不变），include 目录即生效。

## 0.5.3（2026-09-20）

### 修复（TS 体验）

- **`virtual:fulgurjs-runtime` 类型声明随包发布**：包内新增 `client.d.ts`（exports `./client`），运行时全部导出（loadRemote/loadShare/preloadRemote/registerRemote*/getRuntime/version 等 17 项）带完整签名；此前用户按 README §2 导入运行时 API，TS 报 `Cannot find module 'virtual:fulgurjs-runtime'`。dev 启动时插件还自动在 `src/fulgurjs-types/fulgurjs-runtime.d.ts` 生成引用垫片——include 该目录（远程模块类型直连本就要求）即零配置生效。+4 单测（守声明面与 runtime.js 导出面漂移，162/162）。

## 0.5.2（2026-09-20）

### 修复

- **dev 下 `preloadRemote` 注入的 expose 链接全部 404（npm 深度验证轮发现）**：dev manifest 的 `exposes[].file` 曾写 dts 类型直连的虚拟路径 `/@fulgurjs-src/...`（dts 实际只消费 `fsRoot`+`src`），而 `preloadRemote` 读同一字段注入 `<link rel=modulepreload>`——dev 下每个 expose 预载 404、预载完全无效。现改为真实可请求的模块 URL（与 dev 容器 `get` 的裸 URL 同款，含 base 前缀）；prod 不受影响（file 本就是产物路径）。+1 回归单测（158/158）。

## 0.5.1（2026-09-19）

### 修复

- **宿主页面「虚拟运行时导入 + 远程动态导入」混用漏改写（真实 npm 用户验证轮发现）**：post 阶段防双重生成守卫原先按「代码含 `virtual:fulgurjs-runtime` 字样」一刀切跳过，导致同一文件里合法导入 `loadRemote`（README §2 标准用法）后再写 `import('remote-a/X')`（README §1 标准用法）时远程导入漏改写，dev 下 vite:import-analysis 直接 500。现改为按插件生成物特征精确判定（代理化导入 `virtual:fulgurjs-runtime-proxy` / 改写助手 `__fulgurjs_loadRemote`·`__fulgurjs_loadShare` / 构建入口注入标识 `/* fulgurjs:init */`），用户混用照常工作；补 4 组单测（157/157）。

### 变更（发布面）

- **README 双端导航统一**：README 内 8 处文档相对链接（manual.html×4 / 迁移指南 / webpack MF 对照 / 沙箱边界审计 / DESIGN）改为 GitHub 绝对 URL——npm 页面与 GitHub 点击行为一致（npm 不解析包内相对链接，此前在 npm 上全部 404）。

## 0.5.0（2026-09-19）

### 变更（品牌全面对齐，breaking）

- 全品牌从 `fulgur` 对齐为 **`fulgurjs`**（npm 上 fulgur 组织名被占用）：
  - CLI 命令：`fulgur` → **`fulgurjs`**（`npx fulgurjs init` / `npx fulgurjs doctor`）
  - 虚拟模块：`virtual:fulgur-runtime` → **`virtual:fulgurjs-runtime`**（代理模块同步更名）
  - 全局单例：`__FULGUR_RUNTIME__` → **`__FULGURJS_RUNTIME__`**（`__FULGURJS_APP_CONFIG__` / `__FULGURJS_SCOPE__` / `__FULGURJS_INFO__` 同步）
  - 产物文件名：`fulgur-remoteEntry.js` / `fulgur-manifest.json` → **`fulgurjs-remoteEntry.js`** / **`fulgurjs-manifest.json`**（NGINX 规则同步更名）
  - 配置文件：`fulgur.config.ts` → **`fulgurjs.config.ts`**；错误前缀 `[fulgur:*]` → `[fulgurjs:*]`；运行时事件 `fulgur:error` → `fulgurjs:error`
  - GitHub 仓库：**fulgurjs-federation**（旧地址自动重定向）
- 升级方式：0.4.x 用户全局替换 `fulgur` → `fulgurjs`（导入/全局名/NGINX 文件名/CLI 命令）即可。

## 0.4.2（2026-09-19）

### 修复（npm 发布面）

- **npm 包内 README 与仓库 README 是两个文件**——包内是 4.7kB 旧版（无 API 参考）。现在构建时自动以仓库根 README（含完整 API 参考）为准，npm 页面与 GitHub 展示一致。
- npm 包自带完整文档：docs/manual.html（使用手册）、迁移指南、webpack 对照、沙箱审计、兼容矩阵、CHANGELOG、DESIGN、examples 起步样例——包内 README 的相对链接在 npm 上不再 404。

## 0.4.1（2026-09-19）

「让插件自动处理，而不是让用户记住规则」——两条使用规则自动化，使用面大幅简化。

### 变更（规则自动化）

- **任何文件都可以直接 `import { ... } from 'virtual:fulgurjs-runtime'`**（原 DEV-008 规则自动化）：
  exposes 目标文件（远程页面）里的静态导入，dev 下由插件自动改写为惰性单例委托模块
  （求值期零副作用、调用期转发页面级运行时单例）。用户不再需要知道
  「宿主/远程页面取运行时的不同姿势」，0.4.0 的手工 globalThis 写法已无需使用。
- **插件升级后重启 dev server 即可**（原 DEV-009 规则自动化）：dev server 启动时插件自动
  检测版本变化并清除本应用 node_modules/.vite 预构建缓存，无需手工 rm -rf。

### 修复

- runtime 两个存量 TS 断言错误（as Error → as FulgurjsError）与 fallback 源码契约断言同步。

## 0.4.0（2026-09-18）

开箱即用批次（A→E）全部落地；W7 发布链按用户指示顺延（未发布 npm）。

### 新增
- **CLI（主包内置 bin `fulgurjs`）**
  - `fulgurjs init`：起步模板（带注释的 `fulgurjs.config.ts`：宿主/远程/页面路由表/部署形态，
    单文件可入库可复跑）+ 配置校验（CFG 三段式报错）+ 输出可直接粘贴的样板
    （各应用 federation() vite 块、NGINX no-cache 站点模板、通用接入核对清单）；
    **项目无关**——不内置任何具体项目的模板、锚点或文件改写
  - `fulgurjs doctor`：部署面体检——remoteEntry/manifest/index.html 的 200/no-cache/JS 形态、
    CORS、chunk 抽样可达（含 index.html 引用与一跳下钻、200-HTML 回退伪装识别）、
    版本协商 skew 预演、`--dev` 模式端口/容器入口探测；`--json` 供 CI
- **W4 跨应用全局配置协商**：runtime 新增 `provideFulgurjsAppConfig` / `getFulgurjsAppConfig`
  （页面级单例、浅合并、globalThis 镜像）——EP locale/size 类跨副本配置的机制化收编
- **W5 诊断补码**：CFG-007（remotes 对象形式误用 name@ 前缀）、CFG-008（shared 非法组合）、
  DEV-010（dev 冷启动预构建窗口提示）；BLD-003 必填 props 扫描器（按实测降级为手册核对项）
- **W8 验证基建**：持久 profile 重部署用例（复刻 immutable 缓存坑）、full-verify 失败自动归因、
  func-results 联动归档

### 修复
- **U-7 裸门面**：`genSharedFacade` 改枚举式再导出——rolldown 产物下 `export *`+TLA 展开致
  命名绑定全 undefined（provider 注册后 loadShare 拿到的命名空间只有 default）；
  生成物级核对 494 个导出名全部进入赋值回调；bare 导入 prod 实测通过

### 变更
- **插件去项目化（2026-09-19 定调）**：移除 init 中曾内置的具体项目集成模板/锚点/补丁
  （历史实现见 git 历史）；`fulgurjs init` 重写为纯通用脚手架，配置 schema 同步精简。
  插件为所有项目服务，不做任何单一项目的形状。
- runtime gzip 5212 B（红线 ≤5250 内）；单测 148/148；错误码 30 个全量文档对齐
