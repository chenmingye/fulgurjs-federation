# 已有完整应用首次接入：从原入口到真实页面

> 自动会话、`--application` 与纯声明 setup 自 6.12.0 起在正式包可用。本文所有示例直接使用 registry 正式版本。

这一页只讲一条路径：**保留原工程，用一份装配同时支持独立运行和嵌入运行，再由宿主加载整个应用**。先让真实页面可用，再进入生产交付。普通组件/函数使用[组件与模块](components-and-modules.md)，不要套完整应用的装配步骤。

## 0. 接入前只确认这些事实

在原工程里找到并记下真实位置；不知道就读该文件，不靠旧项目记忆，也不要新建空文件来满足示例 import。

| 必须确认 | 从哪里找 | 记录什么 |
|---|---|---|
| 框架、Vite、包管理器 | package.json、实际锁文件 | 每个应用自己的安装/启动命令 |
| 原启动入口 | index.html 指向的脚本 | main 的实际路径、原挂载选择器 |
| 原装配顺序 | main 与它调用的函数 | App、router、store、i18n、组件注册、权限守卫的真实导入和调用 |
| 路由形态 | router 创建处 | 独立模式的 base、routes 来源、守卫是否通过模块副作用注册 |
| 开发地址 | Vite base/端口与实际服务 | remote 的完整开发根 URL，不能只猜端口 |
| 登录依赖（确有才记录） | 原登录状态/请求层 | 是否已登录、稳定用户标识、取最新token的方法；子应用如何读登录态 |

只检查新增及实际修改接入文件的 TS 诊断。原业务树里已有的 TS 错误单独登记，不以修复整个项目为接入前置条件。

**目标分开记录**：首次接通 = 原宿主登录可用、远程显示真实业务内容、基本导航正常；生产交付 = 另完成构建、部署、深链刷新、换号/登出、重进和故障恢复。以一小时内首次接通为优化目标，不能把一小时当作所有工程完整交付的保证。

## 1. 先预览，看到复杂入口就按清单整理

