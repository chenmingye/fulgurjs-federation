# 已有完整应用首次接入：保留业务入口，增加必要桥接

> 本文描述当前公开 API。先核对实际安装包、业务入口和路由；示例路径代表已有业务模块，必须替换为项目真实位置。

**已有工程默认保留原 `main.ts(x)` 和业务初始化的位置。完整应用只增加桥接契约并复用已有初始化；普通组件直接 expose 原文件。** 不要求把 main 搬进 `src/fulgurjs/`，不要求再注册整套组件库，也不要求为远程组件新建包装文件。

## 0. 先区分你要加载什么

| 需要 | 默认接法 | 是否需要处理原 main |
|---|---|---|
| 两个表单、按钮、普通组件或函数 | expose 原文件；组件用 remoteComponent，函数用 loadRemote | 不需要 |
| 带自己的路由和状态的完整子应用 | expose 应用桥接契约，调用已有业务初始化 | 保留原独立入口；核对是否已有可复用初始化函数 |
| 新工程，希望插件统一管理独立/嵌入启动 | 可选择 defineApplication | 选择这种组织方式后，main 才调用 application.start |

远程组件的参数传递、类型与可选 Provider 见[组件与模块](components-and-modules.md)。**不要为了显示一个表单套用本页的完整应用步骤。**

开始前读取真实 `index.html`、main、router、store、认证来源和初始化函数，记录依赖安装位置、挂载选择器、初始化顺序、开发地址和部署 base。原有业务 TS 错误单列；接入新增错误必须修复。

## 1. 保留原入口，先确认可复用的业务初始化

已有 `bootstrap`、`createApplication`、`setupAll` 等函数时，先查它是否会创建 app、注册业务插件、创建 router，以及是否已经 mount。**名称不限，也不必改名或移动。**

桥接需要取得本次实例及清理能力。Vue 常用的可复用边界是：创建并配置 app/router，返回尚未挂载的实例。原 main 继续负责原来的独立启动，桥接入口调用同一个初始化函数。

| 原工程情况 | 处理方式 |
|---|---|
| 已有初始化函数，能返回未挂载的 app/router | 直接复用，保留原路径与业务注册代码 |
| 已有 mount/unmount 生命周期 | 核对容器、取消、路由和清理合同；按桥接 API 适配已有生命周期 |
| main 只有顶层 createApp/use/mount，没有可复用边界 | 需要做最小的业务启动适配；仅整理必须复用的创建/初始化部分，位置按原业务职责决定 |
| 只有普通组件需要被远程使用 | 不整理 main，不创建应用工厂 |

最后一种完整应用入口不能通过 `import('./main')` 安全复用：它可能立即挂到固定 `#app`、启动浏览器路由或只在首次模块求值时执行。插件不会自动拦截任意业务 main。**确实没有可复用边界时，需要调整业务启动代码；这不等于默认把整份 main 迁进插件目录。** 不复制两套组件、权限、i18n 或 store 注册清单。

## 2. Vue：桥接入口只适配已有初始化

以下假定项目**已有** `src/bootstrap.ts` 导出的 `createBusinessApplication`。它不是插件 API，不是要求新建的文件。示例约定它接收运行模式和取消信号，返回 `{ app, router }`；实际函数的参数按项目真实接口适配。

```ts
// src/fulgurjs/exposes/application.ts：只增加联邦桥接边界。
import { defineBridgeApp } from '@fulgurjs/federation/vue'
import { createBusinessApplication } from '../../bootstrap'

export default defineBridgeApp((_props, context) => {
  return createBusinessApplication({
    mode: 'bridge',
    signal: context?.signal,
  })
}, { routing: true })
```

`defineBridgeApp` 可以与项目原有的独立 main 同时存在。它表示这里定义的是桥接入口，**不表示这个项目不能独立启动**。此路径不要求 main 改成 `application.start()`。

复用函数必须满足这些真实生命周期条件；如果它已经满足，就不要再次注册：

