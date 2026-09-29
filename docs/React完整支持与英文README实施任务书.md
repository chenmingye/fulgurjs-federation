# React 完整支持与英文 README 实施任务书

> 修订日期：2026-09-28。现场核对基线：插件 `packages/plugin/package.json` 为 **5.0.4**。
> 本文是两项功能的实施与验收合同：① React 浏览器应用正式支持；② 完整英文 README。
> 本次文档修订不实施代码、不提交、不发版。用户把执行文案交给下一位 AI 后，即授权该执行 AI 按本文实施、修复、验证、Git 提交推送与正式发布，无需再等待一句“按手册做”。
> 如果实施开始时版本已经变化，先记录实际 commit、版本和工作区状态，再对照本文调整。不得把本文里的基线版本当成 npm 的永久 latest。

## 0. 阅读要求、完成定义与目录规则

### 0.1 执行顺序

完整阅读本文件后，先列出 G0—G8 门禁与验收矩阵，再开始修改。每一项标记为 PASS / FAIL / BLOCKED / NOT RUN，并附原始证据路径；只写“支持 React”“文档已翻译”不构成交付。

- G0：现场基线、目录、工具和依赖兼容性核对。
- G1：公开 API 合同、加载与错误恢复、会话语义实现。
- G2：导入图、开发态转换、共享依赖、类型与构建发布接线。
- G3：React fixtures、可复制 examples、可持续运行的测试源码与 CI。
- G4：中英文 README、包内文档和所有受影响的现行使用说明同步。
- G5：发布前必要质量门禁：build、单元回归、有效 tsconfig 类型检查、tarball 可消费性。
- G6：Git 提交推送、tag、Release、正式 npm 发布与来源核验。
- G7：安装正式 registry 包，执行 React 与 Vue/MES 的 dev、生产形态完整验收。
- G8：证据索引、问题归因、收尾、最终报告与文档提交。

先完成必要的发布前质量检查，再发版；耗时的真实项目完整验收放在发版后。CI 自动运行的集成测试按仓库工作流保留，不以“少测一轮”为理由删 CI 门禁。

### 0.2 目录与版本控制硬规则

仓库根：`/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-federation`。

1. 长期维护的插件源码放 `packages/plugin/`；可复用 fixtures 放 `fixtures/`；examples 放 `examples/`；长期测试源码放受 Git 跟踪的 `e2e/tests/`、`e2e/scripts/`；任务书与最终报告放 `docs/`。
2. 本轮临时工作、安装隔离副本、日志、浏览器 profile、构建对照、截图统一放 `testbed/runs/<本轮唯一编号>/` 内，建议子目录 `work/`、`evidence/`。中断后续做沿用同一个编号，不重新建一轮目录。
3. 不在 `Plugin_Workshop` 外层创建 clone、round2、evidence 等目录，不重建已有验收目录，不把临时文件散落到源码旁边。
4. `testbed/` 已忽略。新增 fixtures 的生成类型、dist、截图、测试结果，以及 `packages/plugin/README.en.md` 等构建复制文件也必须纳入准确的忽略规则。逐个用 `git check-ignore` 核对；禁止把截图、业务数据、cookie、token、浏览器 profile 或私有 MES 源码提交到 Git。
5. 不删除用户原有未提交文件。当前还有其他任务书修改与未跟踪文件，必须逐文件区分本轮范围，禁止 `git add .` 把它们一起提交。
6. **任何 SVN 测试副本永远不得提交 SVN**。禁止 `svn commit`、`svn import`、`svnmucc`，也禁止在 Git 中加入 SVN 副本。只允许本地接入、构建、测试与保存补丁。
7. **8662 是 MES 模块联邦长期复测站点**。需要用最终正式包构建后更新，并保留备份；验收结束不删除部署、不停止端口、不停止常驻 Nginx、不停止 8085 后台。
8. React fixtures 的生产验收使用隔离 Nginx 实例与空闲端口，不能覆盖 8662 的 MES 站点。新端口先查占用；冲突就换空闲端口，禁止杀未知进程。
9. 停止的只能是本轮记录并确认归属的 dev、fixture、浏览器和隔离 Nginx 进程。保留用户已有服务与浏览器。

### 0.3 范围与对外承诺

本轮“React 完整支持”具体指：**React 浏览器客户端宿主和远程**都能以当前插件正式包运行，组件/普通模块加载、共享依赖、页面表、初始化/会话、错误恢复、懒加载、开发态类型与生产部署均有真实验证。

这不包含 React Server Components、SSR/hydration、Next.js 全栈集成、React Native、Node 服务端加载远程、跨框架组件直接混渲染、沙箱或 CSS 隔离。两份 README 必须把这些边界与已支持能力放在一起说明，不写不受限制的“全部 React 场景均支持”。

英文 README 是完整当前用法文档，运行时中文诊断保持中文。新增英文 README 不意味着本轮要增加错误国际化选项。

## 1. 对原任务书的纠正与现场事实

以下是本次对照源码后发现的问题，执行时不得继续沿用旧判断。

