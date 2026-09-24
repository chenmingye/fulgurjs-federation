# 唯一入口改造任务书（方案 B：`@fulgurjs/federation/runtime`）

> **状态：4.0.0 代码已实施；此前隔离副本的测试仅作历史记录。MES-ZC 原目录未迁移，用户要求从 SVN 全量重新取回后再验收，见《4.0.0-MES-ZC-全新SVN测试计划.md》。**
> 编写基线：2026-09-24，HEAD `57a25a9`（v3.0.1，npm latest）。开工前必须重新核对现场：
>
> ```bash
> git status --short && git log -3 --oneline
> npm view @fulgurjs/federation dist-tags
> ```
>
> 上一份任务书 `docs/兼容性与健壮性强化实施方案.md` 是 WP1~WP8 的历史记录，**不作为本任务的实施依据**；本手册为唯一依据。

---

## 0. 决策记录

### 已定（用户 2026-09-24 拍板）

- **入口形态 = 方案 B**：应用代码唯一入口为包路径 `@fulgurjs/federation/runtime`（**不是** virtual 模块）。
- 采用理由（生态惯例，双角色包拆入口）：Next.js（`next/link` 等子路径）、Module Federation 2.0（`@module-federation/enhanced/runtime`）、Vike（`vike/plugin` 配置 / `vike/client` 应用）、SvelteKit（`@sveltejs/kit/vite`）、Astro（`astro/config`）、Vite 自身（`vite/client`）；Vike 官方文档给出根因：**vite.config 由 esbuild 处理、应用代码由 Vite 处理，两个解析世界必须拆入口**。纯运行时包（qiankun/single-spa）才用包根。

### 待用户确认（附默认值，未回复即按默认执行）

| # | 决策点 | 默认 | 备选 |
|---|---|---|---|
| 1 | 版本号 | **4.0.0**（删除已发布入口，按 semver 发布 major；即使消费者少也不把发布时间短当作兼容豁免） | 若维护者明确决定偏离 semver，需单独记决策与影响范围；不作为默认 |
| 2 | `virtual:fulgurjs-api` 去留 | **删除实现与当前用法**（resolveId/load 分支、类型声明、README 示例清掉；迁移指南/CHANGELOG 只保留标注为旧写法的历史映射） | 保留一版不公开别名 |
| 3 | `./client` 子路径 + 运行时类型垫片 | **一并删除**（类型改由包自身提供；垫片是虚拟模块时代的产物） | 保留空壳 |
| 4 | `remoteSchema` 搬进插件校验（用户面去掉它） | **本轮不做**（聚焦入口改名，减少改动面） | 本轮一并做 |
| 5 | `/runtime` 模块格式 | **ESM-only**（应用入口面向 Vite/browser；`require('@fulgurjs/federation/runtime')` 不承诺支持） | 增加 CJS 产物与 `require` 条件，并分别验证两套运行时图 |
| 6 | Vue peer 语义 | **明确 `/runtime` 入口需要 Vue**，因为统一入口包含 `remoteComponent`；包根/CLI 用户仍可不安装 Vue | 拆成可选框架入口，但这会偏离“应用 API 一个入口”的目标 |
| 7 | runtime 对象/default 导出 | **新入口不导出 `runtime` 和 default**；当前 `virtual:fulgurjs-api` 的 JS 门面本就未导出它们，旧 `client.d.ts` 的声明属于漂移，本次迁移文档明确说明 | 若维护者要承诺这两个名称，必须同时实现 dev/build 语义并列入测试 |

---

## 1. 目标形态

```ts
// ① vite.config.ts —— 构建插件（不变）
import { federation } from '@fulgurjs/federation'

// ② 应用代码唯一入口 —— 宿主桥 / 远程 boot / 页面路由表 / 组件页面，全部这一行
import {
  // 运行时
  loadRemote, loadShare, preloadRemote, getContainer, registerRemote, registerRemotes,
  registerShare, initSharing, registerPlugins, parseSpec, getRuntime, shareScopeMap,
  unwrapDefault, version,
  // 跨应用 context
  provideAppContext, getAppContext, requireAppContext,
  // 页面路由表
  definePages, validatePages,
  // Vue 直渲染
  remoteComponent,
  // 远程 exposes 清单（dev 探针；build 恒为空表）
  remoteSchema,
} from '@fulgurjs/federation/runtime'

// ③ fulgurjs.config.ts —— CLI 配置（不变）
import { defineRepoConfig } from '@fulgurjs/federation/config'
```

