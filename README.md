# @fulgurjs/federation

**[所有模板与 Demo 统一入口](examples/README.md)**：示例选择与运行指南。

[简体中文](README.md) | [English](README.en.md)

**让一个 Vite 应用使用另一个应用提供的组件、页面或函数。**

例如：主系统加载独立部署的审批页面，Vue 页面中嵌入一个 React 子应用，或者多个应用共用同一套工具函数。提供方和使用方可以放在不同仓库，各自构建和部署。

本文是使用指南，示例按 **5.7.1** 编写。完整参数、默认值和执行规则在 [API 手册](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.md)。

## 先看你要做什么

| 你的需求 | 使用方法 | 示例 |
|---|---|---|
| Vue 加载另一个应用的 Vue 组件 | `remoteComponent` | [Vue 示例](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/vue-vue) |
| React 加载另一个应用的 React 组件 | `/react` 的 `remoteComponent` | [React 示例](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/react-react) |
| 加载远程 JS/TS 函数 | `loadRemote`；React 也可用 `useLoadRemote` | 见下方快速开始 |
| 一批宿主路由对应远程页面 | Vue 用 `createHostPages`；React 用 `createReactHostPages` | [页面接入示例](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/pages-cli) |
| Vue 嵌 React，或 React 嵌 Vue | 子应用桥接：`defineBridgeApp` + 宿主桥接组件 | [双向嵌套示例](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates) |
| 刷新后仍打开子应用的详情页 | 在桥接上开启 URL 同步 | [路由同步示例](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/showcase) |
| 远程页面需要用户、token 或初始化 | `AppContext` + 可选 `setup`/`onSession` | 见下方业务初始化 |
| 同页使用 React 18 和 React 19 | 将两组依赖和使用方放入不同 `shareScope` | [版本隔离示例](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/react-versions) |

这些功能按需组合。**加载一个普通组件，不需要先配置桥接、页面表或登录初始化。**

## 几个名字是什么意思

| 名字 | 用普通话解释 |
|---|---|
| 宿主（host） | 显示远程内容的应用，例如主系统 |
| 远程（remote） | 提供组件、页面或函数的应用，例如审批系统 |
| `exposes` | 远程允许其他应用加载哪些文件 |
| `remotes` | 宿主要连接哪些远程、它们的地址是什么 |
| `shared` | 哪些依赖参与共享，例如 Vue、React |
| `singleton` | 同一个共享分组内只采用一个依赖实例；不保证所有库都能跨大版本兼容 |
| `shareScope` | 共享依赖的分组。不同组可以使用不同版本 |
| 桥接 | 为子应用准备一个 DOM 容器，让它在里面自行渲染和卸载 |
| URL 同步 | 把子应用的内部路径写进宿主地址，支持刷新、分享和前进后退 |

同一个应用可以既提供模块又使用其他应用的模块，不需要固定为单一角色。

## 安装

在每个参与联邦的 Vite 项目中安装：

```bash
pnpm add -D @fulgurjs/federation
# 使用 npm 的项目：npm install -D @fulgurjs/federation
```

- 支持浏览器端 Vue 3、React 18/19，以及普通 JS/TS 模块。
- 支持 Vite 5.1 及以上的 5/6/7/8 系列；项目必须同时满足所用 Vite 和框架插件的版本要求。
- 本插件要求 Node.js ≥18，但 **Vite 7/8 要求 Node.js 20.19+ 或 22.12+**，不能只按插件的最低版本选 Node。
- 构建目标使用 `es2022` 或更新；浏览器基线为 Chrome 108+，其他浏览器需要相应的 ESM、动态导入和顶层 await 支持。
- 普通 Vue 项目安装 Vue 即可；普通 React 项目安装 React 和 react-dom 即可。双向跨框架桥接的宿主按下面说明安装两个框架。

## 快速开始：两个 Vue 应用

下面是在**已有 Vite + Vue 项目**中增加联邦功能。每个项目仍保留自己的 `index.html`、入口文件和原有插件。

我们使用两个项目：

```text
remote-vue/     提供按钮和加法函数，开发端口 5174
host-vue/       加载它们，开发端口 5173
```

### 1. 远程声明要提供的文件

`remote-vue/fulgurjs.config.ts`：

```ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'remote-vue',
  exposes: {
    './Button': './src/Button.vue',
    './math': './src/math.ts',
  },
  shared: { vue: { singleton: true, strictVersion: true } },
} satisfies FederationOptions
```