| 原文问题 | 当前事实与本任务的修订 |
|---|---|
| 把 `defineConfig({ plugins: [...] })` 放进 `fulgurjs.config.ts` | 这是 Vite 配置。`fulgurjs.config.ts` 必须默认导出直接的 `FederationOptions`；`vite.config.ts` 才放 `react()` 和 `federation(fulgurjsConfig)` |
| 宣称当前缺少 `peerDependenciesMeta` | 当前已有 `vue: { optional: true }`。应保留它并增加经过测试的 React 可选 peer，不把“修复 Vue optional 缺失”写进 CHANGELOG |
| 只新增 `react-adapter.ts` 就能接入所有链路 | `transform.ts` 的 `rewriteRuntimeEntryImports` 当前只识别 `/runtime`；`virtual.ts` 的 `genApiFacade()` 当前固定连接 Vue 适配器。React 必须补全对应开发态转换与框架分离门面 |
| `timeout` 直接透传 `loadRemote` | 当前 `LoadRemoteOptions` 只有 `shareScope/retries/fallbackModule`，没有 `timeout`。入口超时在远程配置；React 组件超时如提供，必须由适配层实现并与入口超时区分 |
| API 先写 `loading/error`，后面又写 `fallback/error` | 本文统一为 React 的 `fallback/error/retries/timeout`；不新增多个同义历史选项 |
| `React.lazy` 加 ErrorBoundary 就能恢复 | lazy 缓存 Promise 及结果，失败也会留在该 lazy 实例上。必须重置错误边界并创建新的加载尝试；仅恢复远程服务、仅清边界或仅再 render 不够 |
| mounted ref 就能处理 StrictMode 与切换 spec | 还必须用每轮 effect/请求的取消标识或序号防旧结果覆盖新结果；共享请求不等于 effect 自动幂等 |
| 只测 React 19，peer 却声明全部 `>=18` | 必须真实测试 React 18 与实施时的 React 19 稳定版，精确记录版本；不能默认保证未来 React 20+ |
| “core 零改动”“shared 不准有 React 特判” | 可以以通用机制为首选，但 JSX 自动运行时、React DOM 子路径、预构建/CJS 闭包和 HMR 必须实测。如果存在真实缺陷，应修复对应机制并增加回归，不让用户自己解决插件缺陷 |
| `.tsx` 类型“预计可用”；Vue 类型缺失自动 any | 必须真实生成、编译和验证错误 props。fsRoot 可达时，缺 Vue 类型不等于会自动 any；不能把“缺依赖”和“fsRoot 不可达”混为一谈 |
| 英文 README 仅放仓库根 | 当前 build 明确复制中文 README，包 `files` 也只列中文 README。必须同步复制英文文件、加入发布清单、验证 tarball 链接 |
| 既有 Vue 单测零改动就证明完全无回归 | 单测通过是证据之一，不能代替真实 Vue 及 MES 双环境验收。尤其提取 `createHostPages` 关联逻辑会触及缓存与 KeepAlive |
| MES 是 Vue-only，本轮不上 testbed | 本轮影响公开入口、共享机制或 Vue 页面逻辑时必须回归 MES；不能因新增能力是 React 就跳过旧 Vue 用户路径 |
| 30 分钟没定位就复制逻辑并留下 TODO | 时间不是功能降级理由。不交付两份会漂移的页面解析实现，不用 TODO 冒充完成 |
| 超出 gzip 预算就改预算通过 | 先查依赖图和实现；不得自动放宽门禁掩盖膨胀。必要预算调整要写清测量口径、前后值与原因 |
| 清掉全仓全部旧表述 | 更新现行使用说明；历史 CHANGELOG、历史验收报告应保留当时事实，可补版本标识，禁止改成仿佛当时已支持 React |
| “用户未回复即按默认值执行” | 本文是推荐并明确化的实施合同；执行授权来自用户交付执行任务，不把沉默当成批准 |

## 2. 目标 API 与配置方式（唯一约定）

### 2.1 导入入口

- 构建期：`import federation from '@fulgurjs/federation'`。
- Vue 浏览器应用：保留当前 `@fulgurjs/federation/runtime`。
- React 浏览器应用：新增 **`@fulgurjs/federation/react`**，在这个入口同时取得通用运行时 API 和 React 适配 API，不要求 React 使用者另装 Vue。
- 不新增 `/client`、另一个框架包或新的配置包装函数。不恢复已删除的 `/config`、聚合 `root/apps[]`、`loadRepoConfig`、`federationOptionsForApp` 或 CLI `--app`。
- `/react` 为浏览器 ESM 入口，与当前 `/runtime` 一样不承诺 `require()`。不要为了给 Node 原生解析错误翻译中文而新增 CJS 浏览器入口。

`/react` 的通用公开值与类型，以现行 `/runtime` 的**通用**批准清单为依据，包括 loadRemote/loadShare、注册/预取/容器、context、definePages/validatePages、remoteSchema 及对应类型。不得将 Vue 的 `Component`、Vue `RemoteComponentOptions`、`createHostPages` 或 `keepAliveNames` 混入 React 入口。

当前源类型入口、手工生成 JS 导出面有细微差异（例如 `clearSessionState`），实施前要先列清楚值导出、类型导出与内部用途；对新入口逐项定稿，不用 `export *` 意外扩张公开 API，也不顺带恢复已删除的历史入口。

React 适配层固定新增：

```ts
remoteComponent<Props>(spec, options?)
useLoadRemote<Module>(spec, options?)
RemoteErrorBoundary
createReactHostPages(options)
```

命名清楚、无同义别名。JS 值、d.ts、examples、中文与英文 API 表必须一致。

### 2.2 每个应用一份配置；示例区分两个文件

远程项目根目录：

```ts
// fulgurjs.config.ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'remote-react',
  exposes: {
    './Button': './src/Button.tsx',
    './utils': './src/utils.ts',
    './pages/home': './src/pages/Home.tsx',
    './pages/detail': './src/pages/Detail.tsx',
  },
  // 有初始化需求才添加，不为简单 Button 强制建启动文件：
  // setup: './src/fulgurjs/setup.ts',
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig({
  plugins: [react(), federation(fulgurjsConfig)],
})
```

宿主项目根目录：

```ts
// fulgurjs.config.ts
import type { FederationOptions } from '@fulgurjs/federation'
import { pages, remotePrefixes } from './src/federation/pages.data'

export default {
  name: 'host-react',
  remotes: {
    'remote-react': {
      dev: 'http://localhost:5103',
      prod: '/remote-react/',
    },
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions

// 仅 CLI 读取；同一纯数据模块也供浏览器页面适配器使用。
export const hostPages = { pages, remotePrefixes }
```

宿主的 `vite.config.ts` 用同样的两行联邦导入和单次 `federation(fulgurjsConfig)`。页面数据文件不导入 React、路由库或浏览器对象，CLI 能独立求值。

上述 shared 是**目标最简配方**，不代表已实测所有 React 子路径可用。G2 必须核对 `react/jsx-runtime`、`react/jsx-dev-runtime`、`react-dom/client` 的实际处理。如确实需要额外配置，先修复可由插件可靠处理的缺陷；最终 README 只保留实测有效的一套清晰配方，写出必要的额外字段及原因，不能让示例依赖隐藏补丁。

### 2.3 普通组件使用

```tsx
import { remoteComponent } from '@fulgurjs/federation/react'

interface ButtonProps {
  label: string
  onClick: () => void
}

// 放模块顶层，不能在每次 render 中重新调用工厂。
const RemoteButton = remoteComponent<ButtonProps>('remote-react/Button', {
  fallback: <p>正在加载远程按钮…</p>,
})

export default function App() {
  return <RemoteButton label="远程按钮" onClick={() => console.log('clicked')} />
}
```

普通远程模块：

```tsx
import { useLoadRemote } from '@fulgurjs/federation/react'

type Utils = { formatMoney(value: number): string }

export default function Price() {
  const { data, error, loading, reload } = useLoadRemote<Utils>('remote-react/utils')
  if (loading) return <p>正在加载…</p>
  if (error) return <button onClick={() => void reload()}>加载失败，重试</button>
  return <p>{data?.formatMoney(12.5)}</p>
}
```