包 exports 白名单（改造后；`./runtime` 明确为 ESM 应用入口）：

| 键 | 用途 | 公开 |
|---|---|---|
| `.` | Vite 插件 `federation()` | ✅ |
| `./config` | `defineRepoConfig`（CLI 配置） | ✅ |
| `./runtime` | **应用代码唯一受支持的运行时入口**（ESM；依赖 Vue） | ✅ |
| `./internal/context.js`、`./internal/pages.js`、`./internal/vue.js` | 插件内部门面依赖；因出现在 `exports` 中，技术上可解析，但不构成稳定 API | 内部保留，文档不推荐 |
| `./internal/vue-adapter.js` | dev 门面同步创建 `remoteComponent` 的 Vue 工厂；内部依赖 | 内部保留，文档不推荐 |
| `./package.json` | npm 包元数据 | ✅ |
| ~~`./client`~~ | 删除（类型垫片时代产物） | — |

当前示例和推荐用法不再出现 `virtual:` 前缀。迁移指南和 CHANGELOG 可以保留旧写法作为历史查找项，并明确标成旧入口。

---

## 2. 内部机制设计（实施依据）

原则：**`/runtime` 是一个真实可用的入口——不依赖改写也能工作**；插件只做两处定向改写来追加"惰性化"与"按项目生成"语义。禁止把 `/runtime` 整体拦截成虚拟模块（那只是把 virtual 藏起来，且给 dev 依赖预扫描引入裸包名解析风险）。

### 2.1 真实入口 `./runtime`

- **JS**：`dist/runtime-entry.js` —— 小包装，**显式具名再导出**（不得用 `export *`：多模块同名导出会被 ESM 静默丢弃，且不利于 d.ts 对齐）。公开值导出以第 1 节的列表为准；不导出 `runtime` / default：
  - 运行时函数 ← `./runtime.js`（**esbuild 自包含内核，gzip 门禁 6144B 的对象不变**）
  - context 三函数 ← `./context.js`
  - `definePages` / `validatePages` ← `./pages.js`
  - `remoteComponent` ← Vue adapter；运行时入口会静态加载该 adapter，故**任何运行时入口消费者都需要 Vue**（插件根入口与 CLI 配置不因此要求 Vue）
  - `remoteSchema` ← 类型明确的兜底空表模块（见 2.3）
- **类型**：`dist/runtime-entry.d.ts`（聚合运行时、context、pages、Vue adapter 的类型）。建一张明确的类型导出表：至少覆盖 `FgRuntime`、`ShareEntry` / `ShareScope` / `ShareScopeMap`、`RemoteConfig`、`LoadShareOptions`、`RuntimePlugin` / `RuntimeHooks`、`RemoteDebugInfo`、`AppContext`、`PageRouteLike` / `PagesOptions` / `PageViolation` / `RemoteSchemaEntry`、`RemoteComponentOptions`，以及具名的 `LoadRemoteOptions`、`PreloadRemoteOptions`、`RemoteSchema`、`RemoteInput`。`LoadRemoteOptions` / `PreloadRemoteOptions` 只由 `client.d.ts` 虚拟模块声明；`RemoteSchema` 目前只在插件内部 `src/remote-schema.ts` 声明，不能从 Node 专用探针模块导入到浏览器入口；需先放进浏览器安全的类型源，再由真实入口导出。`RemoteInput` 保留为兼容接口（带 `@deprecated`，说明替代类型 `RemoteConfig`，保留旧接口的 `container` / `containerPromise` 字段）；核对 `registerRemote(s)` 的真实签名接受它。检查同名冲突；`RemoteSchemaEntry` 以 pages API 类型为准，`remoteSchema` 的 `exists` 字段按现有运行时语义注明可选/必需。
- 类型迁移核对：旧 `client.d.ts` 的 `PagesOptions` 写的是 `remoteSchema` 属性，实际 `src/pages.ts` 使用 `schema`；新类型跟随实际实现，迁移文档示范 `definePages(pages, { schema: remoteSchema })`。
- JS 与 d.ts 的测试分成两套：**JS value export** 与实际 ESM export 对照；**type-only export** 与批准的类型清单对照。不能要求类型名称出现在 JS 产物里。旧 `client.d.ts` 中未被真实 JS 门面支持的 `runtime` / default 明确记为历史类型漂移，不照搬。
- **硬约束**：在 `@fulgurjs/federation/runtime` 的 ESM 依赖图内，`dist/runtime.js` 是唯一可执行 runtime 内核。插件入口 `dist/index.js` 仍会携带一份生成的 runtime 源码字符串，用来服务现有 virtual runtime 模块；它不属于 `/runtime` 的静态依赖图。当前构建生成的 `dist/vue.js` 也包含 `createRuntime`；本轮必须改为 Vue adapter 从 `./runtime.js` 引入 `loadRemote`，不得再把 `src/runtime/index.ts` 打进 `/runtime` 子图第二份。以 `exports["./runtime"]` 可达的产物模块图/特征检测断言，不只 grep 包装文件。gzip ≤6144B 门禁保持对象不变。
- **构建约束**：当前 `tsup --clean` 会清理 dist，运行时文件又在构建中重新生成。新增 JS wrapper、Vue adapter 与声明必须在最后一次 clean/生成之后产出；验收以打包 tarball 的相对导入完整、无源码路径依赖为准。
- **模块格式**：`./runtime` 只声明 `types` + `import`，不提供 `require`。Smoke 对该入口使用 ESM `import()`；Node CJS 解析失败是当前明确契约，根入口和 `/config` 原有 CJS 条件不变。