`remote-vue/src/Button.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ label: string }>()
const count = ref(0)
</script>

<template>
  <button @click="count++">{{ label }}：{{ count }}</button>
</template>
```

`remote-vue/src/math.ts`：

```ts
export function add(a: number, b: number): number {
  return a + b
}
```

### 2. 宿主声明远程地址

`host-vue/fulgurjs.config.ts`：

```ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'host-vue',
  remotes: {
    'remote-vue': {
      dev: 'http://localhost:5174',
      prod: '/remote-vue',
    },
  },
  shared: { vue: { singleton: true, strictVersion: true } },
} satisfies FederationOptions
```

`dev` 是开发地址，`prod` 是部署后的地址。这里的 `/remote-vue` 表示宿主所在域名下的远程目录，**不是磁盘文件夹路径**。

### 3. 两个项目都注册插件

两个项目的 `vite.config.ts` 都导入本项目的配置：

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig({
  plugins: [vue(), federation(fulgurjsConfig)],
  build: { target: 'es2022' },
})
```

保留项目已有的别名、代理等配置。远程与宿主应安装兼容的 Vue 版本；示例开启 `strictVersion`，不兼容时会报错，而不是继续使用错误版本。

### 4. 在宿主页中使用

`host-vue/src/App.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { loadRemote, remoteComponent } from '@fulgurjs/federation/runtime'

const RemoteButton = remoteComponent('remote-vue/Button')
const result = ref('尚未计算')