类型参数表示编译期合同，不是运行时校验。发布示例必须来自可编译的真实工程，不能把省略代码片段当作完整可复制工程。

## 3. React 适配 API 的精确语义

### 3.1 `remoteComponent<Props>(spec, options?)`

返回可渲染的 React 组件类型，Props 能约束 JSX 使用。内部按需加载、包含 Suspense 和错误边界，最简用户用法无需手写这些包装。

| 选项 | 类型与默认 | 语义 |
|---|---|---|
| `fallback` | `ReactNode`，默认 `null` | 本次加载 pending 时的占位；不同于失败占位 |
| `error` | `ReactNode` 或 `(error: unknown, retry: () => void) => ReactNode`，默认内置中文占位 | 加载失败或子树渲染错误的展示；工厂收到真实错误与重试方法 |
| `retries` | `number`，沿用当前运行时默认值 | 透传现行 `loadRemote` 的重试选项；不另叠一套无上限自动重试 |
| `timeout` | `number`，默认不增加适配器超时 | 如果提供，表示这次组件加载等待上限，单位 ms；不是修改远程入口的配置超时，也不宣称取消共享网络请求 |

实施时必须明确参数非法值的处理，与已有诊断风格一致；timeout/retries 不接收负数、NaN 等无意义输入。不能在类型里声明某选项，实现却忽略。

加载约定：

1. 工厂创建和页面表声明**不触发** loadRemote，不发业务 expose 请求。
2. 第一次渲染才启动加载，经 loadRemote 完成容器协商与可选 setup/onSession，再解析组件导出。
3. 首选 `module.default`；如支持运行时直接返回组件的其他合法形态，必须显式校验和测试。不能把任意模块 namespace、字符串、数字当成组件。
4. 测试函数组件、class、`memo`、`forwardRef` 导出。不要用 `React.isValidElement` 验证组件类型，那是验证元素对象的函数。ref 透传只在实际实现并有 React 18/19 测试时承诺；本轮至少必须正确渲染 forwardRef 导出。
5. props、回调、children 正常透传；默认不吞错、不返回看似成功的空页面。
6. runtime 原有 MFU 错误带 code/cause，适配器展示时保留。不要一律包成 UNKNOWN。
7. 渲染期异常与加载异常分开记录。ErrorBoundary 不会自动捕获事件处理器和任意异步回调异常，README 不能声称“React 全部错误都捕获”。

默认错误占位应包含：错误码、真实根因、明确修法，以及可操作的“重试”按钮。优先保持已有中文错误格式。新增适配器专用诊断若有必要，在统一错误码登记、手册与测试中同步；不冒用语义不同的旧 MFU 错误码。

**恢复必须解决 lazy 缓存**：点击重试要清掉该实例错误态并建立新的 lazy 加载尝试。只清 ErrorBoundary 不算；同一个已拒绝 lazy 实例仍会再次抛错。不要在每次普通 render 中重建 lazy 导致状态反复重置，只在显式 retry、spec 变化或新登录代次等受控条件改变加载尝试。

超时或过期尝试后来完成时，不得覆盖当前尝试，不得造成未处理 Promise rejection。重试不清空整个共享依赖图，不重新执行已成功的应用级 setup。

还要分别验证入口请求失败与已找到入口后的 chunk 请求失败。浏览器原生 ESM 失败缓存可能影响恢复，不能只在 mock loadRemote 上证明“服务恢复后可重试”。如实际浏览器场景仍无法恢复，应修复必要的运行时恢复机制并测试，或者如实标 BLOCKED，不能写为 PASS。

### 3.2 `RemoteErrorBoundary`

作为独立页面级兜底导出，props 至少包括 `children`、可选 `fallback`（节点或接收 error 与 reset 的渲染函数）、可选 `onError(error, info)`，以及明确的重置机制（例如有测试的 `resetKeys`）。具体签名定稿后四处同步。

内置 remoteComponent 的错误边界负责本组件并默认展示错误。外层 RemoteErrorBoundary 捕获的是传到它的子树错误；不能在示例中声称外层能覆盖已经被内层处理的错误。用户想改某个远程组件的占位，就用该组件的 `error` 选项。

`reset` 只重置边界状态；独立边界本身不必了解任意子组件的 lazy 缓存。文档要说明何时还需要重新创建加载尝试。插件自带 remoteComponent 的 retry 要完成两者。

### 3.3 `useLoadRemote<Module>(spec, options?)`

- 返回 `{ data: Module | undefined, error: unknown, loading: boolean, reload: () => Promise<void> }`。`error` 无错误时使用统一的空值，并在 d.ts/文档说明。
- options 至少支持当前 LoadRemoteOptions 中适用于本 hook 的 `shareScope/retries`。普通 hook 如支持 fallbackModule，必须说明这是用户显式配置的行为，不能悄悄给失败模块成功值。不要把组件专用的 fallback/error/timeout 混入 hook 参数。
- 首次 effect 发起请求；spec 或有效加载选项变化时，清理旧数据/错误并进入新请求。按字段比较依赖，不能因调用方每次 render 创建 options 对象就无限重载。
- 每轮 effect 与 reload 有独立失效标记/请求代次。快速 A→B、B 比 A 先返回、连续 reload、卸载期间返回都只允许最新有效请求写状态。
- StrictMode 的 effect setup→cleanup→setup 必须安全。一个全局 mounted ref 不能代替每轮取消标记；第二轮把它设回 true 会让第一轮结果重新获得写权限。
- 使用当前运行时缓存去重；不宣称重复 effect 从未发生。分别记录 effect 调用、loadRemote 调用、真实网络下载与 setup/onSession 次数。
- reload 可以重走生命周期与失败重试，但不保证重新下载已经成功缓存的模块，也不等于 HMR 或绕过 ESM 缓存。失败写入 error，reload 自身按上述 Promise<void> 合同正常结束，避免按钮调用产生未处理拒绝。
- 读取到新的非空 sessionKey 且宿主重新渲染时，应重新经过 loadRemote 会话同步；context 本身不是 React 状态订阅，不承诺 provideAppContext 一调用所有组件自动更新。

### 3.4 `createReactHostPages(options)`

沿用一份页面数据，返回最少且统一的面：

```ts
{
  pages,
  resolve(path),
  component<Props>(spec),
}
```

`component(spec)` 返回 React 组件类型，与 Vue 使用相同动词；本轮不再新增 `.element()` 同义入口。路由层用 `React.createElement()` 或 JSX 渲染即可。