### 2.2 远程页面（expose 目标文件）改写 —— 既有机制扩展

- **仅 serve**（与今天一致；build 下静态导入经 globalThis 单例收敛，不改写）。
- 现状：`post.transform` 对 `isExposeTargetFile` 命中的文件做 `virtual:fulgurjs-runtime` → `virtual:fulgurjs-runtime-proxy` 的文本替换。
- 改造：把匹配面扩展为 `@fulgurjs/federation/runtime`，目标改为**内部惰性门面虚拟模块**，其值导出面和公开类型面必须与 `/runtime` 一致：
  - runtime 函数：调用期转发页面级单例（求值期零副作用）
  - `remoteComponent`：保持同步返回 Vue 组件（与源码签名和 README 用法一致）；不得用“调用时 `import()` 后返回 Promise”冒充同一 API
  - context / pages 函数：静态再导出（零状态/纯函数，求值安全）
  - `remoteSchema`：同 2.3 的虚拟模块
- 理由（保留在注释里）：远程页面的模块在远程模块图内求值，静态导入运行时会在该图内实例化副本链，破坏渲染上下文——这是既有机制，本轮只扩展匹配面。
- 实现约束：把 Vue 组件工厂与 runtime 依赖解耦（例如 `createRemoteComponent(loadRemote)`）；正式包入口用真实 `loadRemote` 绑定，dev 惰性门面用页面级 proxy 绑定。工厂同步创建 Vue 异步组件，组件的 loader 才异步加载远程模块。共用一份组件实现，避免 dev/build 语义分叉。

### 2.3 `remoteSchema` 拆写 —— 保留"等待探针"语义

- 现状：`virtual:fulgurjs-remote-schema` 的 load 返回探针 promise → `import` 会等待（dev 校验可用）；build 返回 `{}`。
- 若直接由包导出常量 → 页面模块可能在探针完成前求值，**静默退化为不校验**（不可接受的隐性行为变化）。
- 改造：transform 阶段把 `remoteSchema` 具名静态导入从 `/runtime` 导入语句中**拆出**，改指内部虚拟模块（模块本体与语义沿用现状）；包内保留带 `RemoteSchema` 类型的兜底空表，使未被改写的文件降级为"不校验"而非报错。
- **覆盖范围**：拆写适用于任何应用源文件，包括宿主路由表和 expose 目标文件；不能把这一步限制在 `isExposeTargetFile` 分支。expose 文件剩余的运行时导入再按 2.2 改写为惰性门面。
- **解析边界**：用 es-module-lexer 确认静态导入边界、magic-string 精确替换；支持别名、混合 value/type 导入、注释、多行和同文件多条 import。`import * as api`、dynamic import、`export ... from` 不做探针拆写，文档明确路由表必须使用具名静态导入；如未来要支持，再单独扩展语法。
- **顺序**：先从原始静态导入拆出 `remoteSchema`，保留其它具名导入及别名，然后仅对 expose 模块里的剩余 `/runtime` 导入做门面改写；避免整句替换吞掉 schema 导入。

