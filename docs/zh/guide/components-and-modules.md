# 组件与模块加载

> 加载一个远程组件或函数模块，不需要桥接、页面表或登录初始化——这是联邦的最小用法。导入入口：Vue 从 `@fulgurjs/federation/vue` 导入，React 从 `@fulgurjs/federation/react` 导入，框架无关代码从 `@fulgurjs/federation/runtime` 导入。

## 宿主向子应用提供组件：推荐方式与选择依据

**组件有固定的提供方和稳定的对外接口时，推荐 `exposes + remoteComponent`。** 只有组件实现需要由当前宿主决定、子应用需要适配多个宿主时，才选择通过桥接 `getContext` 注入组件装载器。两者都是当前支持的用法，不按新旧划分，也不要求已有可用的注入方案改写。

“宿主/子应用”描述完整应用的挂载关系；“提供方/消费方”描述某个模块的加载关系。**宿主可以同时是组件提供方，子应用可以同时是组件消费方。** 不需要因为应用叫 host 就把它提供的所有组件都放进 context。

| 需求 | 推荐用法 | 子应用依赖什么 |
|---|---|---|
| 管理宿主与流程子应用固定配套，子应用需要两类宿主表单 | 宿主 expose 两个组件入口，子应用 `remoteComponent` 加载 | 远程名称、exposes 键及组件 props/events |
| 同一个流程子应用由不同业务宿主挂载，每个宿主提供不同表单实现 | 宿主 `getContext` 注入业务组件装载器 | 约定的装载器签名及返回组件的 props/events |
| 组件需要自己的完整路由、状态容器和挂载/卸载生命周期 | [完整子应用桥接](app-bridge.md) | 应用桥接契约；不要把整个应用当普通组件渲染 |

### 推荐示例：宿主提供两个表单，子应用直接加载

以下为 **Vue → Vue 组件复用**。它可以用于 Vue 桥接子应用内部，但不能把 Vue 组件直接交给 React 渲染。跨框架完整应用使用应用桥接。

关系为：`admin 宿主 ─挂载→ workflow 子应用`，同时 `workflow ─加载表单→ admin`。这是两种职责，不表示两个完整应用互相挂载；避免在模块顶层互相等待对方完整应用启动。

**1. 宿主声明两个组件入口。** 文件名描述实际职责，原业务组件与页面保留原位置；只有确实需要参数转换或环境装配时才新增适配组件，不为 expose 创建纯转发文件。

```ts
// admin/fulgurjs.config.ts：合并到宿主已有配置，不覆盖已有 remotes/shared。
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'admin',
  exposes: {
    './business-form': './src/components/forms/BusinessForm.vue',
    './schema-form': './src/components/forms/SchemaForm.vue',
  },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

这里直接指向两个已存在的业务组件；无需为 expose 将它们移进 fulgurjs 或新增转发组件。它们通过 props 接收单据 ID、只读状态等，通过 emits 通知保存/取消；不要再从宿主当前 URL 猜参数。props 在入口组件声明，消费方使用插件生成/同步的类型，不复制第二份接口。

**2. 子应用配置组件提供方。** 宿主原来加载子应用的 remotes 保留；这里是在子应用自己的配置中增加反向的组件来源。

```ts
// workflow/fulgurjs.config.ts：保留原有完整应用 bridge expose 等配置。
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'workflow',
  remotes: {
    admin: { dev: 'http://localhost:5173', prod: '/admin' },
  },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