options 的数据项：`pages/remotePrefixes/deriveSpec/schema/strict/base/beforeLoad`；React 展示项：`fallback/error/retries/timeout`，语义与 remoteComponent 一致。beforeLoad 在每次实际加载尝试前运行，供宿主提供最新 context；不应在页面表创建时调用。

- resolve 保持现有 base、最长前缀、参数解码、query/hash 和 definePages R1—R5 行为；无匹配返回 null，非法参数解码不让全表崩溃。
- 组件缓存按 spec 与登录代次复用。换到新的非空 sessionKey 后重新加载生命周期，避免 React.lazy 已成功缓存使 B 沿用 A 的初始化。
- AppContext 是普通传输快照；宿主登录流程负责 provide 最新值并通过自身状态/路由触发重新渲染。退出时先 clearAppContext，再卸下鉴权内容；不能在清 context 后仍把旧账号页面正常展示。
- 同页 A→退出→B 的测试不允许整页刷新，也不能只比较缓存 key；要显示 B 的真实数据、确认 A 的私有状态已清理。
- React 侧不提供 `keepAliveNames`。普通重复打开可以复用已下载模块，但组件卸载后的表单状态保留不是 KeepAlive；必须在文档解释。React 页表里的 keepAlive 字段不获得 Vue 的保活保证。

路由不作为插件的运行时依赖。examples 至少提供一套经过实测的 React Router 接入：path 在路由表声明时给定，element 渲染组件适配器，让首次页面渲染触发远程加载。若另外给出 `route.lazy` 配方，必须用该路由版本真正支持的 `{ Component }`/`{ element }` 合同，不能把模块 `{ default }` 直接当路由对象。

带参数路由应通过路由库的 params/query 传给远程页面 props；只让页面“加载了”但丢 id 不算通过。base 与 basename 各自负责路径哪一层要写清，不拼出双 base。

## 4. 运行时、导入图与共享页面逻辑

### 4.1 单一运行时与框架隔离

当前 `dist/runtime.js` 是框架无关内核；但**公开 `/runtime` 入口有 Vue 再导出**，不能声称“React 可以直接 import /runtime 且不需要 Vue”。

目标导入图：

```text
构建期 @fulgurjs/federation -> dist/index.js
Vue    /runtime -> runtime-entry.js -> runtime.js + context/pages + vue-adapter
React  /react   -> react.js         -> runtime.js + context/pages + react-adapter
```

两条浏览器入口复用同一个内核，不复制 createRuntime、不把 React 编进 runtime.js、不让 Vue 用户解析 React，也不让纯 React 消费者解析 Vue。

沿用薄入口生成机制：React 类型源入口与生成的 JS 壳分工清楚，`gen-runtime-entry.mjs` 等构建步骤生成正确接线。适配层通过注入 loadRemote 工作，不独立初始化另一套运行时。

静态导入图验证包括传递依赖：`react.js`、context、pages、core 的 JS/d.ts 都不能绕道 Vue；`/runtime` 路径不能出现 React。双框架同一页的受控测试确认 runtime 与 AppContext 指向同一实例。

### 4.2 开发态入口改写是必做项

核对并修改 `transform.ts`、`virtual.ts`、`index.ts` 的 resolve/load/transform 接线：

1. `/react` 的静态 remoteSchema 导入与 alias 在 dev 能拿到真实 schema，不是永久空对象。
2. React expose 中导入 `/react` 的通用 API 与适配 API，委托到当前页面级 runtime，不能初始化第二份内核。
3. Vue 与 React 内部门面要分别连接对应适配器。保留现有 Vue 门面；React 门面不能 import Vue。增加内部解析键时同样核对 exports、types 和 package contents，但不要把内部门面写成应用公共用法。
4. 类型导入、混合类型与值导入、多行/注释/alias、多个 import，以及动态 import 的支持或不改写规则都要有测试。不能机械把字符串 `/runtime` 全部替换成 `/react`。
5. 纯远程、纯宿主、既 expose 又消费的双角色 React 应用都要实测。devSharedSelf 按当前角色推断，不能靠 examples 藏一个未说明的开关才通过。
6. React expose 用到 getAppContext/requireAppContext、hook 或嵌套 remoteComponent 的场景必须浏览器实测，不能只测宿主顶层 Button。

### 4.3 页面核心提取

推荐新增 `host-pages-core.ts`，只抽取确实通用的页面数据校验与解析：definePages、前缀匹配、spec 推导、base、参数匹配、ResolvedHostPage 等。

Vue 与 React 的组件缓存、错误边界、保活/卸载行为由各自适配器负责；可以共享有明确测试的纯代次判断函数，但不把 Vue 特有卸载策略强行变成框架通用行为。

**保留当前 Vue 重要语义**：只在新的非空 sessionKey 到来时重置组件缓存；登出变 undefined 不重建 Vue 包装器，以避免已实测的 KeepAlive deactivate 竞态。现有注释如写“退出时清组件缓存”与实现相反，应同步纠正注释和现行 README，不改正确实现去迎合旧注释。

既有 API 结构、组件命名、KeepAlive include、beforeLoad 次数及加载顺序要保持。新测试可以补充或合理调整分层，但禁止删除、跳过、放松旧断言换取全绿。不得复制两份解析逻辑并留长期 TODO。

### 4.4 生命周期与数据交互

必须在中英文文档画清这条链：

```text
宿主登录/状态更新
  -> provideAppContext（快照 + 函数引用 + 非敏感 sessionKey）
  -> 用户首次打开某个远程页
  -> beforeLoad（如配置，提供最新 context）
  -> loadRemote -> container init -> setup（应用级一次）
  -> onSession（登录代次去重）-> 返回页面模块 -> React 渲染
```

React 远程 setup 不得到 Vue hostApp 的隐式能力。普通应用可以不配置 setup；确需宿主信息时，通过已定义的 AppContext 扩展字段显式传值、方法或已共享的 Context 对象。

- provide/get/require/clear 的标准合同沿用，token 不作为 sessionKey，不伪造 refresh token。
- setup/onSession 失败要拒绝这次加载，保留中文根因、可重试，setup 已成功不重复。
- clearAppContext 作废会话信号与去重，不清共享库或成功模块缓存。
- React Context Provider 的对象身份和值传递与普通 AppContext 快照是不同机制。验证宿主 Provider 与远程消费者（经显式共享同一个 Context 对象）的真实值变化；不宣称插件自动桥接所有 React Context。
- Vue 宿主消费 React 远程纯 TS 模块，以及 React 宿主消费 Vue 远程纯 TS 模块都可测试；Vue/React 组件直接混渲染不属于本轮。

## 5. 共享依赖、HMR、类型与兼容范围

### 5.1 React 同一实例与自动 JSX