### 2.4 删除项（破坏性）

- `virtual:fulgurjs-api`：`index.ts` resolveId/load 分支、`client.d.ts` 声明和 README 当前用法；迁移指南/CHANGELOG 中仅保留标注为旧入口的映射。
- `./client` 子路径 + `client.d.ts` + `genRuntimeTypesShim()` 及类型垫片写入（`dts.ts`）+ `scripts/typecheck-latest.mjs` 的垫片拷贝步；`typesVersions` 删除旧 client 映射（如现场不存在则不新增），并为 `runtime` 增加映射。
- 远程 exposes 类型声明（`dts.remote.*.d.ts`）**保留**（那部分仍需要生成）。
- `./internal/*` **保留**（内部门面的实现依赖；文档不提）。

---

## 3. 改写对照（迁移用）

### 3.1 应用代码（4 个使用点）

```ts
// ── 宿主桥（bridge.ts）──
- import { provideAppContext } from '@fulgurjs/federation/context'
- import { provideAppContext } from 'virtual:fulgurjs-api'
+ import { provideAppContext } from '@fulgurjs/federation/runtime'

// ── 远程 boot（federatedBoot.ts）──
- import { requireAppContext, getAppContext } from '@fulgurjs/federation/context'
- import { requireAppContext, getAppContext } from 'virtual:fulgurjs-api'
+ import { requireAppContext, getAppContext } from '@fulgurjs/federation/runtime'

// ── 页面路由表（pages.ts）──
- import { definePages } from '@fulgurjs/federation/pages'
- import { definePages, remoteSchema } from 'virtual:fulgurjs-api'
+ import { definePages, remoteSchema } from '@fulgurjs/federation/runtime'

// ── 组件/页面 ──
- import { loadRemote } from 'virtual:fulgurjs-runtime'
- import { loadRemote, remoteComponent } from 'virtual:fulgurjs-api'
- import { remoteComponent } from '@fulgurjs/federation/vue'
+ import { loadRemote, remoteComponent } from '@fulgurjs/federation/runtime'
```

### 3.2 全量来源映射（含历史版本）

| 来源 | 旧写法 | 新写法 |
|---|---|---|
| ≤2.x | `virtual:fulgurjs-runtime` | `@fulgurjs/federation/runtime` |
| ≤2.x | `@fulgurjs/federation/context` | `@fulgurjs/federation/runtime` |
| ≤2.x | `@fulgurjs/federation/pages` | `@fulgurjs/federation/runtime` |
| ≤2.x | `@fulgurjs/federation/vue` | `@fulgurjs/federation/runtime` |
| ≤2.x | `import remoteSchema from 'virtual:fulgurjs-remote-schema'`（default） | `import { remoteSchema } from '@fulgurjs/federation/runtime'`（具名） |
| 3.0.x | `virtual:fulgurjs-api` | `@fulgurjs/federation/runtime` |
| 任意 | tsconfig `compilerOptions.types` 含 `"@fulgurjs/federation/client"` | **删除该项**（类型改由包自身提供） |

---

## 4. 实施步骤（按文件分组）

### 组 A：插件产物与入口（packages/plugin）

1. `package.json`：exports 新增 `./runtime`（`types` + `import`，不设 `require`）和 `./internal/vue-adapter.js`（插件内部依赖）；删除 `./client`；为 `runtime` 加 `typesVersions` 映射；`files` 删除 `client.d.ts`；版本同步为 4.0.0。
2. 新增 `src/runtime-entry.ts`（聚合导出，作为类型源）→ `dist/runtime-entry.d.ts`；新增不依赖 runtime 的 Vue adapter 工厂（例如 `src/vue-adapter.ts`），由物理入口绑定真实 `loadRemote`，由 dev 门面绑定 runtime proxy。
3. 构建脚本（`package.json` 的 build）：生成 `dist/runtime-entry.js` 包装；使 `dist/vue.js` 从 `./runtime.js` 导入 `loadRemote`，不得把 runtime source 再打进 Vue bundle；最后一次 clean 后再生成 wrappers / adapters / d.ts。gzip 门禁对象保持不变。
4. `src/virtual.ts`：
   - `genApiFacade` 重构为**内部惰性门面**（serve 用，导出面与 `/runtime` 一致），删除 build 形态分支（build 不再需要门面）。
   - `genRuntimeProxyModule`：并入门面（避免两套近似模块），或保留但由门面引用。
   - dev 门面从 `@fulgurjs/federation/internal/vue-adapter.js` 取工厂，用同步工厂创建 `remoteComponent`；runtime proxy 作为 `loadRemote` 参数传入。该 internal adapter 只依赖 Vue，不得导入 `runtime.js`。
