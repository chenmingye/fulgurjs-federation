# 已有应用接入：先看必改文件，再选需要的能力

## 先确定场景

| 需求 | 必需接入 | 不需要默认增加 |
|---|---|---|
| 普通模块或组件 | Vite 注册插件；提供方 expose 原文件，消费方 loadRemote/remoteComponent | 应用工厂、菜单表、会话文件、Provider |
| 完整子应用 | 应用配置；一份 application 装配；宿主视图挂载 | 不逐页登记子应用菜单，不复制两套 main/bridge 初始化 |
| 与宿主 URL 同步 | 子应用受控 memory router；宿主一个静态挂载前缀与导航端口 | 子应用不再调用浏览器 history |
| 登录态或会话 | 宿主明确提供 context/sessionKey | 无登录需求时不强制新建 session/context 文件 |
| 组件依赖全局注册或祖先注入 | 按真实需要声明 setup.globalComponents/pageProviders | 普通组件不默认包装整个业务 app |

目录名没有强制要求。小项目可以把宿主挂载与上下文写在已有视图中；不要因为看了多篇 API 示例就创建多套目录。

## Vue：两种入口复用一份装配

`src/application.ts` 默认导出就是远程桥接契约，同时带独立 `start` 方法。下面的 App 和 routes 是项目原有组件与路由；守卫、状态库、i18n、指令等原装配放在同一工厂内。

```ts
import { createApp } from 'vue'
import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from './App.vue'
import { routes } from './router/routes'

interface AppProps { label?: string }

export default defineApplication<AppProps>((props, { mode, signal }) => {
  const router = createRouter({
    history: mode === 'bridge'
      ? createMemoryHistory()
      : createWebHistory(import.meta.env.BASE_URL),
    routes,
  })
  const app = createApp(App, { ...props })
  // 在这里复用原 app.use(...) 与权限守卫；异步任务写回前检查 signal.aborted。
  // 不提前 app.use(router)，交给统一入口安装、等待与释放。
  return { app, router }
}, { routing: true })
```

### 大型应用的业务代码按启动时加载

如果已有应用存在与公开接口无关的业务 TS 诊断，可以把业务组件、路由和装配插件的导入放进异步工厂。仍然只有一个 `application.ts`，不增加转发文件，也不需要先整改整个业务项目：

```ts
export default defineApplication<AppProps>(async (props, { mode }) => {
  const { default: App } = await import('./App.vue')
  const { routes } = await import('./router/routes')
  const router = createRouter({
    history: mode === 'bridge'
      ? createMemoryHistory()
      : createWebHistory(import.meta.env.BASE_URL),
    routes,
  })
  const app = createApp(App, { ...props })
  return { app, router }
}, { routing: true })
```

这里沿用上例的公开导入和 `AppProps`，移除顶部的静态 App/routes 导入。业务插件与只在运行期需要的图标注册，也在本工厂中加载和安装。插件仍检查应用入口和公开声明的静态依赖；不会将只在启动时使用的整棵业务树当成必须先通过的公开类型接口。模块会被浏览器缓存，但每次工厂执行仍应创建新的 app/router/store。对外声明能否完整生成，可用 `fulgurjs types` 核验。

已有 `main.ts` 的联邦相关部分变为：

```ts
import application from './application'
void application.start('#app').catch(console.error)
```

提供方配置直接指向它，不再增加 bridge.ts 转发文件：

```ts
exposes: { './bridge': './src/application.ts' }
```

独立模式安装 web router 并等待 isReady；桥接开启 routing 时安装同步通道并等待初始深链；不开启 routing 时，返回的本地 memory router 也由插件安装并等待，不需要手动 app.use(router)。宿主开启 URL 同步时仍需 `{ routing: true }`，没有通道会明确失败，不能自动退回一个看似正常的首页。

工厂需要在路由就绪后继续装配时，沿用 installVueBridgeRouter 的显式用法；不要同时返回已安装的 router 让插件重复安装。仅返回 app 时，路由安装/就绪仍由工厂自己负责。

## React：同一工厂选择原生或受控 router

React 的工厂同步返回 JSX，或 `{ element, dispose? }`。异步页面/loader 保留 React 原生行为；start 的 Promise 表示首次根提交，不表示所有请求都完成。

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { defineApplication, createReactBridgeRouter } from '@fulgurjs/federation/react'
import { routes } from './routes'