至少追踪：`react`、`react-dom`、`react/jsx-runtime`、`react/jsx-dev-runtime`、`react-dom/client`。它们是不同的模块导入路径，不能只看到 shared.react 就断言全链正确。

核对自动 JSX 插件在不同阶段注入的代码、开发预构建缓存、CJS require 闭包、production 门面/TLA 与 manualChunks 循环。现有 matcher 对精确键与前缀有不同处理，不准误把所有子路径映射成 React 根模块的导出。

接受的实现必须证明：host/remote Hooks 调用使用同一个 React 导出对象；DOM renderer 使用相同的 React；正常 render/click/useState/useEffect/Context 全部工作，无 Invalid hook call，无重复 React 根实例。不能通过关闭 JSX 自动转换、关闭 StrictMode 或改用不用 Hooks 的 Button 掩盖问题。

保持 `singleton` 显式配置。正常兼容 semver 不报 MFU-010；真正不兼容且 singleton 的版本要求才测告警/strictVersion 拒绝。原文“不设 singleton + 双版本就一定走 skew 告警”不准确，必须按实际协商条件构造测试。

如需修复 React 相关子路径规则，只修改有证据需要的归一化/转换/共享闭包逻辑，增加回归并同步 Vue 验收。不要给框架名字做无边界全局替换，也不要强制所有用户 eager。确需 eager 的特定配置要有生产对照与原因。

### 5.2 Fast Refresh / HMR

开发时远程 Button、远程页面与远程普通模块的修改，应在宿主可见更新，或准确说明当前支持的更新方式。测试与 @vitejs/plugin-react refresh preamble/跨源加载有关的真实路径。

至少验证：正常更新不出现缺 refresh preamble/重复 refresh runtime/Invalid hook call；页面当前显示正确新内容；若一次编辑引发整页刷新而非保留 state，原样记录。不能把人工刷新后的新代码当成 Fast Refresh。

不强行承诺跨联邦边界完全保留组件 state；当前产品能力必须准确写到文档。新增 React 后的开发路径不能出现只能关闭 React 插件才工作的状态。

### 5.3 开发态类型

对 `.tsx`、`.ts` 和必要的 `.jsx` expose 真实生成声明。核对 dts 直连/shim/any 各自合同，不因 React 而退回永久 any。

必测：

- 可达 fsRoot：默认组件导入、具名普通模块导入、props/回调类型正确；合法消费者项目 tsc 通过；故意错误 props/错误函数参数必须非零，证明不是 any。
- 宿主与远程不共享父目录，远程自己的 tsconfig paths 别名、CSS import、jsx 配置和 React 类型依赖按真实项目可解析。直连带来的 tsconfig 边界要文档化，能由插件解决的声明缺陷要修。
- fsRoot 不可达或 devFsRoot:false：实际生成当前 any 降级声明，默认/具名/副作用导入可解析，无源码类型精度；恢复直连按当前要求重启服务并验证。
- dts:false 不生成，dts.dir 指定路径生效，内部 setup expose 不泄漏到公共模块声明。
- package consumer 真实验证 TS bundler 与仓库承诺的其他解析模式、固定 TS 与最新稳定 TS。用有效 tsconfig，禁止 `tsc 某文件.tsx` 冒充项目检查。
- React 18 使用匹配的 @types/react/@types/react-dom；React 19 也匹配。不能拿 React 19-only 类型定义声称 React 18 已验证。

### 5.4 peer 与版本矩阵

保留 Vue 的现有 optional peer。新增 React 与 React DOM 的 optional peer，推荐只承诺已测试的 18/19 大版本（例如 `>=18 <20`），实际下界必须覆盖所声明最小版本；若只验证 18.3.x，则范围和 README 不得写 18.0.0 已支持。

适配器只引用 react 时，也要区分“包的 peer 合同”和“浏览器 fixture 需要 react-dom”。纯 Vue/纯 React 隔离安装都应无另一框架的必要依赖，不能靠 monorepo 顶层提升依赖通过。

测试版本必须在 G0 用 registry/官方 peer 数据核对后固定。不要沿用旧文档的 `^19` 或插件版本号而不看 React、@vitejs/plugin-react、React Router、Vite、Node 是否兼容。

至少覆盖：React 18 与 React 19；已有 Vite 6/7/8 CI 主矩阵中的 React 用例；现有最低 Vite 5.1 声明的合理验证（例如匹配的 React 插件定时 job）；现有 Node 最低支持与当前 CI Node 的包导入/类型/CLI基本验证。React 与 Vite 不必所有组合都做重复 MES 验收，但每项支持声明要有对应证据。

## 6. 构建、examples、英文 README 与正式包

### 6.1 按实际构建链接线

核对 `packages/plugin/package.json`、`src/react.ts`、`src/react-adapter.ts`、`scripts/gen-runtime-entry.mjs`、`scripts/gen-runtime.mjs`、typesVersions、exports、files、现有 tarball smoke、CI 和 publish 工作流。

必须满足：

- `./react` 条件导出有正确 types/import，生成文件与源公开签名一致；必要内部适配器解析键与构建产物一致。
- React、React DOM 外置，不把框架副本打进插件适配器；运行时 ESM 不内联内核。
- tsup 的 clean 与多阶段 build 不删除先前生成的入口/core/d.ts；全新删除**本插件可再生产 dist**后 build 成功，再 pack 核实，不能靠陈旧文件存在通过。
- React core 与适配器的传递类型依赖完整，不能用插件自己的 skipLibCheck 掩盖 consumer d.ts 失败。
- publish 工作流新单测如依赖 React fixture，应安装对应测试依赖，不只更新 CI 忘记 publish。
- 现有 runtime gzip ≤9216B 守住。React 适配器建议目标 gzip ≤3072B（剔除 external React，zlib level9）；记录 raw/gzip 与依赖图。超目标先优化并分析，可论证新的适配器预算，但不得悄悄调整硬门禁或自动“以实测为准”放行。

### 6.2 fixtures 与 examples

新增受维护的 `fixtures/host-react`、`fixtures/remote-react`，包含可交互 Button、两条独立页面、参数页、普通模块、可选生命周期与 Context 测试场景。React18 与19验证采用可重复安装方案，不反复污染同一个 node_modules 后混淆版本。

新增 `examples/react-host`、`examples/react-remote`：每个是独立可启动的小工程，有 package.json、vite.config.ts、fulgurjs.config.ts、有效 tsconfig、index.html、src 和说明。与既有 examples 的“配置样例”区别写清。

examples 自身要支持 registry 安装，不能依赖 `link:`、`workspace:`、作者机器绝对路径或父目录包。发版后在隔离目录逐个复制运行 CLI explain、类型检查、dev 与 build，完整 host/remote 联调成功。