5. `src/index.ts`：
   - resolveId/load：删除 `virtual:fulgurjs-api` 分支；新内部门面虚拟 id 的解析。
   - `post.transform`：expose 目标改写扩展到新 specifier（2.2）；`remoteSchema` 拆写（2.3）。
6. `src/dts.ts`：删除 `genRuntimeTypesShim` 与垫片写入；注释同步（类型由包提供）。
7. `client.d.ts`：删除文件（`files` 白名单同步）。
8. `src/init.ts`：核对清单第 4/5 条文案改为新入口。
9. `scripts/typecheck-latest.mjs`：删除垫片拷贝步；确认样例经包 exports 解析。

### 组 B：测试（packages/plugin/tests）

10. `exports.test.ts`：新增 `./runtime` 的 ESM/types 断言，负向断言无 `require` 条件；更新 `typesVersions` 覆盖检查；删除 `./client`；保留旧路径删除断言；新增 **`virtual:fulgurjs-api` 已不可用**负向断言。
11. 类型回归：覆盖两种 TS 解析路径——现代 `moduleResolution: bundler` 通过 package exports，旧 `moduleResolution: node` 通过 `typesVersions`；样例不配置 `compilerOptions.types` 也能解析运行时类型。分别比较 JS value export 列表和 type-only export 白名单；加入 `RemoteInput` 与 `PagesOptions.schema` 的真实消费样例，防止沿用旧垫片的签名漂移。
12. `virtual.test.ts`：断言门面导出面、runtime 调用期转发、`remoteComponent()` 同步返回 Vue 组件；dev/build 用例都执行 API 行为，不只断言生成文本。
13. `types-repro/*.ts`：样例改为从 `@fulgurjs/federation/runtime` 导入；加入 `definePages` + `remoteSchema` 宿主页面用例及 expose 页面用例。
14. 新增：`exports["./runtime"]` 静态依赖图只有一份 runtime 内核的断言（不把 `dist/index.js` 生成的 virtual runtime 源码字符串计作该模块图）；`remoteSchema` 宿主拆写、别名/混合 type import、多 import 语句、expose 目标改写的契约断言；用真实 Vue mount 覆盖 `remoteComponent` 同步语义。

### 组 C：仓库文档与工具

15. `README.md`：§2 唯一受支持的运行时入口、§6/§8/§9 标题与示例、TS 提示（类型随包提供、不再加 client 类型入口）、§10 排障（去掉 client 条目）；当前示例改新写法，旧写法只留在迁移历史。
16. `CHANGELOG.md`：4.0.0 破坏性说明 + 全量映射表，含 ≤2.x / 3.0.x；说明 ESM-only、Vue 依赖语义、旧 `client.d.ts` 里未被 JS 门面兑现的 runtime/default 类型名。
17. `docs/迁移指南.md`（**已发布文档**）：对照表第 10 行、三B-1 节、context/vue 示例全部改新入口。
18. `e2e/scripts/pack-smoke.mjs`：根入口与 `/config` 仍用 CJS resolution 检查；`/runtime` 在临时 ESM consumer 中实际 `import()`，并用 TypeScript 验证 `exports` + `typesVersions`。consumer 源码的 host 与 expose 都真实导入 `/runtime`，dev 探测获取转换后的 `/src/main.ts`、expose 模块和 `remoteSchema` 路径；build 确认远程容器产物存在。不能只请求模块 URL 或只检查 package.json。更新所有**已跟踪且受包元数据影响**的 lockfile 与 tarball fixture；先检查初始 `git status`，不得覆盖既有未跟踪锁文件或 testbed 用户状态。
19. `docs/_workspace/local-integrate/init.ts` + `init-templates.ts`：模板与补丁的导入来源全部换新；`integrate.mjs` 重编。
20. `fixtures/host-auto/src/App.vue`：改用新入口（保留"新旧同单例"断言的替代形态：`/runtime` 与内部代理指向同一单例）。

