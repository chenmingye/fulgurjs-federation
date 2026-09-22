# Changelog

## 0.9.0（2026-09-21）

### 新增（发布可靠性 + IDE 边界 + 配置面）

- **`dts: { mode: 'source' | 'shim' }`**（默认 `source`，行为不变）：`shim` 形态的类型声明不引用跨工程源文件（宽松占位），根治 VSCode/Volar 打开 `types/*.d.ts` 时的跨工程诊断红波浪线；取舍为无源码级补全/跳转（README §9.1.5）。
- **`fulgurjs.config.ts` 新增 `host.prefetch: 'all' | string[] | false`**（默认 `'all'`，行为不变）：空闲预载名单成为正式配置面，init 生成 bridge.ts 时注入 `PREFETCH_REMOTES` 常量（README §9.1.3）。
- **`npm run typecheck:latest`**：用最新 TypeScript + vue-tsc 对 `tests/types-repro/` 典型消费形态做类型回归——根治"工程内旧 TS 绿、用户 IDE（新 TS）红"的盲区（0.8.2 的 EP locale ts2345 即由此暴露）。
- **CI 流水线**：`.github/workflows/ci.yml`（push/PR：单测 + 双口径 typecheck + build/gzip 门禁）与 `.github/workflows/publish.yml`（GitHub Release 触发 `npm publish --provenance`，Trusted Publishing 迁移见 docs/trusted-publishing-迁移清单.md）。

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

### 新增（跨应用传值与方法引用收编 + 乾坤功能融合，设计文档 docs/跨应用传值与方法引用设计方案-2026-09-20.md 定稿实施）

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
- 乾坤功能融合三件套（保活 keep-alive 白名单 / 页面加载骨架屏 / 空闲预载编排）与联邦诊断面板均为**集成器模板/宿主项目侧**能力，用法见迁移指南与 `fulgurjs.config.ts` 模板注释；调研依据见 docs/qiankun功能融合调研-2026-09-20.md（16 项逐项对照：9 项已有、4 项与架构哲学冲突不搬、3 项值得搬 + inspector 概念轻量化落地）。

## 0.7.1（2026-09-20）

### 修复（TS 子路径类型兼容，demo-app testbed 用户 IDE 实测暴露）

- **`typesVersions` 子路径类型映射**：`moduleResolution: "node"`（node10 语义，vben/jeecg 一代工程常见，如 TS 4.9 + `moduleResolution: "node"`）不读 package.json `exports`，`import ... from '@fulgurjs/federation/pages'` 报 ts(2307)。新增 `typesVersions` 把 `./pages` / `./config` / `./vue` 映射到对应 `dist/*.d.ts`——TS 3.1+ 任意解析模式可用；TS ≥4.7 的 bundler/node16 仍走 `exports`，两者互不冲突。运行时无任何变化（Vite 一直认 exports）。
- 新增清单防漂移测试（exports 子路径 ↔ typesVersions ↔ 磁盘 d.ts 三方一致）。

## 0.7.0（2026-09-20）

### 新增（Vue 直渲染 API，设计文档 docs/远程组件直渲染API设计方案-2026-09-20.md 定稿实施）

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
