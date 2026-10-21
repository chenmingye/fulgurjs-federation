# 已有应用接入：先看必改文件，再选需要的能力

第一次接入完整应用，请从[单一路径接入指南](first-integration.md)开始；本页提供已有启动复用、可选统一启动与工具参考。

## 先确定场景

| 需求 | 必需接入 | 不需要默认增加 |
|---|---|---|
| 普通模块或组件 | Vite 注册插件；提供方 expose 原文件，消费方 loadRemote/remoteComponent | 应用工厂、菜单表、会话文件、Provider |
| 完整子应用 | 应用配置；有效桥接契约复用原初始化；宿主挂载视图 | 不搬整份 main，不逐页复制菜单或再抄业务注册清单 |
| 与宿主 URL 同步 | 子应用受控 memory router；宿主一个静态挂载前缀与导航端口 | 子应用不再调用浏览器 history |
| 登录态或会话 | 宿主明确提供 context/sessionKey | 无登录需求时不强制新建 session/context 文件 |
| 组件依赖全局注册或祖先注入 | 按真实需要声明 setup.globalComponents/pageProviders | 普通组件不默认包装整个业务 app |

宿主向子应用提供表单等组件时，固定提供方推荐 `exposes + remoteComponent`；多个宿主分别提供实现时选 `getContext` 注入。宿主也可以是组件提供方，完整子应用也可以是组件消费方。双表单配置、Provider 与状态约束见[选择依据和推荐示例](components-and-modules.md#宿主向子应用提供组件推荐方式与选择依据)。

后续接入统一推荐下面的目录结构。小项目仍可在已有业务视图调用 API；新增接线、装配和辅助组件集中管理，不因多个 API 示例再创建多套目录。

## 接入文件集中放在哪里

已有业务入口、初始化函数、router、store、注册源与页面保留原位置。新增联邦接线按需集中；下面列的是可能需要的文件，不是必须生成的目录树：

```text
src/fulgurjs/
├── host/RemoteApplication.vue  # 需要挂载完整远程应用时增加
├── exposes/application.ts     # 需要新桥接适配时增加；只调用已有业务初始化
├── setup.ts                   # 确有远程初始化/缺失组件环境时才增加
└── types/                     # 自动同步声明，不手写
```

原组件可以直接被 exposes 指向，不必在 exposes/ 再包一层。已有有效桥接契约也可直接作为 expose；不为目录统一移动业务文件或创建纯转发壳。一个已有 Provider 直接引用，只有真实的组合/参数适配才新增 Provider 组件。业务上下文映射有实际职责时才增加 context.ts。

`main.ts(x)` 继续是项目原独立入口。新增桥接调用同一个已有业务初始化，不要求 main 改成 application.start。若项目主动采用 defineApplication，则可让 main 调用其 start；这是可选启动组织，不能当作接入前置条件。

新建的纯接线使用 host/、exposes/ 区分消费与提供；新项目的统一启动示例可使用 host/application.ts(x) 或 exposes/application.ts(x)。路径是组织约定，插件按配置中的真实文件加载，不自动识别文件名。模板中 main 采用统一启动，展示的是该可选方案，不要求已有项目照搬。

### 文件格式和名称

- Vue 组件使用 `.vue`，新增组件推荐 `<script setup lang="ts">`。已有 `defineComponent` 组件可以继续使用；需要模块级共享状态时可额外保留普通 `<script lang="ts">`，不要把共享状态误放进每次执行的 setup。
- React 组件使用 `.tsx`；配置、会话、上下文、主题等不包含模板/JSX 的逻辑使用 `.ts`。
- `.d.ts` 是声明文件；`types/` 的远程声明由插件生成。组件 props 在提供方真实入口声明，消费方使用自动同步的类型，不维护第二份手写接口。
- 文件名描述职责，例如 `RemoteApplication.vue`、`OrderForm.vue`、`context.ts`。避免用 `App1`、`App2`、`应用一/应用二` 作为说明，也不把所有文件都叫 `bridge.ts`。

### 先说角色，再说运行方式

| 用语 | 含义 |
|---|---|
| 宿主（host） | 当前负责显示、挂载远程内容的工程 |
| 远程（remote）/提供方 | 把组件、模块或完整应用提供出去的工程 |
| 消费方 | 调用远程内容的工程；一个工程也能同时提供内容 |
| 独立启动 / 嵌入运行 | 同一工程的两种运行方式，不代表另外新建两个工程 |

说明代码时使用具体工程名加角色，例如“订单远程”“管理宿主”。子应用是完整远程应用嵌入宿主后的常见称呼，不用于指代所有远程组件；组件加载不需要额外创建一个应用。

## 先预览接入，再明确写入

在已有应用根安装 `@fulgurjs/federation` 后运行。以下文件和远程地址是示例，换成项目真实值；命令不会替你安装依赖、启动服务或猜端口。

**提供组件或模块**：

```bash
npx fulgurjs init --plan --role provider --expose ./Button=./src/components/Button.vue
# 审查打印的完整前后文本、保留项和待办后，再使用相同参数追加 --write
npx fulgurjs init --plan --role provider --expose ./Button=./src/components/Button.vue --write
```

**消费方**：

```bash
npx fulgurjs init --plan --role consumer --remote remote-a=http://localhost:5174/remote-a
npx fulgurjs init --plan --role consumer --remote remote-a=http://localhost:5174/remote-a --write
```

普通模块/组件模式默认只生成联邦配置并接入 Vite，不增加应用工厂、菜单、Provider 或登录文件。在已有页面中使用 `loadRemote('remote-a/math')` 或同框架 `remoteComponent('remote-a/Button')`；普通组件的必填 props 由消费方传入。远程开发服务需自行启动，生产 `prod` 默认建议路径为 `/remote-a`，部署前按实际 base 核对。

**完整子应用**：提供方使用 `--kind app --role provider`；宿主使用 `--kind app --role consumer --remote ...`。例如：

```bash
# 子应用：预览完整应用接线；审查计划是否会改写现有 main
npx fulgurjs init --plan --kind app --role provider
# 宿主：生成 src/fulgurjs/host/RemoteApplication.vue 或 .tsx，放入现有页面/路由
npx fulgurjs init --plan --kind app --role consumer --remote remote-a=http://localhost:5174/remote-a
```

只有接受计划中的具体改写时才追加 `--write`。若要保留原入口结构，可手工声明有效桥接契约与 exposes；无需执行提取 main 的计划。宿主挂载视图不自动增加登录态或 URL 同步：需要时按下文和 [URL 同步指南](url-sync.md)接入宿主导航端口、一个挂载前缀和真实会话来源。子应用不重复登记内部菜单。跨框架完整桥接的依赖要求见[桥接指南](app-bridge.md)，不能把普通组件的安装要求直接套到它。

### 自动接线的边界

- Vite 支持直接对象、`defineConfig` 对象以及可识别的单返回箭头配置工厂，保留原插件、端口和注释；原插件返回值可作为嵌套 PluginOption 保留。
- 最小应用入口支持具名 `createApp` 的 Vue 启动、具名 `createRoot` 的 React JSX 启动。已有 Router/store、权限、异步初始化或自定义入口布局需核对已有初始化边界，工具不会盲改业务；手工复用真实初始化是有效接法。
- 无法证明的配置控制流、插值模板、顶层 spread、重复 plugins 或已有人工接线会列为阻断项，**整批不写**，同时给出文件和手动接入块。
- 已有配置和手改挂载视图不覆盖；重复运行相同计划不会重复插入。预览函数不执行业务模块/Vite 配置。`--force` 不适用于接入计划。
- `--write` 写入前再次核对文件；失败回退。进程中断留下 `.fulgurjs-init-pending.json` 时，先运行 `npx fulgurjs init --rollback`。有后续人工编辑则拒绝覆盖，按记录人工合并；恢复成功记录会删除，不应提交它。
- 写入成功后运行 `npx fulgurjs doctor --config ./fulgurjs.config.ts`，再做项目有效类型检查、构建和真实交互。命令成功不等于业务迁移或浏览器验收完成。

仅想生成配置时仍可直接 `npx fulgurjs init`；想校验已有配置用 `init --config`，不要混用 `--plan/--write` 与 `--config/--out/--force`。完整参数、JSON 与退出码见 [CLI 参考](../reference/cli.md#fulgurjs-init)。

## Vue：优先复用已有初始化

默认做法见[首次接入第2节](first-integration.md)：defineBridgeApp 调用既有业务创建函数，原 main 保留其独立启动。检查桥接模式、未挂载返回值、每个 router 的守卫与实例清理；函数已经装配业务依赖时，桥接文件不再注册一次。

### 可选：defineApplication 同时管理两种启动

下面用于新工程或主动选择统一启动的项目。它演示插件能力，不要求把既有 main、业务插件或注册清单搬进该文件。已有初始化函数优先直接复用；此处展开 createApp/router 只是说明返回合同。

```ts
import { createApp } from 'vue'
import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from '../../App.vue'
import { routes } from '../../router/routes'

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

### 导入与原独立入口

静态导入和按需动态导入都支持，取决于真实业务依赖。不要把所有业务导入改成一串 Promise.all 当作接入模板；模块级副作用仍只执行一次，不能靠动态 import 保证每个新 router 都注册守卫。公开声明应准确描述入口；业务类型诊断与公开合同诊断分开归因，不用 any 或宽泛字典掩盖错误。

仅采用上述 defineApplication 方案时，原独立入口可改为调用它：

```ts
import application from './fulgurjs/exposes/application'
void application.start('#app').catch(console.error)
```

保留原独立启动、仅 expose defineBridgeApp 的项目不做这一步。

提供方配置直接指向它，不再增加 bridge.ts 转发文件：

```ts
// Merge into the existing fulgurjs.config.ts default export.
export default {
  name: 'orders',
  exposes: { './bridge': './src/fulgurjs/exposes/application.ts' },
}
```

独立模式安装 web router 并等待 isReady；桥接开启 routing 时安装同步通道并等待初始深链；不开启 routing 时，返回的本地 memory router 也由插件安装并等待，不需要手动 app.use(router)。宿主开启 URL 同步时仍需 `{ routing: true }`，没有通道会明确失败，不能自动退回一个看似正常的首页。

工厂需要在路由就绪后继续装配时，沿用 installVueBridgeRouter 的显式用法；不要同时返回已安装的 router 让插件重复安装。仅返回 app 时，路由安装/就绪仍由工厂自己负责。

## React：同一工厂选择原生或受控 router

此节同样是可选的统一启动方案；已有独立入口可保留，并用 defineBridgeApp 复用原 React 初始化。下面的 React 工厂位于 `src/fulgurjs/exposes/application.tsx`。工厂同步返回 JSX，或 `{ element, dispose? }`。异步页面/loader 保留 React 原生行为；start 的 Promise 表示首次根提交，不表示所有请求都完成。

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { defineApplication, createReactBridgeRouter } from '@fulgurjs/federation/react'
import { routes } from '../../routes'

export default defineApplication((_props, { mode, routing, signal }) => {
  if (mode === 'bridge') {
    const connection = createReactBridgeRouter(routing!, routes, { signal })
    return { element: connection.element, dispose: connection.dispose }
  }
  const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })
  return { element: <RouterProvider router={router} />, dispose: () => router.dispose() }
}, { routing: true })
```

仅采用本节方案时，main.tsx 从 `./fulgurjs/exposes/application` 导入并调用 `application.start('#root')`，expose 指向 application.tsx。工厂没有 router 时直接返回 JSX 即可，不用声明 routing。

## 启动、取消和卸载

```ts
const handle = await application.start('#app', { label: '独立应用' })
handle.unmount()
```

- 容器必须存在；同容器未卸载前重复 start/mount 会失败。
- 等待启动时可调用 `application.unmount(element)` 取消。start 按 AbortError 拒绝；工厂迟到结果不得重新挂载。异步业务回写仍须检查 signal。
- 旧 handle 只对应原启动代次，不会卸载同容器的新实例。
- 卸载失败后容器封锁，整页刷新恢复；不能换个 props/sessionKey 绕过。
- 每次挂载必须得到可用且归属明确的 app/router；并行实例的状态应隔离。已有业务单例不由插件自动改写，不要把复用同一个 store 的安装调用描述成“创建新 store”。
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

模块顶层的 `const state = useCounter()` 会一直保存第一次取得的 store 对象；后续工厂创建新 Pinia，并不会自动替换这个变量。把取 store 的操作放到本次工厂、组件 setup 或绑定本实例的回调中。原本设计为常驻单例的业务工具，需要逐项确认其状态归属；插件不会静默改写整棵业务树。旧代次的异步装配在写登录态、创建状态树或安装插件前，还应检查本次 `signal.aborted`。

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
| 联邦必需 | 每应用配置；完整应用的桥接契约及宿主视图 | 普通组件不需要应用契约 |
| 原入口接线 | Vite 注册；桥接所需的创建/清理边界与 router 模式 | 保留 main，复用原初始化；start 仅可选统一启动使用 |
| 业务附加 | 登录、字典、权限、组件注册、祖先 Provider | 仅真实业务依赖时需要 |
| 旧方案迁移 | 去掉乾坤入口与全局运行标志 | 新项目没有这些成本 |
| 关联修复 | 迟到请求、业务表单回显、旧菜单配置 | 不算插件普遍要求 |
| 生成/构建资源 | 类型声明、锁文件、公共资源 | 与手写接入分开，不手改生成类型 |

普通组件直接用 remoteComponent；defineBridgeApp 可与原独立入口共存；defineApplication 是项目选择让插件管理两种启动时使用的当前 API。它们的选择不取决于文件必须放在哪里。

源码演示：[Vue 宿主装配](../../../examples/templates/vue-vue/host/src/fulgurjs/host/application.ts)、[React 远程装配](../../../examples/templates/vue-host-react-remote/react-remote/src/fulgurjs/exposes/application.tsx)、[React 宿主装配](../../../examples/templates/react-host-vue-remote/react-host/src/fulgurjs/host/application.tsx)、[模板入口](../../../examples/templates/README.md)。模板使用 registry 正式包，可整目录复制后独立安装。

当前 CLI 的 --application 只识别明确默认导出的 defineApplication；不能用它扫描任意业务初始化或 defineBridgeApp。startup 中的步骤属于工具提出的统一启动改写方案，不是接入硬要求。保留 main 的项目手工配置真实桥接 expose，不执行不合适的 --write 计划。