### 组 D：testbed 与双环境实测

21. 实测前记录 testbed 的准确绝对路径、源仓库 commit 和应用包管理器；验证源现场 git status 后只对一次性拷贝操作。testbed 现场 12 个文件的导入全局替换为 `@fulgurjs/federation/runtime`（精确来源串，大小写敏感；含 .vue/.ts 全类型），替换后 grep 复核当前代码零旧入口。
22. 三应用重装本地 tarball → dev 三服务重启（清 `.vite`）→ 27 页矩阵 + 交互套件（含三按钮、签署认证 z）+ 待办闭环。
23. prod：三应用删旧 dist 重建（admin 必须跑 postBuild）→ 部署 8662 → 五端点 + 矩阵 + 交互套件。
24. 故障态证据（dev/prod 各一套）；测试数据用后即清；收尾关全部自起进程（按端口精确，8085/nginx 永不动）。

---

## 5. 验收清单

**门禁（必过）**

- [ ] `pnpm --dir packages/plugin test` 全绿（含新增负向与漂移断言）
- [ ] `pnpm --dir packages/plugin run typecheck` 与 `run typecheck:latest` 双口径 0 错误（**3.0.0 的教训：latest 口径必跑**）
- [ ] `pnpm --dir packages/plugin run build`：gzip 门禁 ≤6144B；从 `exports["./runtime"]` 可达的完整静态图只有一份 runtime 内核；`dist/vue.js` 从 `./runtime.js` 获取 `loadRemote`；错误码三方一致
- [ ] `pnpm --dir e2e exec playwright test --project=dev --project=fault`
- [ ] `pnpm test:prod`
- [ ] `node e2e/scripts/pack-smoke.mjs`（tarball ESM consumer：实际导入新入口、现代/旧 TS 类型解析、Vite build、dev transform 与页面加载）
- [ ] CJS 用户从包根和 `/config` 仍能解析；从 `/runtime` 的 `require()` 按契约失败；ESM import 不需要手工配置 `types` 或类型垫片。
- [ ] Vite 5 与当前支持的 Vite/Rollup/Rolldown 矩阵至少各覆盖一次；检查应用源 import 的 `/runtime` 未被预扫描/优化路径绕过 expose 惰性化和 schema 拆写。
- [ ] `remoteComponent` 在 dev 和 prod 都能同步创建并挂载组件；调用结果不是 Promise；无双 Vue / 双 runtime 身份。
- [ ] `remoteSchema` 在 host 页面中等待 dev probe 后执行 R3 校验；build 仍为空表并按既有语义降级。

**负向（必须留下证据）**

- [ ] `import { loadRemote } from 'virtual:fulgurjs-api'` → 明确失败（模块不存在/解析错误可读）
- [ ] `import { loadRemote } from '@fulgurjs/federation'`（根）→ 明确失败（该名不是导出）
- [ ] tsconfig 仍含 `"@fulgurjs/federation/client"` 的项目 → 报错信息可读，迁移文档给出删改法

**双环境实测（testbed 全新拷贝既有现场）**

- [ ] dev + prod：27 页矩阵 27/27、交互套件全过、待办闭环 5/5、三按钮、签署认证弹窗 z=5000 顶层
- [ ] 证据归档 `docs/screenshots/tb-{dev,prod}-<新版本>/` + `INDEX.md` 更新

**发布**

- [ ] 版本三处同步（package.json / version.ts / CHANGELOG）；测试守漂移
- [ ] 实现与测试完成后先提交可审查代码；push/tag/Release/OIDC 发布作为单独发布阶段，在明确发布指令后执行 → `npm view dist-tags` / provenance / tarball 复核
- [ ] 旧大版本 deprecate 文案指向新版本（含 3.0.x）

---

## 6. 风险与回退