export default defineApplication((_props, { mode, routing, signal }) => {
  if (mode === 'bridge') {
    const connection = createReactBridgeRouter(routing!, routes, { signal })
    return { element: connection.element, dispose: connection.dispose }
  }
  const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })
  return { element: <RouterProvider router={router} />, dispose: () => router.dispose() }
}, { routing: true })
```

main.tsx 只调用 `application.start('#root')`，expose 指向 application.tsx。工厂没有 router 时直接返回 JSX 即可，不用声明 routing。

## 启动、取消和卸载

```ts
const handle = await application.start('#app', { label: '独立应用' })
handle.unmount()
```

- 容器必须存在；同容器未卸载前重复 start/mount 会失败。
- 等待启动时可调用 `application.unmount(element)` 取消。start 按 AbortError 拒绝；工厂迟到结果不得重新挂载。异步业务回写仍须检查 signal。
- 旧 handle 只对应原启动代次，不会卸载同容器的新实例。
- 卸载失败后容器封锁，整页刷新恢复；不能换个 props/sessionKey 绕过。
- 每次工厂创建新 app/router/业务 store 实例；不返回一个模块全局创建的实例让多个容器共用。
- mode 属于本次工厂上下文，不写 window 全局开关；hasBridgeMount(context) 在桥接模式为 true，独立模式为 false。

## Pinia：库单例与业务实例分别管理

正常组件 setup 中可以继续使用 Pinia 原生注入。容易出错的是异步回调在多个 app 之间读取全局 activePinia，尤其同名 store 的状态归属。

```ts
import { createPinia, defineStore } from 'pinia'
import { bindStoreToApp } from '@fulgurjs/federation/vue'

const definition = defineStore('counter', { state: () => ({ count: 0 }) })
const pinia = createPinia() // 在本次应用工厂内创建
const useCounter = bindStoreToApp(definition, pinia)
// 通过本实例的 provide/业务装配传下去，不放到跨实例的可变全局变量里。
async function increment() { await Promise.resolve(); useCounter().count++ }
```

返回函数的类型、$id 和热更新属性保持原样。显式 `useCounter(otherPinia, hot)` 参数仍有效；省略/null 参数才使用绑定实例。不会切换全局 activePinia，也不会改写所有业务 store。

单默认应用在模块导入时还没创建 Pinia，可以传 `() => pinia`，在实际调用时解析；未就绪会明确报错。**并行实例不要用一个会被后续工厂覆盖的模块变量 getter**，应像上例绑定实际实例或使用 Vue 原生注入。

React 宿主没有使用 Pinia 时，不因子应用用了 Pinia 就给宿主添加 Pinia provider。共享依赖按真实用途声明，不能按 package.json 安装清单照抄。

## 接入前预检，部署后体检

```bash
npx @fulgurjs/federation doctor --config ./fulgurjs.config.ts
npx @fulgurjs/federation doctor --config ./fulgurjs.config.ts --json
npx @fulgurjs/federation doctor --base https://your-site --apps host,remote
```

本地模式只执行配置，不执行业务模块、不请求远程、不改源码。确定的缺文件为 FAIL；地址、history、全局状态、业务 glob 等可疑写法为 WARN，附具体修法。自定义别名、动态导入、glob、目录外源码或超过256文件时 complete=false，明确没有完整扫描。它不是类型检查或浏览器验收。

## 文件清单如何读

| 类别 | 例子 | 是否人人必改 |
|---|---|---|
| 联邦必需 | 每应用配置；子应用 application；宿主挂载视图 | 按选定能力需要 |
| 原入口接线 | main 的 start；Vite 插件注册；router 创建模式 | 修改已有文件，不复制整套业务启动 |
| 业务附加 | 登录、字典、权限、组件注册、祖先 Provider | 仅真实业务依赖时需要 |
| 旧方案迁移 | 去掉乾坤入口与全局运行标志 | 新项目没有这些成本 |
| 关联修复 | 迟到请求、业务表单回显、旧菜单配置 | 不算插件普遍要求 |
| 生成/构建资源 | 类型声明、锁文件、公共资源 | 与手写接入分开，不手改生成类型 |

普通组件仍用 remoteComponent；只需要一个自定义桥接入口时 defineBridgeApp 仍是有效当前 API。统一装配用于有独立启动与桥接两种形态的应用。

源码演示：[Vue](../../../fixtures/application-start/vue/src/application.ts)、[React](../../../fixtures/application-start/react/src/application.tsx)、[目录说明](../../../fixtures/application-start/README.md)。这是维护者本地源码演示；五个公开模板与 same-frame 使用相同的统一装配写法。内部 link 工程不作为给用户的安装方式，请安装 registry 正式包。