新 fixtures/scripts 必须进入现有 Playwright projects 的实际匹配范围。要用 `--list` 或等效清单确认新增用例确实执行；测试文件名字看起来正确不算。现行 prod-setup 脚本只构建/复制五个 Vue fixtures，React 部署、Nginx 模板路由、SPA fallback、端点与清理都要补全。

### 6.3 英文 README 完整性

形态固定：仓库中文 `README.md` 保留为默认，新建完整 `README.en.md`，顶部相互提供语言链接。

先制作“章节与公开 API 对照表”，按**实施后的当前中文 README**翻译，不抄固定的十节/41码等过时数字。内容必须包含：

1. 品牌与定位、真实能力与边界、安装与 peer；
2. Vue、React 两种清晰导入点及独立单项目配置；
3. 普通模块、远程组件、多页面路由、context/setup/onSession；
4. 所有公共 API 的签名、参数、默认、返回、组合用法、失败和重试；
5. build/dev、产物与端点、remoteEntry/manifest/index/固定配置文件的缓存规则；
6. 懒加载四层区分、下载与执行、显式预取及测量口径；
7. React Hooks、共享子路径、StrictMode、Context、Fast Refresh、路由 params 与 base；
8. CLI、全部现行错误码、开发态类型精确/降级行为；
9. 浏览器 ESM、SSR/RSC/Node 等边界、Vue 保活与 React 不承诺保活；
10. 可复制 examples、迁移/设计/边界文档、许可证与维护说明。

英文要自然清楚，host/remote/shared dependencies/version negotiation/module federation 术语一致。项目特定内网 URL、MES 登录信息不进入通用 README。运行时中文错误可附英文解释，但不要更改诊断语言政策。

中文 README 也要更新所有受影响章节，不能受“除某几节外零改动”限制漏掉 API/边界。历史版本记录不翻写成当前事实。`DESIGN.md`、现行迁移指南、对照缺口文档和 examples 索引同步，不能标成 React 已完全支持却漏核心能力。

### 6.4 英文 README 必须随 npm 包交付

- build 增加从仓库根复制 `README.en.md` 到包目录。
- package files 增加 README.en.md；忽略对应生成副本，英文源保留 Git 跟踪。
- 两份包内 README 的语言链接互相可达；文档/examples 链接在 tarball 解包后逐一验证。GitHub 与 npm 相对链接解析不同，发布页面必要时用明确仓库 URL，不能只做仓库存在性检查。
- 验证内部锚点：英文标题不能直接沿用中文 slug；代码片段、表格、标题重复时的锚点要准确。不用简单 grep 当成全部链接已通过。
- 仓库与实际 npm tarball 中的两份 README 内容一致。npm 默认 README 仍为中文，英文可通过显眼语言链接访问，不能声称 npm 默认页面已切换英文。
- 两种语言同时维护，以源码导出与行为为事实源；给当前 API 提供中英对照核验结果。

## 7. 验收矩阵（必做，不以截图替代功能断言）

### 7.1 React 功能正向：dev 与生产形态各独立执行

| ID | 测试动作 | PASS 的具体条件 |
|---|---|---|
| R01 | 冷缓存打开宿主首页但不渲染远程组件 | 不请求未访问业务 expose，不执行对应页面模块；区分入口/共享元数据请求 |
| R02 | 第一次打开 Button/第一个页面 | 远程组件真实显示；click 修改状态；props/children/回调实际生效；Hooks 无异常 |
| R03 | 打开第二页与参数页 | 只新增所需代码/CSS；真实 id/query 进入 props 并显示；返回首个页面无多余重复模块下载 |
| R04 | 同一个组件重渲染与多实例 | 普通 render 不重建组件/反复初始化；实例本地状态互不混用；同模块请求去重 |
| R05 | 创建页面表、resolve 与路由声明 | 零页面加载副作用；最长前缀/base/编码参数/query/hash/无匹配/R1—R5 结果正确 |
| R06 | setup/onSession 与普通模块 | 首次 setup 一次、同代 onSession 去重；并发加载不重复；只预取不执行生命周期；无 setup 应用无需桥 |
| R07 | 同页 A→真实退出→B | clear context、旧 signal 失效、新 sessionKey、B 数据正确，零 A 私有残留；不刷整页，不伪造 token |
| R08 | 宿主 Context/远程 Hooks | 指定共享 Context 对象同一身份，宿主值变化远程可读；React 与 renderer 使用同实例 |
| R09 | useLoadRemote 请求竞态 | 慢 A 快 B、连续 reload、卸载、StrictMode 双 effect 不覆盖最新数据，无未处理 rejection |
| R10 | 浏览器深链强刷 | dev 与 Nginx 生产均正确；base/basename 无双前缀，资源 MIME/路径正常 |
| R11 | React 开发更新 | dev 测真实修改与宿主更新，明确 Fast Refresh/整页刷新行为；prod 此项不适用，标 N/A 并解释 |
| R12 | 双向普通模块跨框架 | Vue host→React remote TS expose、React host→Vue remote TS expose 的值与方法真实正确 |
| R13 | JSX/子路径/CJS/manualChunks | 真实编译自动 JSX；shared 图与 Hooks/DOM正常，无打包循环启动错误 |
| R14 | 页面清单与 CLI | explain 正确；check-pages 对线上 manifest 显示真实来源，页面/spec逐项有映射；没有本地旧产物回退 |
| R15 | 精确类型与降级 | 正向编译过、故意错误 props/参数非零；无 fsRoot 的 any 解析过，生成位置与内部过滤正确 |
| R16 | 独立 examples 正式包消费 | 无本地 link 与父目录依赖，完整配置、安装、CLI、类型、dev/build 联调通过 |

React18 和 React19 至少各有真实 dev 与 Nginx 生产交互用例、Hooks、类型与 StrictMode 验证。主验收 React版本下执行 R01—R16 全套；18下不得只做 Node import 就写“支持 React18”。

### 7.2 负向测试与恢复：不能只是手写 console