| 风险 | 说明 | 缓解 |
|---|---|---|
| expose 改写漏网 | 远程页面 import 未命中 expose 文件或被 optimizeDeps 预扫描路径绕过 → 副本链复发 | pack smoke + Vite 版本矩阵覆盖真实 host/expose 源码；转换结果断言；testbed 实测 |
| `remoteSchema` 拆写误伤/遗漏 | import 语句改写破坏别名或只改 expose、不改 host | 明确静态导入支持边界；es-module-lexer + magic-string；host `definePages` 实跑并断言等待 probe |
| `remoteComponent` dev 返回值变化 | 动态导入把同步 `Component` 变成 `Promise<Component>` | 使用注入式同步组件工厂；dev/prod Vue mount 回归 |
| Vue optional peer 被入口静态依赖 | 不安装 Vue 的运行时入口消费者加载失败 | 文档明确 `/runtime` 需要 Vue；单测验证 package 根/CLI 仍可无 Vue 使用 |
| runtime 内核被 Vue bundle 再打包 | wrapper 自身很小但 `/runtime` 子图含两份内核；插件入口另含用于 virtual runtime 的源码字符串 | 让 Vue bundle externalize 到 `./runtime.js`；检查 `exports["./runtime"]` 依赖图及 tarball 产物，区分插件生成器字符串 |
| 类型/JS 导出面漂移 | JS value 与 type-only 名称混在一份测试中，或兼容类型声明过度承诺 | 分开维护值导出清单、类型清单；bundler 与 node10 两种类型解析验证 |
| ESM-only 被误当成 CJS 可用 | package exports 无 `require` 条件 | 文档明确不支持；smoke 按 ESM 加载，不用 `createRequire` 检查 `/runtime` |
| 版本跳变影响 | 破坏性改名与类型入口删除 | 4.0.0、CHANGELOG 映射、testbed 全量实测 |

**回退**：代码改动先作为一个可审查提交验证；npm 发布、旧版本 deprecate 和 release tag 单列为发布阶段。npm 版本不可覆盖，若已发布则通过新补丁版本修复/回退，不能把 `git revert` 描述成撤销发布。

---

## 7. 遗留 / 后续可选项（不在本轮）

- **`remoteSchema` 搬进插件校验**：插件在 dev 启动时已探到 remote exposes 清单，可直接以三段式告警做 R3 校验，用户面彻底不再需要 `remoteSchema`（页面表退化为纯数据）。收益：入口面 100% 静态、少一个概念；成本：校验时机从"页面加载"前移到"dev 启动/构建"，需设计告警出口与 build 期语义。**待单独评估。**
- 组 A 第 4 条的门面与 proxy 合并（减少一套近似模块）——实施时若风险低可一并做，否则保留双模块。
- README 是否需要"从 qiankun 迁移"章节补充新入口（现有迁移指南已覆盖，仅需替换写法）。

---

## 8. 本轮实施记录（2026-09-24）

- 4.0.0 代码、类型入口、迁移文档与本地 tarball 已完成；`/runtime` 的 ESM 导入、CJS 拒绝、旧 `/client` 删除均由 pack smoke 覆盖。启动预热与按需探针的 `remoteSchema` 具名导出已统一，真实 dev 页面复测通过。
- 核心包构建通过（`runtime.js` gzip 6100B），28 个测试文件 287 项通过，`typecheck` 与 `typecheck:latest`（bundler/node10）通过；fixture e2e dev/fault 14/14，prod 9/9，tarball smoke 通过。prod 测试的一次运行中双 Vue 版本断言曾出现 3.4.38，随后原样重跑 9/9；该竞态仍需后续观察。
- 隔离 testbed 副本中，dev/prod 各完成 27/27 页矩阵、14/14 交互、按同一实例和任务 ID 核对的待办闭环 5/5、远程入口故障与恢复。六个 Lowcode 页面按原有 U2 规则记为 `u2-blank`，不代表功能内容已渲染；Lowcode/Monaco 的既有页面错误保留在交互 JSON。证据见 `docs/screenshots/INDEX.md`。
- 自建测试流程已审批结束（实例状态 2，无遗留待办）。本轮启动的 8773/4529/4669 与独立 NGINX 9010 均已关闭；原有 8085 后端和 8662 站点未动。这些结果来自临时副本，不能代替新 SVN 工程验收。代码提交状态以 Git 历史为准；发布清单仍待单独指令。