- 返回本次挂载的 Vue app 和 router；app 已装配实际需要的 store、i18n、UI 插件、指令与守卫。
- 桥接 router 使用 memory history。独立入口保留原有 web/hash history，不能让嵌入应用直接争用宿主浏览器历史。
- 返回 `{ app, router }` 并声明 `{ routing: true }` 时，不提前 `app.use(router)` 或 `app.mount()`；插件连接路由通道、等待初始深链、安装 router 并挂载。宿主也要按第 3 步提供 routing。
- 若业务初始化必须在 router 就绪后继续执行，使用[显式路由安装方式](url-sync.md)，只返回 app；不要把已安装的 router 再交给插件安装。
- 每次新建 router 都要安装它自己的动态路由和守卫。用户资料已缓存不代表新 router 的菜单已经注册。
- 异步初始化遵守本次 signal；离页、登出或换代后不再写旧实例。模块顶层 import 只求值一次，不能靠重复 import 重装本次 router 的副作用。
- 明确业务状态归属。模块级 `createPinia()` 是复用同一个 store 容器，不能把 `app.use(store)` 说明成“每次新建 store”。并行应用实例需要独立的状态和清理，见[状态绑定](existing-apps.md#pinia库单例与业务实例分别管理)。

提供方在已有配置中声明：

```ts
// 合并进原 fulgurjs.config.ts，不覆盖其余业务配置。
export default {
  name: 'orders',
  exposes: { './bridge': './src/fulgurjs/exposes/application.ts' },
}
```

只有新增接线放在 `src/fulgurjs/`。已有业务初始化、App、router、store、组件注册源和页面保留原位置；不为 expose 再造无职责的转发文件。动态 import 不是接入要求；需要代码分割或声明依赖边界时可按真实模块使用，不把整个 main 改成一长串 Promise.all，也不用它掩盖接入类型错误。

### 可选：用 defineApplication 统一管理两种启动

新工程，或项目主动选择由插件同时管理独立启动和桥接时，可以让 `defineApplication` 调用同一个业务初始化函数：

```ts
// 此方案替代上面的 defineBridgeApp 入口，不同时维护两份。
import { defineApplication } from '@fulgurjs/federation/vue'
import { createBusinessApplication } from '../../bootstrap'

export default defineApplication((_props, { mode, signal }) => {
  return createBusinessApplication({ mode, signal })
}, { routing: true })
```

**仅选择此方案时**，独立入口可调用 `application.start('#app')`，由插件管理安装、挂载和卸载。它是可选启动方式，不是已有工程接入前必须进行的入口迁移。完整合同与 React 接法见[已有应用参考](existing-apps.md)。

## 3. 宿主使用一个挂载视图和一个路由前缀

在宿主已有页面/路由中挂载，Vue 示例：

```vue
<!-- src/fulgurjs/host/RemoteApplication.vue -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { createVueBridgeApp, createVueBridgeNavigation } from '@fulgurjs/federation/vue'

const props = defineProps<{
  getIdentity?: () => string | number | null | undefined
  getContext?: () => Record<string, unknown>
}>()
const RemoteApplication = createVueBridgeApp('orders/bridge', {
  session: props.getIdentity,
  getContext: () => props.getContext?.() ?? {},
})
const routing = { basePath: '/orders', navigation: createVueBridgeNavigation(useRouter()) }
</script>
<template><RemoteApplication :routing="routing" /></template>
```

在宿主原 routes 中让 `/orders/:pathMatch(.*)*` 指向这个视图。远程已有页面、权限与菜单由远程管理，不逐页在宿主复制。basePath 不含部署 base：部署 `/main/` 时逻辑路由仍是 `/orders`。

同一远程内部导航保持桥接实例稳定；切换远程时按 spec 区分 Vue key。不要默认以每次 fullPath 变化重建整个子应用。React 宿主用 `createReactBridgeApp` 和 `createReactBridgeNavigation`，见[桥接指南](app-bridge.md)。

## 4. 有登录依赖才增加业务上下文

Vue 宿主使用已有认证状态提供 getIdentity/getContext；这些是上例视图接收的业务函数，不是新建一套登录流程：

- 身份就绪返回稳定、非敏感用户 ID；恢复中返回 undefined；明确退出返回 null。getter 读取响应式状态。
- token 不作身份，不手工制造 sessionKey。getContext 只传真实业务能力，如 `getToken: () => 最新token`。
- 已有子应用认证缓存确需适配时，复用其原业务映射。请求时读取最新凭据，不通过整应用重挂来刷新 token。
- token state 已赋值（含空串）时优先读 state；仅未恢复时回退缓存，避免登出读回旧登录态。
- 插件生成非敏感代次并处理会话失效。无法从业务状态观测的同账号重新认证，需业务认证批次标识或显式会话，不能假定插件能猜出来。

### 宿主给子应用提供表单

固定配套组件推荐宿主 expose 原表单，子应用 `remoteComponent`。多个宿主提供不同实现时可用 getContext 注入装载器。完整示例、准确 props 和可选环境适配见[组件与模块](components-and-modules.md#宿主向子应用提供组件推荐方式与选择依据)。

**内部控件注册是必验项。** 表单有数据不代表字典框、选人框、上传器已正确渲染。先按[原注册源复用与逐层验收](components-and-modules.md#已有项目复用原组件注册源)确认实际消费方 app、内部全局标签、子组件及原自定义实现，再接 globalComponents；生产 DOM 残留 a-select/a-button 等应解析标签时不得判为完成。完整接线、原入口保留、重挂与只读验证见该节。

**普通远程组件不要求新增包装组件。** 原组件可直接渲染且依赖齐全时，保持原文件。只有缺少特定祖先注入才按需配置 pageProviders；一个已有 Provider 可直接引用，仅组合多个 Provider 或确有参数适配时再写包装组件。全局标签注册是另一件事，不能靠 Provider 自动复制注册表，也不能默认复制整套 UI 库清单。

## 接入方案本身也必须验收

**页面显示正常不等于接入方案合格。** 已有工程接入与新建模板是两种场景；模板采用 `defineApplication/start` 是合法选择，不能据此要求已有工程改写入口。下表适用于首次接入、AI 执行任务和后续回归，交付时逐项说明对应源码与验证结果。

| 检查项 | 推荐做法与通过条件 | 不通过的做法 |
|---|---|---|
| 原独立入口 | 保留独立启动职责；已有初始化函数就地复用 | 未说明必要性就把整份 main 搬进联邦目录，或强制改成 application.start |
| 确实没有可复用边界 | 仅提取创建/配置阶段为一份业务函数；main 负责独立挂载，桥接复用未挂载实例 | 把整份装配另搬进新 helper，只缩短桥接文件就宣称已精简；创建一行转发壳 |
| 业务插件与组件注册 | 每个新 app 安装自己的必要依赖；原注册源只维护一份，缺失的消费方依赖按需复用 | 误以为 app 间自动继承注册表，或另抄一份 UI 库大全 |
| 普通远程表单 | 直接 expose 原业务组件；URL 页面若需 props，在原页面区分参数来源并保留原入口 | 为纯传 props/slot 新建包装组件；只有两个组件却增加整套应用启动 |
| Provider | 先证明缺少哪个注入键；单个已有 Provider 直接引用 | 默认新建 FormProviders.vue，或认为 Provider 会自动复制全局注册 |
| 参数类型 | 提供方精确定义一次，消费方通过生成声明推导；验证错字段/错类型确实报错 | 手改生成声明、在消费方重复 DTO，或用宽字典替代已知字段 |
| 路由与副作用 | 独立 history 与实际部署 base 一致；桥接用受控 memory router；每个新 router 安装守卫/钩子 | 缺省 base 落到错误根路径，或靠重复 import 重装只求值一次的副作用 |
| 异步与功能开关 | 离页清理定时器，迟到响应不再操作旧表单；关闭的业务能力不启动对应请求 | 页面卸载后继续回填，或为未启用的租户/扩展功能发请求 |

`src/bootstrap.ts` 不是固定要求：已有可用函数时不新建；只有创建阶段必须共用而原先又和固定 mount 绑在一起，才可在业务目录提取。业务初始化不能凭空消失；精简的目标是职责明确、同一清单只维护一次。这里的“一次”指同一套注册的源码只维护一份，不是整个页面生命周期只执行一次：每个新建 app 都要安装自己的必要依赖，不同应用也可以使用不同组件库。

按[维护者验收规则](../../maintainers/testing.md#已有工程接入方案验收)记录依据。普通组件无需业务启动；完整应用也不能省略实际必需的注册、守卫或状态映射来凑行数。

## 5. 工具预览与验收

手工接线是有效路径。CLI `init --plan` 只预览，`--write` 才写入；组件模式不生成应用工厂。完整应用模式对可识别的最小 main 可能提出提取装配的计划，**那是工具选择的改写方案，不是插件运行的必要条件**。已有工程若不采用该方案，保留 main 并手工配置真实桥接入口即可。当前 CLI 的 `--application` 只识别明确默认导出的 defineApplication 文件，不识别任意桥接契约或会自行 mount 的 main。保留独立入口并使用 defineBridgeApp 的项目，手工配置 exposes 即可，不运行这个参数。

在每个真实应用目录检查配置和类型，启动自己的开发服务，再验证：

1. 独立启动仍正常；宿主登录、真实列表和原有业务组件可用。
2. 详情深链、菜单、前进/后退、刷新；没有多余 history 写入。
3. 离页/重进、取消、换号/登出、迟到请求和组件清理。
4. 正式包构建与实际部署文件一致；Provider/全局组件确有必要时，比较字段、数据、只读、字体和布局。

文档路径、工具写入、类型生成、构建、部署和浏览器验收是不同事实，逐项记录。纯文档工作不重建业务站点，也不代表业务代码已按新文档整理。