| ID | 真实故障注入 | 断言与证据 |
|---|---|---|
| N01 | 冷会话入口不可达/受控阻断 | 显示中文错误码+根因+修法与重试；runtime事件/真实 console日志匹配；恢复后同页点击重试成功 |
| N02 | 入口可达但目标 chunk 请求失败 | 在全新 profile 请求前阻断真实 chunk；不使用已缓存模块；解除后实际验证恢复，无假成功 |
| N03 | 未存在 expose、无合法组件导出 | 报对应真实原因，非法导出不显示空白成功页；恢复或切正确 spec 成功 |
| N04 | 加载耗时超过组件 timeout | pending→超时占位；超时实际生效；迟到结果不覆盖新尝试，用户重试可恢复 |
| N05 | 远程组件 render 抛错 | 真实 ErrorBoundary 捕获、custom error可用；与网络错误归因分开，事件抛错不冒充被边界捕获 |
| N06 | setup 或 onSession 抛错 | loadRemote真实拒绝，code/cause保留；修复后重试，不重复已成功应用初始化，不吞成 fallback成功 |
| N07 | singleton 不兼容 / strictVersion | 配真实版本约束与providers，真正触发 MFU-010/严格拒绝；兼容约束零误报，不能手写警告 |
| N08 | 当前字段配置非法 | React 远程真实 Vite/CLI 非零与中文诊断；正常 fields无需旧无效字段才能运行 |
| N09 | check-pages 指定死线上源 | 报无法验证，严格非零；不访问旧本地dist冒充线上通过 |
| N10 | 纯React不装Vue；纯Vue不装React | 安装/类型/build/dev可用；两条入口静态传递图无对方框架，不以字符串 grep 单独定性 |
| N11 | 真正缺React却导入/react | 按JS生态解析错误失败，文档说明必要依赖；不提供假实现或自动装依赖 |

原始失败记录不得覆盖。复测通过要同时保留首轮错误与根因，不用统一 allowlist 删除插件错误。

截图至少覆盖：加载中、Button 交互后、参数页、中文默认失败占位及真实重试恢复、真实浏览器 Console 的 runtime 错误、类型与 CLI 负向终端输出。截图只放本轮 ignored evidence，并提供索引。禁止文字转图片冒充终端/DevTools。

G0 就预检真实界面截图能力。如原生 Terminal/DevTools 访问被工具拒绝，记录原始拒绝与具体缺项，继续所有可执行功能验证，不能绕过拒绝，也不能声称截图完成。允许用户后来手工补图；结论分“功能验证完成”和“证据尚缺”，不为缺一张图重跑整轮。

### 7.3 Vue fixtures 与 MES 双环境回归

现有 Vue 单测、类型检查、dev/fault/prod 套件全部保留，通过官方发布包验证其适配行为。测试数量动态记录，不写死“385+”“10/10”当权威清单。

MES 使用已存在的 SVN 测试副本与接入补丁，不因本轮文档要求重检出、删除或重新制造外层目录。先核对上一轮 `docs/5.0.4全量复验续做报告-20260928.md`，确认可复用副本、脚本和已知应用侧问题。

发版后 admin/BPM/lowcode 精确安装最终版本，package.json/lock/node_modules/registry integrity一致。串行构建，禁止大构建与浏览器完整验收争抢内存。

dev与8662各独立验证：

- 全部页面记录与菜单映射（上一轮是28条记录；现场数据可能变化，报告实际分母与差异，不擅自删项）；
- 参数页真实数据、审批详情标签栏位置与KeepAlive切换；
- 同页A→退出→B、context/remote用户信息、无新MFU-013/卸载回归；
- 真实UI审批闭环，同一instanceId发起→待办→办理→通过→已办；
- 401不伪造refresh token、远程故障反馈与恢复；
- 懒加载冷缓存首页、第一页、第二页、重复页、显式preload，保留URL/chunk分类/请求次数与CDP字节；
- 乾坤门控零实际加载、生产深链刷新、线上check-pages实际来源；
- 成组部署最终包新产物，固定文件no-cache与哈希一致、备份完整、8662持续运行。

权限/后台数据/原项目错误可按用户许可不修，但必须有原版本/关闭联邦等对照或未变源码与调用链证据，不凭一句“项目噪音”排除。**插件引起的错误或本轮回归必须修复、发新版本并重测最终版本。** 保留真实404，不用Nginx假200/空数据替换后台错误使脚本通过。

## 8. G0—G8 具体落地与发布

### G0：现场检查与计划

记录Git状态、remote与HEAD、插件/registry版本、安装工具、Node/TS/Vite/React与React插件peer、已有服务端口与PID、SVN副本状态、8662终态。仅查询必要信息，输出不含秘密。

创建本轮唯一目录与checkpoint。写下文件清单、API批准清单、版本矩阵、G0—G8与R/N/MES对照表。工具截图预检早做，不能等所有事结束才发现无法截图。

### G1—G2：实现及局部有意义回归

建议顺序：纯页面解析core→保持Vue适配行为→React适配器/API→薄入口/构建→React dev门面/schema→shared/JSX/HMR→类型与包隔离。

API实现不能只做“React.lazy+泛型”最小demo。G1覆盖重试/错误/竞态/会话，G2覆盖完整插件链路。允许根据真实证据修改必要的runtime逻辑，不承诺“内核零改动”绑死修复。

局部单测验证核心问题，consumer类型项目验证公开合同，真实浏览器验证网络与Hooks。修改Vue共享部分时保留既有断言，必要补精确回归。

按文件核对的最小清单如下，文件名可因合理实现调整，但对应责任不能漏掉：

| 文件或目录 | 必须完成的责任 |
|---|---|
| `src/host-pages-core.ts`、`src/vue-adapter.ts` | 纯页面解析共用、保留Vue缓存/命名/保活与公开合同 |
| `src/react-adapter.ts`、`src/react.ts` | React实现与类型入口；必要时使用接收loadRemote的内部工厂绑定hook/页面API，不让适配器再造内核 |
| `src/transform.ts`、`src/virtual.ts`、`src/index.ts` | /react开发态schema拆分、独立React代理门面与resolve/load/transform完整接线 |
| `src/options.ts`、共享转换、`src/runtime/` | 只有实际React共享/恢复缺陷需要时修改；修复与Vue回归成套 |
| `src/dts.ts`、consumer类型测试 | JSX/默认与具名导出、精确props、别名和fsRoot降级真实项目编译 |
| `scripts/gen-runtime-entry.mjs`、包build/exports/typesVersions/files | JS/d.ts/内部路径与单核接线、干净构建、英文README打包 |
| `scripts/check-gzip.mjs`、`scripts/check-manual-codes.mjs` | 体积约束、现行诊断登记；新增码与英文码表一致 |
| `tests/react-adapter.test.ts`、`tests/host-pages-core.test.ts` | 渲染/错误/重试/超时、hook竞态、StrictMode、会话与纯解析 |
| 现有入口图/转换/类型/共享/build回归测试 | 增加React批准清单、无另一框架依赖、仅一份内核与真实构建插件链 |
| `fixtures/host-react`、`fixtures/remote-react`、`examples/react-*` | 可运行宿主/远程与隔离正式包示例，不只提供配置片段 |
| `e2e/tests/`、`e2e/scripts/`、Playwright配置、Nginx模板 | 真正执行新增dev/fault/prod用例，部署/重试/性能/清理齐全 |
| `.github/workflows/ci.yml`、`.github/workflows/publish.yml` | 新测试依赖可用，矩阵不遗漏，正式发布仍能运行全量质量门禁 |
| 两份README、DESIGN、迁移/缺口文档、examples索引、CHANGELOG | 当前合同与版本真实一致；不篡改历史报告 |
| `.gitignore` | 新生成副本/构建/证据准确忽略，源码与可复用测试确实受跟踪 |