async function calculate() {
  try {
    const math = await loadRemote<{ add(a: number, b: number): number }>('remote-vue/math')
    result.value = String(math.add(1, 2))
  } catch (error) {
    result.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <RemoteButton label="远程按钮" />
  <button @click="calculate">调用远程加法函数</button>
  <p>{{ result }}</p>
</template>
```

这里的名字一一对应：

```text
remote-vue/Button
└─ remotes 中的键 remote-vue
           └─ 远程 exposes 中的键 ./Button（调用时省略 ./）
```

`loadRemote` 返回文件导出的内容。加载 `math.ts` 后，仍要调用 `math.add()` 才会执行加法。

### 5. 启动并检查结果

在两个终端分别运行：

```bash
# 终端一，remote-vue 项目内
npm run dev -- --port 5174 --strictPort

# 终端二，host-vue 项目内
npm run dev -- --port 5173 --strictPort
```

打开 `http://localhost:5173`，应看到能增加计数的远程按钮；点击计算按钮应显示 `3`。使用 pnpm 的项目也可用 `pnpm dev` 启动。

完整工程与生产部署配置见 [Vue examples](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/vue-vue)。

## React 怎么接入

配置方式与 Vue 相同，只需换成 React 插件、共享依赖和浏览器导入入口。

在两个已有 React + Vite 项目中：

1. `vite.config.ts` 使用 `@vitejs/plugin-react`，后面注册 `federation(fulgurjsConfig)`。
2. 远程把 `./Button` 指向 `./src/Button.tsx`；宿主配置对应 `remotes` 地址。
3. 两边用兼容的 React/renderer 版本，并共享 `react`、`react-dom`：

```ts
shared: {
  react: { singleton: true, strictVersion: true },
  'react-dom': { singleton: true, strictVersion: true },
}
```

远程的 `src/Button.tsx`：

```tsx
import { useState } from 'react'

export default function Button({ label }: { label: string }) {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{label}：{count}</button>
}
```

宿主的 `src/App.tsx`（假设 `remotes` 中配置的名字是 `remote-react`）：

```tsx
import { remoteComponent } from '@fulgurjs/federation/react'

// 放在模块顶层，不要在每次组件渲染时重新创建。
const RemoteButton = remoteComponent<{ label: string }>('remote-react/Button', {
  fallback: <p>正在加载…</p>,
})

export default function App() {
  return <RemoteButton label="远程 React 按钮" />
}
```

React 加载普通 TS 模块时可以使用 `loadRemote` 或 `useLoadRemote`，都从 `/react` 导入。完整工程见 [React examples](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/react-react)。

## Vue 和 React 怎么互相嵌套

**嵌入的是子应用：子应用创建自己的组件树，宿主提供显示区域。** 不需要把 React 组件转换成 Vue 组件。

以 Vue 宿主嵌入 React 为例：

1. React 远程创建 `src/bridge.tsx`，默认导出桥接对象：

```tsx
import { defineBridgeApp } from '@fulgurjs/federation/react'

export default defineBridgeApp((props) => (
  <section>React 子应用：{String(props.message ?? '')}</section>
))
```

2. 在 React 远程的 `exposes` 中增加：

```ts
exposes: { './bridge': './src/bridge.tsx' }
```

3. Vue 宿主配置该远程地址，然后在页面中使用：

```vue
<script setup lang="ts">
import { createVueBridgeApp } from '@fulgurjs/federation/bridge/vue'
const RemoteApp = createVueBridgeApp<{ message: string }>('remote-react/bridge')
</script>

<template>
  <RemoteApp :app-props="{ message: '来自 Vue 宿主' }" />
</template>
```

跨框架宿主安装 `vue`、`react`、`react-dom`，共享这三个依赖。子应用只安装和共享自己的框架。React 与 react-dom 必须兼容；同页有多个 React 大版本时请按版本隔离 Demo 配置，不能只加 `singleton` 就认为兼容问题解决了。

反方向用 React 宿主的 `createReactBridgeApp`，Vue 子应用用 `/runtime` 的 `defineBridgeApp` 返回 `createApp(...)` 创建的应用。

需要记住三点：

- `appProps` 在挂载时取得快照。之后替换顶层字段不会自动更新子应用；实时数据可传稳定回调或共享 store，需要重新挂载时使用组件 `key`。
- 两个组件树不会自动共用 Context、provide/inject 或路由，需要显式传递或在子应用安装。
- 普通组件加载用 `remoteComponent`；整个子应用嵌套用桥接工厂。Vue 不能直接用 Vue 的 `remoteComponent` 渲染 React 组件。

双向配置、登录切换和卸载示例见 [bridge examples](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates)。

## 子应用路由和浏览器地址怎么同步

桥接默认不改宿主地址。比如子应用从列表进入详情，地址不变，刷新就无法凭地址恢复这条详情。

开启 URL 同步后可以这样使用：

```text
宿主地址 /approval/list        → 子应用 /list
宿主地址 /approval/detail/42   → 子应用 /detail/42
```

接入需要同时设置两端：

1. 宿主路由要接住 `/approval` 下的所有子路径，避免详情导航把子应用卸载。
2. 宿主桥接组件传 `routing`，其中 `basePath` 是 `/approval`，`navigation` 由宿主路由适配器创建。
3. 子应用声明 `defineBridgeApp(..., { routing: true })`，用受控的 memory 路由接入通道。

Vue 使用 `createVueBridgeNavigation` / `connectVueBridgeRouter`；React 使用 `createReactBridgeNavigation` / `createReactBridgeRouter`。React 宿主需要 data router（`createBrowserRouter` 或 `createHashRouter`），不能直接换成 `BrowserRouter`。内置适配支持 Vue Router 4、React Router ≥6.11。

这样刷新、分享链接、前进后退能恢复路由位置；**不会自动保存表单内容或业务数据**。详细步骤见 [URL 同步 API](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.md#url-sync)，可运行工程见 [bridge-router Demo](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/showcase)。

## 远程业务页需要用户信息或初始化时

这部分是可选功能。普通按钮、工具函数不需要它。

| 需求 | 使用什么 | 什么时候发生 |
|---|---|---|
| 宿主提供用户、取 token 的方法、store 等 | `provideAppContext` | 宿主加载远程业务模块前提供 |
| 远程读取这些值 | `getAppContext` / `requireAppContext` | 由远程业务代码调用 |
| 远程注册全局组件、样式或其他一次性内容 | 配置 `setup` 文件的默认导出 | 首次 `loadRemote('远程/模块')` 返回业务模块前执行 |
| 每次登录、换账号都要重新同步权限等 | 同文件具名导出 `onSession` | 按 `sessionKey` 区分登录次数 |
| 退出登录，清除共享的账号上下文 | `clearAppContext` | 由宿主退出流程调用；私有页面/缓存也须由宿主清理 |

`sessionKey` 是一次登录的编号，**不是 token，也不是权限凭证**。重新登录或换账号生成新编号，单纯刷新 token 不换编号。

桥接组件可以通过 `getContext` 在加载前取得最新信息；受控 `sessionKey` 为 `null` 表示退出，组件会卸载并停止加载。省略 `sessionKey` 表示未启用受控登录切换。

`setup` 不会由文件名或目录自动触发，必须写在联邦配置里。`preloadRemote` 只预载资源，不执行 `setup/onSession`。异步初始化写入状态前要检查 `context.signal.aborted`，避免退出后迟到的请求写回旧账号数据。

完整代码见 [初始化与上下文 API](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.md#context)。

## 多个远程页面怎么管理

宿主有很多路由对应远程页面时，可以维护一份页面表，再交给 `createHostPages`（Vue）或 `createReactHostPages`（React）。它们负责查找对应模块、缓存加载组件和显示加载/错误状态，**不会自动替你创建宿主 Router**。

页面表里 `route` 是宿主路径，`spec` 是远程的 exposes 键（通常省略 `./`，不要重复加远程名）；`remotePrefixes` 指定这批路径属于哪个远程。例如 `/shop/home` + `spec: 'pages/Home'` + `remotePrefixes: { '/shop': 'shop' }`，最终加载的是 `shop/pages/Home`。Vue 可结合 KeepAlive 保存组件状态；React 不提供相同的保活承诺。

完整配置见 [页面 API](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.md#pages) 和 [pages-cli Demo](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/pages-cli)。

## 构建与部署

宿主和远程分别执行自己的构建命令，然后分别部署：

```bash
npm run build
```

远程默认生成 `fulgurjs-remoteEntry.js` 和 `fulgurjs-manifest.json`，宿主通过配置的 `prod` 地址找到它们。远程可以部署到同域子目录，也可以部署到另一个域名。

部署时核对：

- **地址与 base 一致**：远程部署在 `/remote-vue/` 时，远程 Vite 构建的 `base` 也应为 `/remote-vue/`；宿主 `prod` 配置为 `/remote-vue`。
- **入口及时更新**：HTML、remoteEntry、manifest 使用 `Cache-Control: no-cache`，让浏览器重新验证最新内容。带内容哈希的 chunk 可以长缓存。
- **刷新能回到页面**：宿主和独立远程的页面路由分别配置 SPA 回退；资源请求不存在时应返回 404，不要把 JS 请求回退成 HTML。
- **跨域允许访问**：不同域名时，远程服务器要正确提供 CORS 响应头；开发配置不会自动替你修改生产服务器。
- **避免旧文件突然失效**：发布期间保留仍被旧页面引用的 chunk，或使用能避免版本混搭的部署流程。

生产部署样例见 [Vue 部署说明](https://github.com/chenmingye/fulgurjs-federation/blob/master/examples/templates/vue-vue/README.md) 与 [React 部署说明](https://github.com/chenmingye/fulgurjs-federation/blob/master/examples/templates/react-react/README.md)。

## 加载失败时怎么办

| 现象 | 先检查 | 插件提供的恢复方式 |
|---|---|---|
| 远程连不上 | 远程是否启动、remotes 地址和 CORS | 超时、重试、错误占位；可配置备用入口或 fallback 模块 |
| 提示模块不存在 | `远程名/模块名` 是否对应 remotes/exposes | 修正名称后重试 |
| 提示共享版本不兼容 | 两边依赖版本、requiredVersion、strictVersion、作用域 | 对齐依赖或隔离不同版本，不能靠忽略错误解决 |
| 远程静态依赖曾下载失败，服务恢复后仍失败 | 浏览器可能保留该依赖 URL 的失败记录 | 默认占位提供用户主动刷新，保留当前地址 |
| 子应用卸载失败 | 子应用清理逻辑、事件和定时器 | 该容器不再重新挂载，需刷新；同时修复清理逻辑 |

`remoteComponent` 和桥接组件有默认错误占位。直接调用 `loadRemote`，或使用 React 的 `useLoadRemote`，需要自己处理错误状态。`fallbackModule` 是你显式选择的备用模块，不会自动修复原远程。

错误中会给出代码、原因和处理建议；完整清单见 [错误码手册](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.md#error-codes)。

## Vite 8 和使用范围

**支持 Vite 8 开发和生产构建，已修复此前大型应用启动挂起的问题，并通过相关回归测试。**

还有两点与使用有关：

- **开发第一次打开可能重载**：Vite 在准备依赖，发现新依赖时可能重新优化并刷新页面。等准备完成后再判断页面是否正常；这不是生产页面每次都会发生的行为。
- **部分共享场景会多下载文件**：浏览器可能下载未采用的本地库副本。同一 singleton 作用域仍使用一个实例；你主动隔离 React 18/19 时，则可以各自使用一个实例。文件下载数量与运行时实例数量不是同一件事。

当前不提供 SSR/RSC、Node 服务端联邦、React Native、自动 JS 沙箱、自动 CSS 隔离，或 webpack `script/var` 产物互操作。远程全局样式和变量仍可能影响宿主；子应用内部错误也需要子应用自己的错误处理。

跨框架支持子应用级嵌套，不提供组件类型转换。多层桥接路由自动代理、跨窗口路由同步及其他路由库的内置适配也不在当前范围。完整说明及 webpack 的区别见 [能力对照](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/webpack-mf-对照与缺口.md)。

## 调试、类型和命令行

在应用根目录运行：

```bash
npx fulgurjs init                        # 创建联邦配置起步文件
npx fulgurjs explain                     # 查看当前应用的联邦配置

# 使用页面表时，核对宿主页面声明：
npx fulgurjs check-pages --site http://localhost:5173

# 部署到 /remote-vue/ 后，将域名替换为你的实际站点：
npx fulgurjs doctor --base https://your-site.example --apps remote-vue
```

`doctor` 的 `--base` 是站点地址，`--apps` 是要检查的部署子目录；上例检查 `/remote-vue/`。它不会从容器名自动猜测另一个开发端口。

`init` 只生成联邦配置模板，不替你创建完整应用、路由或 Nginx 配置。`check-pages` 核对页面表与远程模块声明；远程不可达会报告无法验证，不代表通过。

开发类型默认开启：插件为远程模块生成类型声明。能访问远程源码时可获得更精确的提示；不能访问时生成 `any` 声明，表示可以导入但没有准确类型。需要关闭时设 `dts: false`。详细规则见 API 手册。

高级排查可查看 `window.__FULGURJS_SCOPE__`、`window.__FULGURJS_INFO__`，或设置 `FULGURJS_DEBUG`。普通接入不需要修改这些对象。

## API 参考

不要猜接口，也不要照搬旧任务书中的签名。查参数时使用当前手册：

| 你要查什么 | 入口 |
|---|---|
| 所有插件配置、remotes/shared 参数与默认值 | [插件选项](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.md#plugin-options) |
| loadRemote/loadShare、注册远程、预载、运行时插件 | [运行时 API](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.md#runtime) |
| Vue/React 组件、页面和 Hooks | [中文 API 手册](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.md) |
| 跨框架挂载、appProps、sessionKey、卸载规则 | [桥接 API](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.md#bridge) |
| URL 同步、导航取消和部署 base | [路由 API](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.md#url-sync) |
| 英文参数说明 | [English API reference](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.en.md) |

### 给使用 AI 接入的项目

给 AI 明确这几件事：项目用 Vue 还是 React、加载组件还是整个子应用、远程地址、exposes 名称、是否需要登录切换和 URL 同步。

要求它先读使用指南和对应 API 章节，再改代码；沿用现有 Vite 配置，核对实际依赖版本，正确使用浏览器导入入口。参数以当前类型声明为准，不创建文档中不存在的字段。完成后检查真实挂载、交互、失败处理；启用 URL 同步时再检查深链刷新、前进后退和导航取消。

## 文档

- [完整 Demo 与运行步骤](https://github.com/chenmingye/fulgurjs-federation/blob/master/examples/demos/README.md)：基础加载、双向嵌套、URL 同步、版本隔离和 Jeecg 场景。
- [可复制运行模板](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates)：Vue×Vue、React×React、双向跨框架桥接与完整 showcase，五个 pnpm workspace 模板，复制后 `pnpm install && pnpm dev` 即可运行。
- [迁移指南](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/迁移指南.md)：从已有微前端方案接入。
- [CHANGELOG](https://github.com/chenmingye/fulgurjs-federation/blob/master/CHANGELOG.md)：版本变化与迁移说明。
- [验收报告](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/整夜全量验收报告-20261004.md)：真实 MES 业务项目（两个 SVN 项目全新副本）接入验收：dev/生产/故障恢复/HMR（历史记录：该轮曾要求大型应用停用 manualChunks，**5.8.0 起已修复，可保留业务 manualChunks**——共享本体自动隔离进 `fulgurjs-provider-*` 组，不受用户分组影响）。
- 历史验收：[完整Demo展示与全面复测-20261002](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/完整Demo展示与全面复测-验收报告-20261002.md)。历史结果不能代替当前项目验收。

## 开发与测试

以下是**开发本插件仓库**的命令，不是使用者接入项目必须运行的步骤：

```bash
pnpm --dir packages/plugin install
pnpm --dir packages/plugin build
pnpm test:unit
```

完整 fixtures 安装与浏览器测试准备见 [贡献指南](https://github.com/chenmingye/fulgurjs-federation/blob/master/CONTRIBUTING.md)。CI 检查构建、类型、单测、实际安装包，以及多个 Vite 版本的浏览器场景；通过数量以对应运行记录为准。

## License

[MIT](LICENSE) © chenmingye (Jason)