在每个应用自己的目录安装插件，保留原有依赖与锁文件体系。pnpm 安装审批、冷却提示见[安装说明](getting-started.md#安装)，先确认实际版本再继续。

以下以 Vue 宿主加载 Vue 订单远程为例；名称和 URL 改成第 0 步确认的真实值：

```bash
# 远程应用根目录；app 明确表示完整应用，不使用默认的 component 模式
npx fulgurjs init --plan --kind app --role provider --name orders

# 宿主根目录；orders 必须与远程容器名一致
npx fulgurjs init --plan --kind app --role consumer --name admin --remote orders=http://localhost:5174
```

- 最小入口可安全提取时，计划生成 `src/fulgurjs/exposes/application.ts`，同步 main 的相对导入。
- 入口已有 Router/store/权限时，**整批不写**。输出 `startup.entry/application/imports/steps`：当前入口、目标文件、实际依赖与整理顺序。按第 2 步迁移原装配，不换模板工程、不复制另一套业务。
- 已有统一装配时直接 `--application <真实文件>` 复用，不为 CLI 再造一个转发文件。命令不会覆盖现有工厂或擅自删除旧 main。
- 所有“写入成功”都仅表示接线已写入，不表示页面已验收。

## 2. 远程只保留一份原装配

新增接线放 `src/fulgurjs/`；原 App、页面、路由仍在原位置。只需要 `exposes/application.ts` 时就只建这一目录，不强建 host/types/setup/session 文件。

Vue 示例的 App 与 router 都是原项目的真实模块，路径需与第 0 步一致：

```ts
// src/fulgurjs/exposes/application.ts
import { defineApplication } from '@fulgurjs/federation/vue'

export default defineApplication(async (_props, { mode, signal }) => {
  // 动态加载原业务实现，避免把整个业务TS树当成公开声明必须检查的入口。
  const [{ createApp }, { default: App }, { createApplicationRouter }] = await Promise.all([
    import('vue'), import('../../App.vue'), import('../../router'),
  ])
  if (signal.aborted) throw new DOMException('本次启动已取消', 'AbortError')
  const app = createApp(App)
  const router = createApplicationRouter(mode)
  // 将原 main 的 store/i18n/全局组件/指令/权限装配原样迁入这里，保留顺序。
  // 异步等待后写状态前检查 signal.aborted；不要再调用 app.mount 或 app.use(router)。
  return { app, router }
}, { routing: true })
```

业务模块加载和应用装配是两个阶段。模块顶层的代码会在 `app.use(pinia)` 之前执行；不要在指令或工具模块顶层调用依赖当前应用的 `useStore()`。把读取放到实际鉴权或业务操作中，在组件外显式传入所属应用的 Pinia，或复用原工程已有的显式 store getter。不能靠刷新、延时或其他应用先激活 Pinia 来保证初始化顺序。

原 router 文件改为按实例创建，而不是模块导入时创建 web history：

```ts
// src/router/index.ts：这里假定原工程已有 ./routes 导出 routes；使用你找到的真实导出。
import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router'
import { routes } from './routes'

export function createApplicationRouter(mode: 'standalone' | 'bridge') {
  const router = createRouter({
    history: mode === 'bridge' ? createMemoryHistory() : createWebHistory(import.meta.env.BASE_URL),
    routes,
  })
  // 原项目的守卫在此对本 router 安装；不要漏掉权限初始化。
  return router
}
```

**如果原守卫文件静态 import 默认 router 并在模块求值时注册**：将其改为接收 router 的安装函数，并在每次装配时调用。只把 import 改成动态导入不能保证重进时守卫再次安装。不能为省事先创建一个 web router 再改 history，那会先写错宿主 URL。

原 main 只调用这份装配；原样式导入也要保留在 main 或装配的真实位置，不能丢失：

```ts
import application from './fulgurjs/exposes/application'
void application.start('#app').catch(console.error) // 使用原工程真实选择器
```

整理后重新预览：

```bash
npx fulgurjs init --plan --kind app --role provider --name orders --application src/fulgurjs/exposes/application.ts
# 审查后追加 --write；已有 fulgurjs.config.ts 保留，需核对这一项：
# exposes: { './bridge': './src/fulgurjs/exposes/application.ts' }
```

React 使用 `exposes/application.tsx`，同一个 `defineApplication` 工厂独立时返回原 BrowserRouter/RouterProvider，嵌入时返回受控 router 的 `{ element, dispose }`。原 Provider/store 放在这个工厂里，每次创建自己的实例；完整代码可直接按 [showcase 远程装配](../../../examples/templates/showcase/react-remote/src/fulgurjs/exposes/application.tsx)对照搬入，不能用 Vue createApp 写法套 React。

## 3. 宿主只有一个远程挂载视图和一条前缀路由

宿主预览后 `--write` 生成 `src/fulgurjs/host/RemoteApplication.vue`。Vue + URL 同步的完整挂载视图如下；这里不假造登录 store：

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { createVueBridgeApp, createVueBridgeNavigation } from '@fulgurjs/federation/vue'

const props = defineProps<{
  getIdentity?: () => string | number | null | undefined
  getContext?: () => Record<string, unknown>
}>()
const RemoteApplication = createVueBridgeApp('orders/bridge', {
  session: props.getIdentity, // 无登录需求时不传，仍可独立加载
  getContext: () => props.getContext?.() ?? {},
})
const routing = { basePath: '/orders', navigation: createVueBridgeNavigation(useRouter()) }
</script>
<template><RemoteApplication :routing="routing" /></template>
```

在**宿主原有 routes** 中增加 `/orders/:pathMatch(.*)*`，组件指向这个视图。不要逐页复制远程菜单。远程已有菜单/路由继续由远程自己管理。

有多个远程时，按各自静态前缀选择 spec 和 basePath；复用挂载视图时按 spec 绑定 Vue `key`，避免实例仍保持上一个远程的工厂。host 路由逻辑路径不含部署 base（例如部署 `/main/`，路由仍是 `/orders`）。

React 宿主的相同职责见 [showcase 挂载视图](../../../examples/templates/showcase/react-host/src/fulgurjs/host/BridgeVuePage.tsx)：使用 `createReactBridgeNavigation` 连接原 data router，不能把 Vue hooks 放进 React 工程。React 的会话仍使用明确受控 `sessionKey`；本页的自动身份 getter 仅属于 Vue 宿主。

## 4. 有登录依赖才增加业务上下文

Vue 宿主把已有登录状态传给视图的 getIdentity/getContext，或在 `host/context.ts` 集中实现这两个有实际职责的 getter：

- 身份就绪：返回稳定、非敏感的用户ID；切租户要重置业务实例时将租户ID一起纳入标识。
- 身份恢复中：返回 `undefined`，插件暂不加载并保留刷新前的恢复记录。
- 明确退出：返回 `null`，插件作废异步任务、卸载并清理旧上下文。
- `getContext` 返回真实 `user`、`getToken: () => 最新token` 和确有消费方的业务能力，不手填 sessionKey，不在 getter 里 provide。
- getter 使用模块级稳定函数并读取宿主store，不捕获卸载后不再更新的局部props；插件在远程视图离开后仍观察该身份来源，才能识别离页期间的登出。
- getter 必须读取响应式状态。localStorage 本身不响应；登出时必须让已绑定的登录状态变为空。token 只判断是否登录，不作为身份标识，刷新token不重挂。
- 插件在 sessionStorage 中保存非敏感身份与随机代次以支持刷新恢复，不能传token、密码或个人敏感资料。无法从业务状态观测到的“同账号再次认证”需用业务登录批次标识，或采用显式受控会话；插件不猜认证事件。

子应用若原先有自己的 token 缓存或不同用户字段，只在 `exposes/context.ts` 做一次实际字段映射，**先于业务守卫和页面加载**，异步写回前检查 signal。不把私有认证结构塞进插件，不重复创建空 session/helper 文件。

组件需要 AppProvider/主题注入时只保留一个真实 Provider 声明：

```ts
// src/fulgurjs/setup.ts：没有应用级副作用就不写空默认函数
export const pageProviders = [() => import('./exposes/FormProviders.vue').then(m => m.default)]
```

共享同一个 Vue 包，不代表两个应用拥有同一棵组件祖先树。原组件通过祖先 `provide` 取得的主题、类名前缀、语言等，需要在消费方重建对应 Provider；全局注册只能解决标签解析，不能补齐这些注入。复用原业务根 Provider，只包裹内容，不再挂一层 RouterView 或整个应用。

通过业务函数自行传递组件时，不会触发远程模块的 setup/Provider 装配；这层业务适配要同时返回已经包好 Provider 的组件。检查实际类名前缀、控件与编辑器宽度，不能只看 CSS 已加载或字体颜色相同就判定样式正确。

普通组件不需要 Provider 时不建这个文件。现有 iframe 里的完整应用或业务表单不会自动变成联邦组件：找到实际 iframe 创建处后，按组件/桥接的真实能力替换，并核对只读、数据和样式。TinyMCE内部编辑iframe不属于业务跨应用iframe，不机械删除。

## 4.1 替换旧微前端壳时必须一起处理的宿主设施

远程能挂载不等于旧壳已经退出。逐项核对后再宣称接通：

- **旧微前端注册点**：入口 bootstrap、布局 mounted、登录 setToken 回调等可能各自再注册一次旧壳。切换为联邦后全部关闭或按开关短路，并确认没有第二个容器抢占同一前缀。
- **后台菜单生成的动态路由**：后台菜单常为子应用内部路径生成组件为空的记录。它们只用于菜单展示；注册进 vue-router 会以更具体的路径压过远程前缀的 catch-all，点击菜单后内容区空白。先构建菜单树，再把同前缀记录从路由表剔除。
- **宿主页面容器 key**：不要按 `route.fullPath` 重建远程挂载视图。子应用内部导航会同步宿主 URL，fullPath 变化会卸载整个远程应用，正在初始化的异步页面会在已置空的 ref 上抛错。远程前缀路由使用每个远程稳定的 key。
- **旧跨应用 iframe / 宿主页面**：替换为宿主提供真实组件与事件（getContext 返回组件装载器、全局组件安装、事件对象），在子应用内直接渲染；同源 iframe 只能作为旧环境兜底，不能作为联邦验收。TinyMCE 编辑 iframe 例外。
- **会话身份读取**：登出动作可能先清 store 状态、后清持久缓存。身份 getter 若读取会被 Pinia 缓存的 getToken getter，会在中间态把旧缓存 token 缓存进计算属性，随后路由守卫把 `/login` 重定向回首页。按 state 优先：state.token 已赋值（含空串）就以它为准，只有未恢复（undefined）才读持久缓存。
- **快速离开后重进**：子应用每次挂载是新 router，动态路由表只属于该 router。权限守卫不能只凭“用户资料已设置”跳过 `addRoute`；以 router 实例为粒度重新登记动态路由。
- **业务组件的宿主依赖**：直接从宿主模块图取组件在子应用内渲染时，必须同时补齐它假设的全局组件、事件与存储归属；否则出现未解析标签、原始 username 或空下拉。异步回调里不要用 `getCurrentInstance` 取 app，应在 setup 期捕获。

## 5. 按这一顺序接通，卡在哪一步就处理哪一步

1. 按原启动脚本先启动远程，核对实际 dev manifest/remoteEntry 与提供方类型生成日志。
2. 再启动宿主，先确认宿主原登录/首页正常，再进入 `/orders/...`。
3. 确认远程显示真实业务数据，并能操作一个真实导航/按钮；白壳、占位或只有菜单不算首通。
4. 打开自动同步的声明体验真实 props/方法提示；不手写消费方类型、不用 any/Record 占位掩盖接口。
5. 仅检查新增及修改接入文件的 TS；错误落在原业务依赖内时登记归属，不顺手全项目整改。
6. 接通后再执行生产构建、部署体检、深链刷新、query/hash、退出/换号、重进、故障恢复与视觉对照。

构建目标：共享门面产物包含顶层 await。生产 `target` 必须支持 TLA（如 es2022），或使用能正确处理全部 chunk 的 TLA 转换；不要为了绕过构建错误停用合法的 `manualChunks`。`sourcemap: 'inline'` 在超大产物上可能触发 Vite import-analysis 栈溢出，可改为外部 sourcemap。首次给旧工程引入插件后清一次 `node_modules/.vite` 再验收。

遇到问题先保留第一条错误、URL及调用栈，再按[错误码](../reference/errors.md)定位。发现源码或文档缺陷就修正；不得靠静默fallback、停用合法打包配置、伪造接口数据或改验收判据绕过。后端不可达单独记录具体接口，继续完成不依赖它的工作。

## 6. 交接时只交这些可核实的内容

实际版本/文档提交、原基线与本次接入的文件清单、每个文件的职责、安装/启动命令、首次真实接通时间、卡点与耗时、类型检查归属、生产部署清单、逐项执行结果。未执行与外部阻塞明确标注，不能引用旧报告冒充本次通过。

### 动态标签变成 `[object Object]`

先检查实际组件解析结果，而不是仅凭 chunk 名推断框架实例分裂。`app.component(service.name, service)` 不能用于命令式消息等服务：生产压缩会改变函数名，若短名与 `b` 等 HTML 标签相同，`resolveDynamicComponent` 可能将动态标签解析成该服务。只注册具有稳定公开组件名的真实视图组件；服务按其公开调用或安装方式使用。不要通过替换业务标签或关闭合法分包配置掩盖冲突。