依赖安装责任同样明确：插件开发依赖按需要增加`react`、`react-dom`、`@types/react`、`@types/react-dom`、兼容的`@testing-library/react`及其peer；React fixtures增加匹配的`@vitejs/plugin-react`，路由库只放使用它的示例/fixture。先查peer再选版本。单元测试使用现有vitest/jsdom或等效的仓库方案；不能因装了React19开发依赖就省掉React18隔离验证。新依赖不得变成Vue消费者必须安装React的硬运行时依赖。

### G3—G4：测试源码、CI和双语文档

新增Reactfixtures/examples与长期测试接线；更新Playwright/server/prod setup/CI/publish安装逻辑。CI矩阵选用兼容的React插件版本，不能用单个latest强行覆盖所有Vite。

两份README与相关当前文档同步。额外输出章节/API/链接/包内容对照清单，不让英文成为中文摘要。

### G5：发布前质量检查

至少运行仓库有效命令：`pnpm build`、`pnpm test:unit`、`pnpm --dir packages/plugin typecheck`、`typecheck:latest`，以及新增React consumer类型与tarball smoke。实际脚本名若变化，记录真实执行命令。

这是必要质量门禁；真实项目完整dev/prod接受测试放G7。不得跳过构建/类型/单测就发布，也不要求额外重复一轮MES全量预验收。

### G6：正式发布

仅新增能力且保留现有有效合同，推荐下一个未占用的minor（基线5.0.4时建议5.1.0）；如确需破坏性更改，按真实影响选major并同步迁移，不为了躲版本升级保留废API。发布时重新查registry，不能覆盖已发布版本。

同步包版本、src/version.ts与版本来源测试、CHANGELOG。Git逐文件暂存本轮实现与测试/文档，push→tag→GitHub Release→既有publish工作流。

必须核验：发布commit/tag/Release关系、工作流success、npm latest/目标版本、tarball来源、完整性本地重算、provenance subject、exports/d.ts/中英文README/examples内容。不能停在“Git推了”。

### G7：正式包完整验收

用registry精确版本安装，不用本地link或tarball冒充正式发布包。React独立消费工程、examples、Vue/MES均记录安装三处版本与integrity。

React dev与隔离Nginx prod执行R01—R16和N01—N11适用项；React18/19与CI声明各有实际对应；Vue/MES执行§7.3。生产构建串行，浏览器验收与构建错峰。

如果发现插件缺陷：定位→回归→修复→发新patch→正式包重装→受影响项和最终双环境完整验收。最终报告只能对**最后实际部署版本**下结论，不能拼旧版PASS覆盖新版缺项。每次attempt保留证据与版本标记。

### G8：收尾与交付

交付以下内容：

1. 实施文件/公开API/中文与英文文档变更清单，破坏性影响或无破坏依据；
2. 正式版本、commit、tag、Release、publish、npm完整性/provenance；
3. React版本×Vite×dev/prod验收矩阵及Vue/MES独立结果；
4. 性能与体积前后值、冷缓存与复访请求证据，量度范围；
5. 负向错误真实截图、原始日志与恢复，证据索引和哈希清单（本地ignored）；
6. 中英章节/API/链接/包内文档对照与独立examples可复制验证；
7. 未解决项按插件缺陷、外部应用问题、工具阻塞、未测项分列，说明对结论的影响；
8. SVN零提交、仅本地修改、8662版本与运行/备份、任务进程清理、Git终态；
9. 给作者解释实际怎么用：两份配置→哪个入口导入→何时加载→参数/context如何传→如何失败/恢复；附React最小配置与使用例。

最终报告放 `docs/React与英文README实施验收报告-<日期>.md`，原始证据留本轮目录。报告的纯文档收尾提交可以push，不因纯报告再发一个版本；若包含插件代码必须按发布流程。

不删tag/Release、不给已发布包做未授权下架。线上回退用已保存产物恢复，插件问题用新修复版本前滚；报告保留失败历史。

## 9. 中断、阻塞与防误判

每个门禁完成更新本轮checkpoint：当前HEAD/正式版本、安装与部署版本、最后完成项、正在运行命令/PID、待办、证据路径、失败原因。后台任务“已启动”不等于“成功”，必须取得退出码与产物。

中断后首先读取本任务书与checkpoint，核对实际状态，再从未完成项继续。不能只复述前一段进度，不能复用不同版本截图，不能新建round2目录覆盖历史。

失败不因经过30分钟、上下文变长或另一个AI曾说PASS而变成外部问题。最终完成判定：

- 所有插件功能与正式包门禁通过，支持范围与文档一致；
- React正式包双环境与Vue/MES回归通过，未测项不藏在“已全绿”；
- 外部业务/权限问题有对照、如实单列，可以不阻断插件功能结论；
- 工具拒绝导致截图缺失时明确“证据待补”，不把功能测试说成未执行，也不说整体验收完美完成。

## 10. 本次设计核对使用的官方依据

这些链接用于说明机制；具体版本、签名与peer约束在实施时再次核对。

- [React lazy](https://react.dev/reference/react/lazy)：首次渲染加载、Promise/结果缓存、失败传给ErrorBoundary；常规组件不要在render时重复创建lazy。
- [React StrictMode](https://react.dev/reference/react/StrictMode)：开发时额外render/effect/ref检查，要求正确清理。
- [React Hooks与重复React](https://react.dev/warnings/invalid-hook-call-warning)：Hooks与renderer应使用同一份React。
- [React ErrorBoundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)：渲染异常捕获范围与边界。
- [React Router route object](https://reactrouter.com/start/data/route-object)：路由属性与lazy加载合同。
- [Vite JSX](https://vite.dev/guide/features.html#jsx)：JSX与官方React插件接入。

> 本文所有新API代码为实施目标，当前5.0.4尚未提供React入口。不能把任务书示例贴进当前项目后失败，解释成使用者操作错误；要完成实现、发版并验证后再更新README为已支持。