示例地址是假设的部署位置：用提供方真实的开发根 URL 和生产挂载路径替换；有 Vite base 时必须包含该 base。双方继续在各自 Vite 配置中通过 `federation(fulgurjsConfig)` 注册，不是仅创建这个文件即可生效，接线见[快速上手](getting-started.md#已有项目接入)。生产 `/admin` 必须确实服务 admin 的构建文件。

**3. 子应用在真实业务视图渲染。** 下面假定两个入口都声明了 `recordId: string` 和 `readonly?: boolean`；实际使用以提供方生成的 props 类型为准。

```vue
<!-- workflow/src/views/ApprovalDetail.vue：放在现有业务视图，不另造空壳页面。 -->
<script setup lang="ts">
import { remoteComponent } from '@fulgurjs/federation/vue'

defineProps<{ recordId: string; formKind: 'business' | 'schema' }>()
const BusinessForm = remoteComponent('admin/business-form')
const SchemaForm = remoteComponent('admin/schema-form')
</script>

<template>
  <BusinessForm v-if="formKind === 'business'" :record-id="recordId" :readonly="true" />
  <SchemaForm v-else :record-id="recordId" :readonly="true" />
</template>
```

这条路径不再经 `getContext` 传这两个组件装载器。context 继续承载实际需要的用户、最新 token getter、事件等业务能力。`remoteComponent` 负责远程组件加载及加载错误展示/重试，远程声明用于 props 推导；它不会替你补齐业务参数、权限或 Provider。

### 远程组件是否必须包装：先分清三件事

**不需要因为“远程”就新增包装组件。** 上面的两个 expose 默认直接指向已有表单，消费方照常传 props/emits。原来直接渲染能满足依赖的组件，保持这种接法。

| 名称 | 谁创建 | 何时需要 |
|---|---|---|
| remoteComponent 的内部异步/会话边界 | 插件内部 | 使用这个 API 时自动处理加载、重试和会话，不要求新增业务文件 |
| 业务适配组件 | 项目 | 真实的参数映射、组合业务视图或接口转换时才增加；纯转发不建文件 |
| 祖先 Provider 包裹 | 提供方按需声明，适配器执行 | 原组件确实依赖祖先注入，且消费方没有提供匹配环境时才补 |

`pageProviders` 未声明或为空时，不增加这层 Provider。`remoteComponent` 自身的异步边界不等于必须写 `FormProviders.vue`。也不要为了避开插件内部异步边界而把完整业务 App 包进普通组件。

### 只有缺少祖先注入时才声明 Provider

先读原组件实际使用的 inject/context：它是否自己包含 Provider？消费方祖先是否已提供同一个注入键？组件没有这类依赖时，不创建 setup 或 Provider 文件。共享同一个 Vue 包不会自动连接两棵应用的祖先树，但这也不代表所有组件都缺少环境。

确实缺少原工程已有 `AppProvider` 时，提供方配置 `setup: './src/fulgurjs/setup.ts'`，直接复用真实组件：

```ts
// admin/src/fulgurjs/setup.ts：仅在确有祖先依赖时使用。
export const pageProviders = [
  () => import('../components/Application/src/AppProvider.vue').then(m => m.default),
]
```

示例假定该文件已存在且通过 default 导出 Provider。路径和导出按原项目替换；无需为这一层纯转发再建 FormProviders.vue。插件会在消费方将本远程组件放到这个 Provider 的子树中，不启动另一个 App，也不挂 RouterView。Provider 自身的监听器、store 操作和副作用仍需核对是否适合这里的生命周期。

只有组合多个 Provider、传真实主题/语言配置或进行实际适配时，才新增如 `exposes/FormProviders.vue` 的组件，并将它声明进 pageProviders。它必须渲染 slot；提供方已自行包好与 pageProviders 包裹二选一，避免重复。这个文件名没有特殊含义，也不是接入必备文件。pageProviders 对该远程经组件适配器加载的组件生效，并非按单个 expose 选择；只有部分组件依赖 Provider 时，可在那些原组件内部满足依赖，避免给整个远程统一加层。

### 全局组件注册与 Provider 是不同依赖

组件模板里的局部 import 会随组件模块加载；全局字符串标签按**实际消费方 Vue app** 的注册表解析。提供方 main 注册过组件，并不自动复制到另一个 app。处理顺序如下：

1. 消费方已注册对应组件/指令，或原组件已经局部导入：不再增加注册。
2. 缺少少量标签：从原有注册源复用确实需要的实现；用 globalComponents 声明时只列缺失的真实依赖。
3. 存量组件广泛依赖原统一注册：复用原注册函数并对实际消费方 app 幂等安装，先核对依赖成本、定制项和同名冲突；不要手抄另一份 UI 库大全。

`globalComponents`、`pageProviders` 和业务 app 的初始化不是同一件事。Provider 不复制全局注册表，globalComponents 不补 inject，组件复用也不意味着执行提供方整个 main。缺少自定义权限指令时复用其真实实现，不能用空指令凑渲染通过。具体注册粒度见下方[复用注册源](#已有项目复用原组件注册源)。

### 自动类型：提供方定义一次，消费方推导使用

在**原表单组件**明确声明真实字段，例如 `defineProps<{ recordId: string; readonly?: boolean }>()`。插件同步的是该公开合同；如果提供方写成 Record<string, unknown>，生成结果也只能是宽泛字典，不会凭字段名猜业务约束。

消费端无需手工 import 生成的 d.ts；类型目录被 tsconfig 包含后，注册表会让 remoteComponent 得到对应组件的 props/events。需要给本地表单参数状态标注类型时，用 `FgVueRemoteProps` 从远程入口直接取真实 props——减少提取代码；它本身不负责改变组件标签的悬停表示：

```ts
import { ref } from 'vue'
import { remoteComponent } from '@fulgurjs/federation/vue'
import type { FgVueRemoteProps } from '@fulgurjs/federation/vue'

const BusinessForm = remoteComponent('admin/business-form')
type BusinessFormProps = FgVueRemoteProps<'admin/business-form'>
const form = ref<Pick<BusinessFormProps, 'recordId' | 'readonly'>>({
  recordId: '',
  readonly: true,
})
```

这不是维护第二份接口。已知业务字段不应重新声明为宽泛对象或 any；真正开放扩展的数据可单列扩展字段。类型验收需要同时验证错误字段类型和缺少必填字段会失败，不能只测试“整个参数传字符串报错”。

组件参数变化是否重新查询由业务组件负责；离页取消定时器和迟到回写。共享 Vue/Pinia 包不等于共享业务状态，状态归属见[状态绑定](existing-apps.md#pinia库单例与业务实例分别管理)。Provider 也不隔离 CSS，视觉验收比较真实数据、回显完成后的标签、只读与布局。

#### 嵌套 params 也必须检查内部字段

当原页面接收一个 params 对象时，不能只给对象本身一个类型。先在原提供方组件声明已知字段，再生成并同步声明：

```vue
<!-- 提供方原 BusinessForm.vue：URL 入口保留时根 params 可选，传入时字段仍受约束。 -->
<script setup lang="ts">
interface BusinessFormParams {
  id: string
  formId: string
  disabled?: boolean
}
defineProps<{ params?: BusinessFormParams }>()
</script>
```

```ts
// 消费方真实业务文件；不重复声明 BusinessFormParams。
import { ref } from 'vue'
import { remoteComponent } from '@fulgurjs/federation/vue'
import type { FgVueRemoteProps } from '@fulgurjs/federation/vue'
const BusinessForm = remoteComponent('admin/business-form')
type Params = NonNullable<FgVueRemoteProps<'admin/business-form'>['params']>
const params = ref<Params>({ id: 'order-1', formId: 'schema-1', disabled: false })

// 放在实际包含同步声明的有效 TS 测试项目中：这些指令都必须命中真实错误。
// @ts-expect-error 缺少必填 formId
const missing: Params = { id: 'order-1' }
// @ts-expect-error disabled 是 boolean，不能沿用 URL 的字符串
const wrongType: Params = { id: 'order-1', formId: 'schema-1', disabled: 'false' }
// @ts-expect-error 字段拼错不能静默进入宽字典
const typo: Params = { id: 'order-1', formId: 'schema-1', disabeld: true }
```

验收时先运行带 expect-error 的正向项目（包括上述预期错误，且不得出现未使用指令），再临时去掉指令确认原始 TS 错误确实出现。只证明 params='text' 失败，仍可能放过 Record<string, unknown>。后端数据如果是 any，也要在赋值边界核对/转换真实字段，不能用 any、类型断言或重复 DTO 绕过约束。`fulgurjs types` 成功证明生成/同步链通过，不证明提供方业务合同准确。URL 参数在独立入口解析为字符串或布尔业务值；远程 props 不应重新从宿主 URL 猜同名字段。

#### 需要在参数状态悬停中直接查看字段时

命名接口适合表达合同来源；需要直接看到其继承字段时，可在原消费文件增加一层同态映射视图，不手写另一份字段接口：

```ts
type VisibleFields<T> = { [K in keyof T]: T[K] } & {}
type Params = VisibleFields<NonNullable<FgVueRemoteProps<'admin/business-form'>['params']>>
const params = ref<Params>()
```

它只展开一层并保留 optional/readonly 修饰，不转换运行时数据、不递归改写数组或函数；字段仍来自同一生成合同。此时参数值悬停可以直接展示 id/name/disabled 等字段，组件名悬停则由下节的命名声明解决。两种效果要分别实测，不能把映射视图当成组件名展示修复；业务字段正反例仍须通过。

#### 组件悬停名称与业务字段是两个层次

提供方类型生成会为直接 expose 的具体 Vue SFC（官方声明为 `import("vue").DefineComponent<…>`）追加一个以 expose 命名的接口，例如 `ApprovalForm`。该接口继承完整原声明，不重建 `$props`，因此消费方组件名悬停可以显示 `ApprovalForm`，而不是展开全部框架泛型。原始签名仍留在声明闭包，事件、实例方法等沿原类型流动。

这不是手工维护第二份 DTO，也不是 `FgVueRemoteProps` 的效果。使用者无需加包装组件或改返回类型。提供方重新生成/发布类型资源，消费方同步后由 IDE 读取新声明；只升级消费方插件却继续下载旧类型资源，不会得到新展示。

查看业务字段时，悬停模板 `params`、具体赋值字段或跳转到提供方命名接口；字段注释在原接口维护。组件名提示和字段提示分别验证，不能用类型检查通过代替真实 IDE 效果。泛型函数组件、额外 slots 包装或其他未识别的高级声明保持原始表示，以保留其精确签名；不保证所有 Vue 组件或编辑器都显示相同短名称。多个 expose 指向同一声明时使用首次遇到的 expose 名称；同名标识符自动避让，不修改运行时组件名。

### 何时改用 `getContext` 注入

如果 workflow 不应该知道 admin 的名称或地址，例如同一个 workflow 分别被采购、生产两个宿主使用，就由每个宿主在桥接 `getContext` 中提供同一业务契约，例如 `loadBusinessForm`、`loadSchemaForm`。子应用调用当前宿主提供的装载器，而不是硬编码某个宿主的远程 spec。

这两个名称是**业务自定义字段，不是插件内置 API**。双方明确约定参数、异步/同步返回、组件 props/events、缺少能力时的错误展示，以及独立运行时的真实能力来源；不要用空组件伪装成功。装载器仅在组件有祖先依赖时补齐所需 Provider，并负责约定的组件/指令注册及正确状态归属。

直接传组件或通过本地 `import()` 返回组件，**不会触发联邦远程模块的 setup/pageProviders 管线**，也不会自动得到 `remoteComponent` 的远程类型同步和加载错误 UI；调用方需处理自己的 loading/error/retry。若装载器内部实际调用 `remoteComponent`，则该远程组件仍遵循它自己的联邦加载语义。context 中的函数不是响应式订阅，换号后不要继续持有旧会话的组件、数据或回调。

选择一种组件获取合同即可，不同时让同一消费点在“context 注入失败”后偷偷改走另一个 remote。已经使用注入且符合多宿主需求的工程可以保留；无需为了使用联邦而增加固定宿主依赖。

## 提供方：exposes 一个模块

远程应用在 `fulgurjs.config.ts` 里声明对外暴露的模块。普通组件、函数模块都可以直接 expose：

```ts
// remote-a/fulgurjs.config.ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'remote-a',
  exposes: {
    './Panel': './src/components/Panel.vue',        // Vue 组件
    './money': './src/utils/money.ts',              // 纯 TS 模块
  },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

键约定 `'./X'`（可省略 `./` 前缀，配置会规范化并提醒）；值是相对本项目根的源文件路径。只有作为「页面」接入宿主页面路由表时才要求独立页（从路由取参），普通组件无此要求。普通远程组件的必填 props 由消费方传入，也可以由组件提供默认值。`BLD-003` 是页面独立性检查提示，不是“所有必填 props 都必须有默认值”的构建限制。

## 消费方：三种加载方式

### 方式一：`remoteComponent` — 组件直渲染（推荐）

**Vue**（`@fulgurjs/federation/vue`）：

```ts
import { remoteComponent } from '@fulgurjs/federation/vue'

// 完整 spec = 远程名 + exposes 键（./ 可省）
const RemotePanel = remoteComponent('remote-a/Panel', {
  loadingComponent: MyLoading,   // 可选：加载期组件
  errorComponent: MyError,       // 可选：失败期组件（收到 error prop；不传用内置占位）
  retries: 2,                    // 可选：透传 loadRemote 单次重试覆盖
  delay: 200,                    // 可选：进 loading 态前的等待 ms（默认 200）
  timeout: 15000,                // 可选：超时进错误态 ms；不设由运行时容器超时兜底
})
```

```vue
<template>
  <!-- props 在使用处直接透传给远程组件 -->
  <RemotePanel :title="'详情'" :form-params="{ id: 42 }" />
</template>
```

语义要点：

- 返回标准 Vue 异步组件，加载完成后渲染远程默认导出（或模块本身）。同会话的保活状态保留；换会话后重新挂载或激活时，先执行新会话初始化，再渲染页面；
- **零兜底**：加载失败显式进错误态；不传 `errorComponent` 时渲染内置占位（错误码 + 根因 + 修法 + 「重试加载 / 刷新页面重试」按钮），`window` 的 `fulgurjs:error` 事件照常发出；
- 同 spec 多组件实例共享 `loadRemote` 内部 Promise 缓存，容器模块只加载一次。
- **provide/inject 不跨提供方根部**：远程组件渲染在**消费方**的组件树里——提供方 app 根部（`App.vue` 等）的 `provide`（全局 `AppProvider`、prefixCls、主题、ConfigProvider 等）不会跟着组件走；消费方自己的祖先 provide 正常生效。未命中 inject 的症状是取到默认空值（典型：类名前缀变成 `undefined-xxx`、主题类缺失）。暴露面依赖这类上下文时的推荐做法（一处声明、全部暴露面生效）：在提供方 `federation({ setup })` 模块声明 `pageProviders`（祖先 Provider 数组，消费方 `remoteComponent`/`createHostPages` 渲染本远程组件时自动按 外→内 包裹），多个远程页面不再逐页手写包装：

  ```ts
  // 提供方 src/fulgurjs/setup.ts —— federation({ setup: './src/fulgurjs/setup.ts' })
  export const pageProviders = [
    () => import('../components/Application').then((m) => m.AppProvider), // 零参 loader 形态
  ]
  ```

  它与 `globalComponents`（消费方全局注册，解决模板字符串标签解析）是**两件不同的事、不能互相替代**；全局 CSS/主题样式随构建产物走，也不由 Provider 承担。仅手动 `loadRemote` / `useLoadRemote`（拿到模块自行渲染）不自动应用——这类消费在 JSX/模板里自己包 Provider。

- **自定义指令也需要消费方注册**：`globalComponents` 只注册组件，不复制提供方的 `app.directive(...)`。远程模板使用权限等指令时，在消费方应用初始化阶段注册同一实现，或由统一的 Provider 装配；同名指令冲突应明确处理，不能用空指令跳过权限。

- **状态管理也属于消费方上下文**：远程组件调用的 Pinia store 若沿用消费方注入，可能命中消费方的同名 store。需要提供方自己的状态时，显式传入提供方 Pinia 实例；不要依赖全局当前实例。需要独立路由、store 和应用生命周期的整个页面应用，使用 [子应用桥接](app-bridge.md)。

**错误处理范围**：Vue remoteComponent 的 errorComponent 处理模块/初始化/Provider 加载失败。远程组件**子树内部**的 setup/render/嵌套异步组件错误默认不改变传播语义（仍由业务 onErrorCaptured/app.config.errorHandler 处理），但插件在组件边界**观测上报**：`fulgurjs:error` 事件与 `onRemoteError` hook 收到 `MFU-020`（`details.phase='render'`，原始异常保留在 `cause`）——错误被业务 handler 吞掉导致区域空白时仍有事件可查。需要就地展示与恢复时，为 remoteComponent/createHostPages 传 `renderErrorComponent`（收到 `error`/`retry` props；接管后错误不再向全局传播，retry 重新挂载远程组件）。事件处理器或任意异步回调中的异常仍不归插件观测。React remoteComponent 自带组件子树渲染错误边界（同样上报 MFU-020），但不捕获事件处理器或任意异步回调异常。完整应用桥接的宿主错误边界也不覆盖另一 root 的内部错误。同一错误对象跨边界（运行时抛出 → UI 占位）只报告一次；每次新的加载/渲染尝试各自可见。

### 已有项目复用原组件注册源

#### 为什么必须检查内部控件，而不只看表单是否出现

Vue 的全局组件注册表属于 **app 实例**，不属于浏览器窗口，也不属于共享的 Vue 包。设管理宿主创建 app A，桥接流程应用创建 app B，流程应用又加载管理宿主提供的表单：这个表单实际处于 **app B 的组件树**。即使 app A 已经执行 `app.component()` / `app.use()`，并且两个应用共享同一个 Vue，app B 也不会继承 app A 的注册表。

这会产生容易误判的“半正常”页面：局部导入的 Input、Form 正常显示，依赖全局标签的字典框、选人框、按钮或上传器却失效。下拉框的所有选项可能直接连成文字，按钮只剩标签文字，行列布局消失。此时接口可以成功、真实数据可以出现、CSS 可以加载成功，甚至没有异常抛给错误边界。**这些事实不能证明组件完整渲染。** 开发模式的 `Failed to resolve component` 是线索，生产构建可能没有同样的警告；不能用“控制台没有错误”代替实际控件检查。

需要逐层检查，是因为业务表单经常通过 schema/componentMap 选择组件，而字典、选人、上传等组件内部还会引用另一层全局标签。只扫描最外层 `.vue` 或看到 schema 中组件名已登记，仍然可能漏掉内部的 SelectOption、Button、Row/Col 等依赖。普通组件复用不运行提供方 main，所以这些依赖必须显式解决。

#### 第一步：列出渲染位置和真实依赖

在改接线前记录：

1. 谁创建实际消费方 app；独立运行与桥接重建是否创建不同 app。
2. expose 指向的原业务文件，以及它经 schema、动态组件和弹窗加载的内部控件。
3. 每个异常标签的来源：局部 import、现有全局注册函数、已有注册映射、祖先 inject，还是 CSS。
4. 真实注册名称及实现，包括 Select 的 Option/OptGroup 等子组件。注册父组件不等于调用它的 install，也不保证子组件已注册。
5. 原工程是否替换了库组件，例如自定义 AButton 的权限、图标、颜色或 loading 行为。修复时保留原实现，不能用库默认组件偷偷替代。

不要直接导入提供方 main 来补注册：main 可能创建第二个 app、安装路由、启动登录流程或执行 mount。也不要把整个 UI 库清单抄进 setup，或创建只为注册而存在的 Provider 包装。

#### 第二步：按依赖性质选择实现

| 实际情况 | 做法 |
|---|---|
| 原组件已有局部 import，或消费方已经注册同一实现 | 保留，不额外注册 |
| 原注册源已有组件映射 | 提供方 setup 将需要的映射导出为 globalComponents |
| 只有原 registerComponents(app) 函数，没有映射 | 在原注册模块中提取实际需要的映射，让原函数和远程 setup 共用；不要复制第二份组件清单 |
| 组件确实缺少祖先 inject/context | 复用真实 Provider，按 pageProviders 安装；注册与注入分别处理 |
| 必须调用已有注册函数，且本来就需要 Provider | 可在该 Provider 的 setup 取得实际消费方 app，幂等调用原函数；不要为注册专门制造 Provider |
| 已正确生成组件 DOM，只是颜色、宽度或布局不同 | 再检查所属 CSS、主题和容器样式；不要用 CSS 掩盖未解析的标签 |

以下是**已有注册源提取映射**的完整接线。示例假定项目已经使用 Ant Design Vue，已有 `src/components/registerComponents.ts` 和业务按钮 `src/components/BusinessButton.vue`；按真实工程替换，不创建假模块。清单只是示例控件的依赖，不是所有工程必抄的组件大全。

```ts
// src/components/registerComponents.ts：原注册源，同时服务独立入口和远程消费。
import type { App, Component } from 'vue'
import { Select, Row, Col } from 'ant-design-vue'
import BusinessButton from './BusinessButton.vue'

export const formComponents = {
  ASelect: Select,
  ASelectOption: Select.Option,
  ASelectOptGroup: Select.OptGroup,
  ARow: Row,
  ACol: Col,
  AButton: BusinessButton, // 保留项目原有按钮行为。
} satisfies Record<string, Component>

export function registerComponents(app: App) {
  for (const [name, component] of Object.entries(formComponents)) {
    app.component(name, component)
  }
  // 原有其他注册保持真实职责；上述同一批组件不再另维护一份清单。
}
```

```ts
// src/fulgurjs/setup.ts：仅声明所需注册，不启动提供方 app。
export { formComponents as globalComponents } from '../components/registerComponents'
```

```ts
// fulgurjs.config.ts：合并进已有配置，保留原 exposes/remotes/shared。
import type { FederationOptions } from '@fulgurjs/federation'
export default {
  name: 'admin',
  setup: './src/fulgurjs/setup.ts',
  exposes: { './business-form': './src/components/forms/BusinessForm.vue' },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

原独立入口继续调用原 `registerComponents(app)`，不再增加第二次启动。消费方仍使用 `remoteComponent('admin/business-form')`；它将 setup 的 globalComponents 注册到**当次实际消费方 app**。不需要把 UI 库改成 shared，也不需要安装一整套提供方应用。生成配置文件后必须真正接到 Vite 并重建提供方，不能只改源码却验证旧 dist。

globalComponents 的键是实际 Vue 注册名，值是组件实现或零参组件 loader；它不是 app.use 插件列表，不能传整个 UI 库插件代替组件。声明式注册可随每次远程加载向新 app 交付；不要使用容器级 `installed=true`，否则桥接卸载再建 app 后会漏注册。手动调用注册函数时，以实际 App 为键使用 WeakSet，并仅在成功后记入。

同名注册也要核对。消费方已有同名不同实现时先确定项目要求的归属，不能静默替换导致原有页面行为变化。组件注册不复制自定义指令、router、Pinia 实例或主题；这些依赖仍需分别核实。手动 `loadRemote` 后自行渲染的路径，也不能默认拥有 remoteComponent 的消费方注册交付行为。

#### 第三步：用实际控件验收，不能只检查页面壳

开发环境和生产构建分别验证，至少包括：

- 同一组件的原独立 URL 与远程 props 入口都显示真实数据，必填参数、只读状态和布局一致。
- 字典框是实际 combobox/select，选项在展开层中出现；不是把全部选项文字直接排在页面上。
- 选人控件的输入框、按钮和布局存在；允许编辑的测试模式中打开弹窗并取消，不能为了验证向后端保存。只读模式确认实际按钮和输入均被禁用。
- 上传、富文本工具栏、schema 动态组件以及条件渲染后才出现的内部控件也检查；隐藏状态没有死标签不代表打开后正确。
- 离开再进入、桥接卸载后重新挂载，确认新 app 仍能解析这些组件；也检查消费方原有同名控件没有被破坏。
- 页面实际 DOM 中不得残留本应由 Vue 解析的 `<a-select>`、`<a-select-option>`、`<a-button>` 等标签。可在浏览器检查下例，再结合控件结构/角色断言；真实 Web Components、SVG 和编辑器 iframe 按各自实现判断，不能把所有带连字符的标签一概判错。

```js
// 浏览器 DOM 诊断示例：只针对本项目已知应由 Vue 解析的标签。
const unresolved = [...document.querySelectorAll(
  'a-select,a-select-option,a-select-opt-group,a-button,a-row,a-col'
)]
console.table(unresolved.map(el => ({ tag: el.tagName, text: el.textContent })))
```

将检查结果、实际控件截图、生产构建身份、重新挂载结果与注册源路径一起交付。仅“HTTP 200”“CSS 已加载”“表单输入框数量正确”“没有 MFU 错误”或“截图里有数据”均不足以判定通过。发现死标签先修注册；不要先补 CSS、盲加 Provider、重复挂载整个 app，或把组件占位文本当成无样式控件。

主题也应复用原配置：独立根组件的字体、文字色、圆角和主题色由同一配置源提供。Provider 不隔离 CSS，联邦直渲染共享 DOM；若组件结构已正确但颜色变淡，检查实际选择器、color、-webkit-text-fill-color 及禁用态。将样式修复限制在所属组件范围，不全局覆盖或堆叠 !important。

**React**（`@fulgurjs/federation/react`）：

```tsx
import { remoteComponent } from '@fulgurjs/federation/react'

// props 从提供方自动生成并同步的声明推导，不在宿主重写一份接口。
const RemotePanel = remoteComponent('remote-a/Panel', {
  fallback: <Spinner />,                     // pending 占位（默认 null）
  error: (err, retry) => <ErrorBox error={err} onRetry={retry} />,  // 或传 ReactNode
  retries: 2,
  timeout: 15000,
})

export default function Page() {
  return <RemotePanel title="详情" />
}
```

React 版要点：

- 工厂与页面表声明**零加载副作用**，首次渲染才 `loadRemote`；最简用法无需手写 Suspense/`React.lazy`；
- **不用 `React.lazy`**：lazy 会缓存失败的 Promise，仅重置错误边界无法恢复；本实现的 retry 重建加载尝试（已成功模块走运行时缓存不重复下载）；
- 内置 pending 占位、错误占位与错误边界；加载失败与渲染出错**分开记录与展示**（文案区分「加载失败」与「渲染出错」）；
- 失败恢复穿透浏览器 ESM 失败缓存：对入口 URL 与容器 expose loader 在失败后的重试上变更 URL（`fulgurjs_retry=N`）；并发失败只推进一个重试代次；
- **已知边界**：expose 的静态依赖 chunk 失败后同页重试不可恢复（浏览器 module map 缓存了该依赖 URL 的失败），需整页刷新——默认占位的「刷新页面重试」就是这条路径（仅用户点击，永不自动刷新）；
- **Context 不跨提供方根部**：与 Vue 同理，提供方 app 根部创建的 React Context 在消费方树里不可见；依赖 Context 的暴露面推荐在 setup.pageProviders 声明本框架 Provider，由 remoteComponent/createReactHostPages 包装；也可在暴露入口自带 Provider，但两者选一，避免重复装配。消费方祖先 Provider 只有使用同一个 Context 对象时才能生效，不能跨不同 renderer/版本传 Context。

完整可运行示例：模板 [vue-vue](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/vue-vue) / [react-react](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/react-react) 的宿主首页。

### 方式二：`loadRemote` — 命令式加载（任意框架/纯 TS）

```ts
// Vue：@fulgurjs/federation/vue ｜ React：@fulgurjs/federation/react ｜ 纯 TS：@fulgurjs/federation/runtime
import { loadRemote } from '@fulgurjs/federation/runtime'

const { formatMoney } = await loadRemote('remote-a/money')     // 函数模块
const mod = await loadRemote('remote-a/Panel')                  // 组件模块（.default ?? 模块本身）
```

选项（全部可选）：

```ts
const Panel = await loadRemote('shop/Panel', {
  shareScope: 'default',       // 覆盖远程声明的 shareScope
  retries: 3,                  // 单次调用覆盖 remote.retries
  fallbackModule: () => import('./PanelFallback'),   // 失败时返回兜底模块（显式声明的行为：
                               // 错误事件/console 仍发出，不是静默兜底；不传则抛错）
})
```

远程配置了 `setup` 时，`loadRemote('remote/模块')` 是初始化生命周期的统一触发入口（见 [API 参考 · setup/onSession](../reference/api.md#setuponsession-远程初始化生命周期)）；`loadRemote('remote')` 只取容器不执行初始化。

### 方式三：`useLoadRemote` — React Hook

```tsx
import { useLoadRemote } from '@fulgurjs/federation/react'

const { data, error, loading, reload } = useLoadRemote<Utils>('remote-react/utils')
// data: Module | undefined；error 无错时恒为 undefined
// options 透传 shareScope / retries / fallbackModule（配置 fallbackModule 是显式声明：失败返回兜底值而非写 error）
```

语义：

- 按字段比较依赖——调用方每次 render 新建 options 对象不会无限重载；spec/选项变化时清理旧数据进入新请求；
- 每轮 effect 与 `reload` 有独立代次：快速 A→B、慢请求晚返回、连续 reload、卸载后返回、StrictMode 双 effect 都只允许最新有效请求写状态；
- `reload()` 开始时清空旧 data/error 并置 loading；卸载作废未完成请求，卸载后调用已保存的 reload 不发起请求；
- `AppContext` 不是 React 状态订阅：宿主读到新的非空 `sessionKey` 时由宿主自身状态/路由触发重渲染。

## `RemoteErrorBoundary` — React 页面级兜底边界

```tsx
import { RemoteErrorBoundary } from '@fulgurjs/federation/react'

<RemoteErrorBoundary
  fallback={({ error, reset }) => <ErrorBox error={error} onRetry={reset} />}
  onError={(error, info) => report(error)}
  resetKeys={[retryEpoch]}      // 任一变化重置边界状态
>
  <RemotePanel title="详情" />
</RemoteErrorBoundary>
```

- `reset` 只重置边界状态；子树若持有失败缓存（如外部 `React.lazy`）需调用方重建加载尝试——插件自带 `remoteComponent` 的重试已完成两者；
- 内置 `remoteComponent` 的错误边界已消费自身错误，外层 `RemoteErrorBoundary` 看不到内层已处理异常；想改某远程组件的占位请用该组件自己的 `error` 选项；
- 不捕获事件处理器与异步回调异常（遵循 React 自身语义）。

Vue 侧无独立边界组件：`remoteComponent` 的内置错误占位 + `errorComponent` 选项承担同一职责。

## 远程类型（自动同步）

生成的 `.d.ts` 供编辑器和 TypeScript 使用，不是运行模块。若业务用 `import.meta.glob` 扫描所有 `.ts` 文件，必须排除声明文件，例如 `import.meta.glob(["./**/*.ts", "!./**/*.d.ts"])`；组件/工具注册器也应排除应用启动及联邦装配文件。

类型位置的 `typeof import(...)` 和 `import("vue").DefineComponent` 只用于类型检查，不会加载远程。值表达式中的 `typeof import(...)` 则会真正发起加载；`import(...)` 返回 Promise，取模块内容应使用 `await`。

想直接体验补全和错误检查？打开 [Vue 模板的类型演示](../../../examples/templates/vue-vue/README.md#体验远程类型提示与错误检查)：浏览器显示真实函数结果和远程组件，`host/src/fulgurjs/host/type-demo.ts` 提供五条不执行的错误示例，`typecheck` 验证这些错误确实被拒绝。

`dts` 默认开启：提供方随 dev/build 产出**可分发声明资源**（不依赖远程源码在宿主机器上），宿主 dev 自动同步到 `src/fulgurjs/types/`（无 src 布局回退 `.fulgurjs/types`），src 布局项目 tsconfig 零配置生效：

```ts
// 宿主里直接以 '远程名/X' 形态导入获得类型（普通 import 与 import() 同源）
import UserBadge from 'remote-a/shared/user-badge'
// 字符串 API 同样检查：拼错入口在调用点报错；动态变量放行（unknown 边界）
const mod = await loadRemote('remote-a/shared/user-badge')
```

- 普通模块、Vue/React 组件 props、桥接 `appProps` 都来自远程真实声明（vue-tsc/TypeScript 官方工具链产出，非宽松占位）；
- 宿主不需要手工 tsconfig `paths`，也不需要远程源码或软链接；跨机器联调同样工作；
- 提供方源码修改后会自动更新声明；生成器的临时配置和宿主下载的声明不会反过来触发生成。临时配置在本次生成结束或中止后自动清理，无需加入项目或手工维护；
- 提供方重新启动、声明尚在编译时，会保留宿主已有的类型快照；新声明完成后自动替换。严格类型验收要等到同步成功，不能把旧快照当成本轮通过。
- 远程未提供类型（旧版本/`dts: false`）：页面正常运行，入口按动态边界放行（`unknown`）；严格类型检查在 CI 运行 `npx @fulgurjs/federation types`（详见 [CLI 参考](../reference/cli.md#fulgurjs-types)）；
- `dts: false` 完全关闭（不生成、不下载）；细节与已知限制见 [API 参考 · 远程类型](../reference/api.md#远程类型自动生成与同步)。

首次生成会沿暴露入口的依赖分析真实类型；两个入口也可能关联很多文件，所以耗时不能只按入口数量判断。生成器使用工具链支持的方式检查公开声明：支持按文件检查的工具只检查暴露闭包；使用 CLI 的工具在 dev 中复用该服务的增量缓存。修改 props 仍会重新检查；日志、截图、Markdown 不触发生成。缓存放在 `node_modules` 内并在 dev 服务关闭后清理，不需要配置或提交。一次性 build/CLI 使用独立输出。


## 远程页面里的运行时导入

exposes 目标文件（被宿主跨源加载的远程页面/组件）可以**直接静态导入**运行时 API——插件自动把该导入改写为惰性单例代理，宿主与远程写法完全一致：

```ts
// 远程页面内，与宿主页面写法完全一致
import { loadRemote } from '@fulgurjs/federation/runtime'
```

调试时 `(globalThis as any).__FULGURJS_RUNTIME__` 可直取页面级运行时单例（等价，仅特殊场景使用）。

## 错误与恢复速查

| 现象 | 错误码 | 处理 |
|---|---|---|
| 网络/超时/重试耗尽/熔断 | `MFU-001` | 检查 remote 地址与可用性；配置 `fallback` 备用入口或 `fallbackModule` |
| 自报名与配置名不一致 | `MFU-002` | 改 `remotes` 键或用 `'自报名@url'` 字符串写法对齐 |
| 请求模块未被 exposes | `MFU-006` | 核对 `远程名/exposes 键`（spec 不要重复加远程名前缀） |
| 未知远程 | `MFU-008` | 核对 `remotes` 键名与 spec 前缀一致 |
| 模块没有任何导出 | `MFU-009` | 检查 expose 目标文件的导出 |
| 组件渲染成功但字符串标签（如 `<a-divider>`）成死元素 | — | 远程在 setup 模块声明 `globalComponents`（`remoteComponent` 消费时自动安装），见 [API 参考 · setup/onSession](../reference/api.md#setuponsession-远程初始化生命周期) |
| 组件渲染成功但类名前缀变 `undefined-xxx` / 主题类缺失（inject 未命中） | — | 远程在 setup 模块声明 `pageProviders`（祖先 Provider 自动包裹），见上文 provide/inject 说明 |

完整错误码见[错误码总表](../reference/errors.md)；按症状排查见[排错目录](../troubleshooting/README.md)。
