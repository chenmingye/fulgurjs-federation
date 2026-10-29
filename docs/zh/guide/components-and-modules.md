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

本地开发需要直接使用已部署的组件和类型时，见[本地开发消费已部署远程](#本地开发消费已部署远程)：`dev` 可指向生产入口，但必须填写完整 `.js` 地址。

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

消费端无需按生成目录路径导入 `.d.ts`。类型目录被 tsconfig 包含后，`remoteComponent` 会自动获得组件 props/events；需要给本地参数状态标注类型时，**优先从远程组件入口直接导入提供方公开的具名业务类型**：

```ts
import { ref } from 'vue'
import { remoteComponent } from '@fulgurjs/federation/vue'
import type { BusinessFormParams } from 'admin/business-form'

const BusinessForm = remoteComponent('admin/business-form')
const params = ref<BusinessFormParams>()
```

消费方不需要 `VisibleFields`、`NonNullable`、`InstanceType` 或另一份 DTO。这个 `import type` 在编译时擦除，不会额外加载远程 JS。提供方只定义一次合同并将它公开；生成器保留原生具名类型导出，消费方同步后直接使用。完整提供方写法和字段负例见[下方示例](#嵌套-params-也必须检查内部字段)。

提供方没有公开业务类型、只需要通用组件 props 推导时，仍可用公开工具 `FgVueRemoteProps<'admin/business-form'>`。它用于提取合同，不负责改变组件标签的悬停表示；不要把多层工具组合当作每个业务页面的必写接线。

这不是维护第二份接口。已知业务字段不应重新声明为宽泛对象或 any；真正开放扩展的数据可单列扩展字段。类型验收需要同时验证错误字段类型和缺少必填字段会失败，不能只测试“整个参数传字符串报错”。

组件参数变化是否重新查询由业务组件负责；离页取消定时器和迟到回写。共享 Vue/Pinia 包不等于共享业务状态，状态归属见[状态绑定](existing-apps.md#pinia库单例与业务实例分别管理)。Provider 也不隔离 CSS，视觉验收比较真实数据、回显完成后的标签、只读与布局。

#### 从提供方到实际 IDE 的完整接入与验收顺序

本流程适用于需要生成类型的 Vue 远程组件接入和复验。**提供方字段正确、类型资源已更新、消费方检查正确、实际 IDE 提示可读，是四件不同的事；缺一项不能合并写成“类型完成”。** 不要只改消费方，也不要仅凭文件存在或 CLI 退出0判定完成。

1. **核对提供方合同和真实 expose。** 从配置追到原 SFC，读取 defineProps、命名接口、事件、插槽和公开实例；已知 params 字段不得使用 any/宽字典。原 URL 的字符串在入口转换成业务值，远程调用不从宿主 URL 猜字段。不要创建纯转发壳或第二份 DTO。
2. **核对双方实际安装的正式包。** 查看各应用 package.json、锁文件和从各应用目录实际解析的包；不要只读仓库源码版本。使用当前正式能力，不把本地源码包、node_modules覆盖或某次旧版本当成正式验证。
3. **让提供方真正发布新类型资源。** 开发环境启动真实提供方服务，确认其类型生成成功；生产环境运行提供方原构建命令，把对应 dist 的 manifest、类型索引和声明文件随同产物部署。`fulgurjs types` 的 provider 阶段是生成验证，**不会替你重建/部署生产 dist，也不会把刚验证的新声明写入已部署站点**。仅运行这个命令后继续下载旧站点，仍会得到旧声明。
4. **检查实际 HTTP 资源。** 从提供方当前 manifest.types.index 读取索引，而不是猜路径；核对 revision、生成包版本和入口声明。对可识别的具体 SFC，应看到命名接口继承原始组件声明。原 DefineComponent 长签名仍保留是正确行为，不能为了“文件中不再有泛型”把继承源删掉。高级包装未识别时按限制保留，不能伪装已完成该类组件的展示优化。
5. **在消费方目录同步。** 用项目自身包管理器执行类型同步。下面示例的 origin 必须替换为实际站点，prod remotes 为相对地址时需要它：

   ```bash
   pnpm exec fulgurjs types --mode prod --base https://portal.example.com
   ```

   开发环境按真实 dev 配置执行。同步后核对 metadata 的来源/revision与实际提供方一致，确认 tsconfig 覆盖生成目录、同一物理插件注册表被使用；不手改 modules.d.ts/registry.d.ts。
6. **直接消费公开合同并检查两种展示。** remoteComponent 保留真实组件类型；本地参数优先 import type 提供方公开的具名合同，直接 ref<业务类型>()。提供方已有命名接口时应从原 SFC 重新导出同一类型，不让消费页面各写映射/多层提取或复制 DTO。只改导入语法不代表 IDE 已改善，仍分别检查组件标签和参数/字段；对适用的数据合同，类型名和变量悬停都必须实际出现字段。
7. **运行实际项目的正反例。** 必须覆盖嵌套字段缺必填、错字段、错标量和联合值；带 expect-error 通过后，去指令确认真实诊断。改到组件表示时还要检查事件、slots、ref/expose。不把错误检查器、OOM或全局回退记成通过；历史错误分开记录。
8. **检查用户实际 IDE。** 分别悬停模板组件标签、`:params` 属性、参数值和字段，检查补全、说明与跳转。以真实 Vue 模板效果留图；普通 TS quickInfo、vue-tsc退出0、生成文件截图均不能替代。升级后若 CLI 正常但 IDE 的静态入口退回空 props，按下文核对解析并刷新 Vue/TS 服务，不接受回退形态作为“提示变短”。
9. **回归实际页面并交付四类证据。** 真实数据、只读、内部控件和离页重进按影响检查；报告分别列出提供方合同、在线资源版本/revision、正反例结果、IDE截图。前一轮/候选包证据不得改名成最终正式包验证。

| 观察结果 | 判定与下一步 |
|---|---|
| dts:false 时命令退出0 | 类型支持已主动关闭，不是类型验收通过；当前目标要求类型时不能按关闭状态交付 |
| 提供方 params 为宽字典，但 types 命令成功 | 合同不合格；先修提供方，不补消费方 DTO |
| 仅升级消费方，线上提供方声明仍是旧 revision | 新生成能力未交付；重建/部署提供方后再同步 |
| 仅把 InstanceType 改成 FgVueRemoteProps | 只证明提取入口调整；继续检查实际展示和字段约束 |
| 静态已登记入口显示空 props / unknown 回退 | 类型注册链未就绪；不是优化成功 |
| 具体可识别 SFC 仍长展开，只增加了注释 | 本任务的命名展示尚未验收；查提供方产物、同步和 IDE 解析，不用旧兜底降级 |
| 参数名存在，但用户要求直接读字段而仍无法看到字段 | 字段可读性未完成；核对字段视图及实际悬停位置 |
| 没有实际 IDE 证据，仅有终端检查 | IDE 结果未验证；如有工具/锁屏阻塞如实标记，不能PASS |
| 文件仍保留原 DefineComponent，悬停已显示名称且约束完整 | 正常；保留原签名是保真的依据，不删除 |

#### 嵌套 params 也必须检查内部字段

当原页面接收一个 params 对象时，公开的业务参数类型与 `defineProps` 必须是同一合同，不能只给整个对象宽泛类型。下面直接在原 SFC 声明并导出，无需额外包装组件或转发文件：

```vue
<!-- 提供方原 BusinessForm.vue；普通 script 管模块级类型导出。 -->
<script lang="ts">
/** 表单业务参数：使用已有单据和已发布的 schema。 */
export interface BusinessFormParams {
  /** 业务单据编号 */
  id: string
  /** 已发布 schema 编号 */
  formId: string
  /** 详情只读；不是 URL 的字符串 */
  disabled?: boolean
}
</script>
<script setup lang="ts">
// 原 URL 入口保留时根 params 可选，传入时字段仍受约束。
defineProps<{ params?: BusinessFormParams }>()
</script>
```

如果合同已在原业务 `.ts` 文件定义，**不移动或复制字段**：在原 SFC 的普通 `<script lang="ts">` 中写 `export type { BusinessFormParams } from './原合同模块'`；在 setup 中继续 `import type` 同一个类型供 defineProps 使用。`<script setup>` 不允许直接写模块 export，类型公开放在普通 script 中。已有普通 script 时合并进去，不再新增第二个普通 script。只公开约定的业务类型，不将内部实现类型全部暴露。

```ts
// 消费方：导入远程公开类型后直接使用。
import { ref } from 'vue'
import { remoteComponent } from '@fulgurjs/federation/vue'
import type { BusinessFormParams } from 'admin/business-form'
const BusinessForm = remoteComponent('admin/business-form')
const params = ref<BusinessFormParams>({ id: 'order-1', formId: 'schema-1', disabled: false })

// 放在实际包含同步声明的有效 TS 测试项目中：这些指令都必须命中真实错误。
// @ts-expect-error 缺少必填 formId
const missing: BusinessFormParams = { id: 'order-1' }
// @ts-expect-error disabled 是 boolean，不能沿用 URL 的字符串
const wrongType: BusinessFormParams = { id: 'order-1', formId: 'schema-1', disabled: 'false' }
// @ts-expect-error 字段拼错不能静默进入宽字典
const typo: BusinessFormParams = { id: 'order-1', formId: 'schema-1', disabeld: true }
```

公开类型不会凭业务名自动产生：提供方必须有对应的原生 `export interface` / `export type`。组件 expose 目标不变，默认组件导出与具名类型导出共用同一个远程入口；插件负责生成声明和同步，而不是让业务维护手写 `.d.ts`。缺少类型导出时先修提供方，不在消费方补同名 ambient 占位。开发等待自动生成同步；生产重新构建部署该提供方的类型资源，不能只改消费文件后继续读取旧站点。

验收时先运行带 expect-error 的正向项目（包括上述预期错误，且不得出现未使用指令），再临时去掉指令确认原始 TS 错误确实出现。只证明 params='text' 失败，仍可能放过 Record<string, unknown>。后端数据如果是 any，也要在赋值边界核对/转换真实字段，不能用 any、类型断言或重复 DTO 绕过约束。`fulgurjs types` 成功证明生成/同步链通过，不证明提供方业务合同准确。URL 参数在独立入口解析为字符串或布尔业务值；远程 props 不应重新从宿主 URL 猜同名字段。

#### 直接导入时，悬停也应能看到字段

消费方保持 `import type { BusinessFormParams } from 'admin/business-form'` 和 `ref<BusinessFormParams>()` 两行即可。**普通具名数据对象的字段视图由提供方生成器自动完成，不需要业务文件声明 VisibleFields、NonNullable 或另一份 DTO。** 生成器用提供方自己的 TypeScript 检查公开类型的真实形态，在声明中追加可展开视图；原合同与完整组件签名仍保留，运行时 JS 不变。

对于这种数据合同，实际 IDE 必须分别验证：

1. 悬停 `BusinessFormParams`：直接看到字段名、字段类型、必填/可选标记，以及继承来的字段，而不是只有一个接口名。
2. 悬停参数变量或模板中的参数值：能看到同一字段结构；Vue 的 Ref 外层可以保留，不能用“变量显示类型名”替代字段可读性。
3. 字段悬停、补全与类型检查：保留提供方 JSDoc、readonly、可选性、联合值与缺必填约束；字段更好看但错误输入不再拒绝，仍然失败。

示意（实际字段来自提供方，不手写到消费方）：

```text
悬停 BusinessFormParams 的期望信息（编辑器输出，不复制到业务代码）：
{
  id: string
  formId: string
  disabled?: boolean
}
```

只换成 import type、只证明能跳转定义、只显示合同名，不算这类字段展示已经完成。仍要在用户实际 Vue 模板/编辑器中取证；普通 TS quickInfo 是回归层，不能替代 GUI 验收。

视图仅处理可确认的非泛型数据对象。泛型、联合、数组/元组、可调用/可构造类型、类或私有品牌、多态 this、方法/访问器等保留原声明，避免压平后丢失签名或身份；不要为追求短提示强制转换这些高级合同。数据字段内的函数、数组或嵌套对象类型不递归改写。

这是**提供方声明生成**能力：提供方使用当前插件后，dev 会生成新资源，生产必须重新构建并部署 manifest、索引及声明；消费方同步新 revision 才能获得展示。仅升级消费方却继续下载旧声明，不能产生新字段视图，也不能手改生成缓存充当修复。

#### 组件悬停名称与业务字段是两个层次

提供方类型生成会为直接 expose 的具体 Vue SFC（官方声明为 `import("vue").DefineComponent<…>`）追加一个以 expose 命名的接口，例如 `ApprovalForm`。该接口继承完整原声明，不重建 `$props`，因此消费方组件名悬停可以显示 `ApprovalForm`，而不是展开全部框架泛型。原始签名仍留在声明闭包，事件、实例方法等沿原类型流动。

这不是手工维护第二份 DTO，也不是 `FgVueRemoteProps` 的效果。使用者无需加包装组件或改返回类型。提供方重新生成/发布类型资源，消费方同步后由 IDE 读取新声明；只升级消费方插件却继续下载旧类型资源，不会得到新展示。

查看业务字段时，悬停模板 `params`、具体赋值字段或跳转到提供方命名接口；字段注释在原接口维护。组件名提示和字段提示分别验证，不能用类型检查通过代替真实 IDE 效果。泛型函数组件、额外 slots 包装或其他未识别的高级声明保持原始表示，以保留其精确签名；不保证所有 Vue 组件或编辑器都显示相同短名称。多个 expose 指向同一声明时使用首次遇到的 expose 名称；同名标识符自动避让，不修改运行时组件名。

已登记的静态组件入口若在升级后显示 `DefineComponent<{}, {}, unknown>`，这是未命中真实注册表的回退，不是命名展示修复成功。先核对生成声明是否被 tsconfig 包含、metadata 来源/revision及 IDE 实际解析的插件物理路径；CLI 正确而 IDE 仍缓存旧依赖时，可执行命令面板的 `Vue: Restart Vue and TS servers` 后重新检查。不要通过删除类型、放宽合同或盲目重装来掩盖注册表失效。

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
- 提供方源码修改后会自动更新声明；生成器临时配置及同步过程中的逐文件写入不会触发源码 watcher 重生成；完整新代次同步成功后，对外提供类型的本地应用会重新检查一次。临时配置在本次生成结束或中止后自动清理，无需加入项目或手工维护；
- 提供方重新启动、声明尚在编译时，会保留宿主已有的类型快照；新声明完成后自动替换。严格类型验收要等到同步成功，不能把旧快照当成本轮通过。
- 远程未提供类型（旧版本/`dts: false`）：页面正常运行，入口按动态边界放行（`unknown`）；严格类型检查在 CI 运行 `npx @fulgurjs/federation types`（详见 [CLI 参考](../reference/cli.md#fulgurjs-types)）；
- `dts: false` 完全关闭（不生成、不下载）；细节与已知限制见 [API 参考 · 远程类型](../reference/api.md#远程类型自动生成与同步)。

### 本地开发消费已部署远程

**消费方在本地运行 dev、提供方使用已部署的生产构建时，组件与类型都可以来自这个已部署站点。** “不同电脑”是指消费方不必拥有提供方的源码或本地文件：只要能访问远程资源，就能加载模块并同步类型。插件不会因为消费方运行 dev，就要求提供方也运行 Vite dev server。

#### 1. 为消费方指定真正要使用的入口

`remotes.<别名>.dev` 是**消费方运行开发服务时选择的地址**；`prod` 是消费方生产构建选择的地址。字段名不限制目标站点属于开发、测试还是生产环境。插件按配置取地址，不自动寻找生产站点，也不会自动选择提供方的本地源码。

```ts
// 消费方 fulgurjs.config.ts：合并到已有配置，不覆盖其他 remotes/exposes。
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'workflow',
  remotes: {
    admin: {
      // 本地启动 workflow 时，直接使用已经部署的 admin。
      dev: 'https://assets.example.com/admin/fulgurjs-remoteEntry.js',
      // workflow 生产构建也使用这个站点；需要其他目标时改成真实入口。
      prod: 'https://assets.example.com/admin/fulgurjs-remoteEntry.js',
    },
  },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

将域名、base 和入口文件名换成提供方真实值；双方仍需完成各自 Vite 配置中的 `federation(fulgurjsConfig)` 接线，不能只创建配置文件。React 项目沿用自己的共享依赖配置，上例的 Vue 配置不直接套用于 React。

**消费已部署远程时，dev 中写完整的入口 `.js` URL。** 例如 `https://assets.example.com/admin` 是目录地址，插件在 dev 中会将它补成 `/admin/@fulgurjs-entry.js`，这是开发服务端点；普通静态生产站点没有这个端点。写完整的 `/admin/fulgurjs-remoteEntry.js` 才会原样使用生产入口。入口自定义了 `filename` 时使用实际文件名。

`dev` 与 `prod` 不互相回落。只配置 `dev` 不代表消费方生产构建也有可用地址；两者省略时只分别回落 `external`。完整规则见[配置参考](../reference/configuration.md#remotes-的四种形态)。

#### 2. 模块和类型分别由谁读取

| 资源 | 使用者 | 本例地址 / 本地位置 |
|---|---|---|
| 远程 JS 入口及其 JS/CSS 依赖 | 浏览器，在页面实际加载远程模块时使用 | `https://assets.example.com/admin/fulgurjs-remoteEntry.js` 及其引用资源 |
| manifest | 消费方开发进程中的类型同步器 | 同目录的 `https://assets.example.com/admin/fulgurjs-manifest.json` |
| 类型索引和声明 | 类型同步器按 manifest.types 下载并校验 | 本例通常为 `/admin/fulgurjs-types/index.json` 及索引登记的声明，实际以 manifest 为准 |
| 合并声明与入口注册 | 本地 IDE、TypeScript/vue-tsc | 默认 `src/fulgurjs/types/admin/modules.d.ts`、`registry.d.ts`；`metadata.json` 记录同步代次 |

`.d.ts` 随提供方 dist 部署，是供消费方开发工具下载的资源，不是浏览器执行的代码；类型同步不需要先打开远程页面。消费方无需下载提供方源码或完整 node_modules，也不需要把声明复制进业务文件。

#### 3. 提供方部署与消费方启动步骤

1. 提供方保留 `dts` 默认开启，确保公开入口准确声明 props/事件或模块签名，运行正常生产构建。
2. 将同次构建的 JS、CSS、`fulgurjs-manifest.json` 和 `fulgurjs-types/` 一起部署。`index.json` 登记的声明必须全部可访问；只部署 JS 可能让页面能运行却拿不到类型。仅执行提供方 `fulgurjs types` 验证生成，不会写入或更新已部署 dist。
3. 消费方按上例配置实际生产入口，保留消费侧 `dts` 开启，然后正常启动自己的开发环境。无需启动提供方开发服务，也无需为普通 dev 流程先手动执行类型生成命令。
4. 等待日志确认类型同步成功，检查生成目录被实际 tsconfig 包含，再在 IDE 中查看真实参数。类型同步在后台进行，不阻塞页面启动；页面能打开不等于类型已同步完毕。
5. 改动提供方接口后重新构建并部署。消费方 dev 轮询检测新 revision 后自动更新声明；还未部署的本地源码改动不会出现在消费方。浏览器中已加载的模块需要按实际缓存状态刷新页面，类型刷新本身不会热替换已运行的生产模块。

#### 4. 必须核对的条件与失败现象

- **两条网络路径分别可达**：浏览器能跨源加载 JS/CSS；消费方的 Node 开发进程能请求 manifest 与声明。静态资源需要登录或特殊网络访问时，必须确认开发进程也可访问；浏览器已经登录不代表类型同步器会继承浏览器 Cookie。
- **共享与业务上下文仍按原合同配置**：Vue/React 版本、共享作用域、Provider、认证和业务接口地址不会因“能下载类型”而自动正确。远程入口地址不会自动改写组件内部的后端 API 地址。
- **部署保持同批且可更新**：固定 manifest、类型索引及入口不应被长期旧缓存锁住，声明摘要必须与 manifest 的 revision 配套。不要手改 index/revision 或生成声明来消除错误。

| 现象 | 检查与处理 |
|---|---|
| 本地 dev 请求生产站点的 `@fulgurjs-entry.js` 并 404 | `dev` 填成了目录；改为完整的实际生产 `.js` 入口 |
| 页面正常，类型没有生成 / 同步 | 检查提供方 manifest 是否有 `types`、类型目录是否部署、双方 dts 是否开启，以及同步日志；不能把 unknown 回退当成精确类型成功 |
| 类型仍是旧字段 | 检查部署是否包含新声明及新 revision、同步是否成功；失败时旧快照会被保留，不能当作本轮最新结果 |
| 类型提示正确，但页面加载或渲染失败 | 分别检查浏览器错误、资源跨域、共享协商和组件运行环境；类型通过不证明运行时链路通过 |
| 线上类型已更新，本地修改却没反映出来 | 当前配置指向已部署站点，读取的就是已部署版本；要验证未部署源码，切换到对应提供方 dev 服务地址 |

消费方自己的生产构建/CI 仍按[严格类型同步流程](../reference/cli.md#fulgurjs-types)处理：先从目标站点同步再做类型检查，不能把普通 dev 的自动同步解释为所有构建模式都会自动下载类型。

消费/提供双角色应用直接导入上游具名类型时，首次编译可能早于同步；新的完整声明同步成功后会自动重新生成本地对外类型。只有实际同步了新代次才触发，未变化轮询和失败不会触发生成循环。

### 重启开发环境时复用类型缓存

提供方 dev 默认自动保存成功生成的声明资源，下次启动先校验输入和声明摘要。**源码、配置、依赖及工具均未变化且缓存完整时，直接恢复同一 revision，不再运行 vue-tsc/TypeScript 编译。** 普通启动无需先运行生成命令，也不需要新增缓存配置。

**Vite可访问和类型就绪是两个独立时刻。** 类型任务不会作为dev服务监听端口的前置条件，不能把“类型资源已生成”的时间冒充Vite启动时间；也不能用“页面已经打开”声称类型已经可用。IDE需要等待缓存命中或生成成功、以及消费方同步日志。

**类型任务由优先配置准备钩子启动，与Vite其余启动工作并行。** 这个独立钩子只准备类型，不调整共享依赖、别名或分包配置的合并顺序。后续core配置会核对root和公开exposes；变化时取消旧任务并重新建立。没有成功快照文件（首次启动或缓存被删）时直接进入生成；已有快照仍先校验，失效才重新生成，命中则不编译。冷路径会并行预载提供方编译工具和校验线程，预载不代表编译成功。build、preview和dts:false不会启动这些任务。

正常服务接管后，关闭和重启会释放自己的编译进程、线程与监听，middleware模式也相同。其他插件的配置失败可能使Vite根本没有创建服务，因此未被服务接管的预取最多保留60秒；普通CLI退出时子进程也会随IPC断开退出。这些机制无需使用者添加启动命令。

排查启动耗时时设置 `FG_DTS_TIMINGS=1`：生成成功日志会附带分阶段耗时，包括本服务（冷启动/缓存检查/生成/发布）、生成器父进程（配置、静态闭包、编译进程、展示整理、总计）和编译进程内部（配置、Program、全局诊断、静态闭包诊断、emit、输入记录）。这些数据只用于定位，默认不输出；它们与Vite ready时间是不同指标，不能相互替代。

现代Vue工具链支持官方Program能力时，隔离编译进程会记录它实际读入的源码、配置与依赖，缓存直接复用这份记录，**不会在冷编译之前再完整扫描一遍工程**。检查范围按下文的devCheck选择；完整路径检查静态闭包，只沿最终公开声明依赖emit，不先生成大量实现声明再丢弃。记录包含实际工具模块及逻辑链接，不遍历工具包无关测试、样例或其测试专用依赖。旧工具使用可用的保守路径；无法完整追踪输入时明确不保存持久缓存。

编译输入记录、摘要校验和压缩在隔离编译进程/Node后台线程完成，不把重型扫描放进Vite主线程。公开props、事件、slots、expose和返回值仍由提供方官方编译器推导，公开合同投影使用官方单文件声明能力，并在真实类型检查后分发；它与完整实现检查的范围区别见下文，不冒称已检查被移除的函数体和模板。

**同次编译的读取复用必须经过发布前校验。** 现代Vue路径可以在一轮内复用已经记录的文件、目录和链接读取，减少重复解析；Vue工具会写入的global-types和编译临时文件不复用。结果和诊断发布前都会重新核验真实输入、解析候选、链接及全局声明成员。输入变化时丢弃本轮结果并重检；无法建立或验证记录时，自动关闭读取复用，以普通读取重新完整编译，未验证结果不会对外提供。失败编译的记录只用于重检和监听外部依赖修复，不写入成功缓存。

支持相应官方TypeScript能力时，普通工具路径对第三方声明采用保留正确类型诊断所需JSDoc的解析模式。业务源码、JavaScript和SFC仍完整解析文档；公开字段说明和继承自库的字段文档需在消费方真实可读。自定义Vue编译扩展保留原解析方式。链接目标不会因跨轮读取旧结果而被忽略，缓存恢复和新一轮编译仍分别核验。

**开发中保存修改时也会复用内存程序。** 每个提供方dev服务独占一个隔离编译会话；未变化文件保留AST和Vue映射，变化文件重新读取和处理。每轮按所选范围真实检查，不直接沿用可能过期的诊断；被导入类型改变、全局声明改变、错误行号移动都必须重新反映到结果。编译选项、依赖结构或工具不适合继续复用时重建。超时、取消和关闭会终止自有进程，不留下后台编译。内存状态只属于当前dev服务，CLI/build不会复用它；改编译器依赖后仍应完全重启dev进程。

自动同步的modules.d.ts/registry.d.ts首行只记来源和revision，该行改变不代表类型合同改变，不再单独引发提供方重新编译。声明正文、字段类型、业务JSDoc及其余字节仍参与校验，不能以“都是注释”为理由忽略字段说明更新；输出类型包摘要仍使用完整内容。删除消费类型目录后若恢复的正文相同，也可以校验后恢复已有成功产物，而不是先跑一次编译。

**声明输出少，不代表编译输入少。** TypeScript还会跟进聚合导出、路由视图和引擎类型依赖。排查时同时记录程序输入数、静态闭包诊断数和最终分发数，再追踪实际导入链。纯类型消费优先引用同一合同的定义文件；聚合入口可以继续重导出它，不能复制第二份DTO。完整应用的路由装配与普通组件的字段合同应有明确边界；仅在调用方原本就接受通用懒加载合同、运行时仍加载相同模块时，才调整装配，且要复验真实路径、缺失错误、独立入口、深链和菜单。

引擎的副作用初始化与需要调用的API也可能有不同入口。只有库真实提供相应入口、保留原注册行为并确认API实例一致时才能使用；不得随意给组件或库写空声明来隐藏所需类型、全局增强或错误。插件不会自动修改用户的路由和第三方包。性能目标应在完整约束下验证，不能按文件数量硬裁程序。

缓存集中在项目 `node_modules/.cache/fulgurjs/types/` 的一个压缩快照文件中。它保存输入指纹和已生成声明，不是新增几百份业务类型，也不提交Git/SVN。停止 dev 会保留成功快照；每个服务独占的编译临时目录仍会释放，不在不同进程间共享可变的tsbuildinfo。

| 情况 | 行为 |
|---|---|
| 首次启动、缓存已删除或升级插件/工具 | 正常生成；支持的Vue工具直接复用真实编译输入记录建立快照 |
| 输入未变，关闭后重新启动 | 校验后恢复成功声明，日志明确显示“类型缓存命中”和校验耗时 |
| 源码、继承tsconfig、暴露入口、锁文件、依赖声明或链接目标变化 | 缓存失效，重新生成；目录新增成员和新出现的优先解析文件也会检查 |
| 缓存损坏、文件摘要不符、生成失败 | 不把旧产物当新成功；忽略坏缓存或保持失败诊断，正常生成成功后才写快照 |
| 缓存不可写 | 当前生成/页面服务继续工作，给出缓存写入提示；下次可能仍需编译 |
| 自定义Vue编译插件、外部模板等无法完整确定输入的工程 | 保守使用正常编译，不猜测可安全复用 |

校验基于文件内容及解析观察，不只比较mtime。同长度修改、include外的导入、JS/JSDoc外部类型、声明依赖及symlink变化都要失效。生成中输入发生变化时，该轮不持久化为成功缓存，而是排队重检；多个服务各用独占编译目录，通过原子替换发布成功快照。

**命中不是零耗时，也不是整个Vite启动速度的保证。** 校验仍需读取输入、计算摘要；项目越大，成本越高。首次冷生成和输入变化后仍可能花几十秒，Vite依赖预构建也有自己的耗时。分别测“冷生成”“跨进程恢复”“dev ready”和“消费方同步”，不能把页面出现或Vite缓存命中当成类型编译已跳过。性能验收还应在同一工程、相同依赖预构建状态下，对照dts关闭与默认开启的Vite ready/首个HTTP，单独记录类型就绪和编译器是否调用。不能用不同工程或不同预热状态拼出几秒启动结论。

想强制重新建立缓存，可删除上述缓存目录（或node_modules）后正常重启dev。删除消费方 `src/fulgurjs/types/` 是另一件事：dev会重新同步；提供方是否重新编译由其输入校验决定。消费方删除类型导致本地提供方缺上游类型时，等待自动同步及新代次重检，不能手写占位声明。

恢复只证明本地输入和成功快照匹配，不保证远端尚未同步的更新已获得。上游的新类型同步后仍会触发本地检查；严格CI/生产类型检查继续按前文运行生成/同步流程，build与CLI不复用dev成功快照。

### 类型依赖边界也会影响首次生成

`import type`只保证浏览器构建时擦除该引用；TypeScript为解析类型，仍会读取目标模块及其重导出。业务工具只需要一个表单类型，却从同时导出大量Vue组件的总入口导入时，类型程序可能连带载入无关组件、页面和UI库。把这些声明最后裁剪掉，不会追回已经花掉的解析和检查时间。

在业务工程内部，纯类型优先引用已有类型的原定义模块，保持同一个符号和字段合同。例如表格类型与表单类型互相引用时，指向实际types文件，不经会导入BasicForm及所有字段控件的组件入口。先查原入口如何重导出，确认定义相同，再修改引用并验证声明/诊断。不要复制一份DTO，不手写生成声明，不为一行转发另造空壳文件。第三方依赖仍遵守其公开exports；SDK继续从`@fulgurjs/federation`、`/vue`或`/react`公开入口导入。

```ts
// 业务工程内部：使用原有类型定义，不经包含组件实现的入口。
import type { FormSchema } from '../components/Form/types'
```

这种优化必须证明类型合同未变：比较修改前后公开声明及字段诊断，确认实际调用方无新增错误；首次、真实props改动、错误反馈和恢复分别测量。不能为了让数字变小删掉Provider、组件注册、初始化或类型检查。大型业务依赖图仍可能有真实的首轮编译成本，不承诺所有工程固定几秒。

### 为什么声明可能超过入口数量

插件先通过 TypeScript/vue-tsc 分析暴露入口和所需源码，保证推导正确；再从实际生成的入口声明出发，只分发公开类型引用到的声明文件。两者范围不同：组件实现里引用的表格、编辑器、请求工具，如果没有进入公开签名，其声明不会随类型包同步给消费方。externals 也只登记保留声明实际引用的外部包，避免要求宿主安装仅用于远程内部实现的依赖。

不会强制每个入口只生成一个文件。例如组件的 `params` 使用独立业务接口，类型包必须包含入口声明及该接口依赖；返回值推导、重导出、`import("./types")`、`import = require(...)`、声明副作用导入和 `reference path` 也可能让多个文件成为必要依赖。共享文件只保留一份，循环引用不会重复遍历。不要手工删除这些依赖，也不要用 `any`、`Record<string, unknown>` 或复制 DTO 来压缩数量。

这一步减少的是最终分发、下载及宿主读取的文件和字节数。官方编译器仍可能读取较多源码才能完成推导，所以文件数减少不能等比例换算成冷启动提速；首次生成仍需要等待编译结束。dev/build 自动应用同一规则，无需新增命令或配置；生产消费方的严格同步步骤仍按前文执行。

验收时分别记录入口数、`index.json.files` 文件数、类型包字节数、冷生成耗时及消费方同步耗时。类型检查必须包含真实 props/事件/实例的正例与反例；文件更少但字段消失、错误输入不再报错，均视为失败。不要只看构建成功或文件数。

首次生成会沿暴露入口的依赖分析真实类型；两个入口也可能关联很多文件，所以耗时不能只按入口数量判断。生成器使用工具链支持的方式检查公开声明：支持按文件检查的工具只检查暴露闭包；使用 CLI 的工具在 dev 中复用该服务的增量缓存。修改 props 仍会重新检查；日志、截图、Markdown 不触发生成。编译临时目录在 dev 服务关闭后清理；成功的声明产物另存于跨重启缓存，详见上节。一次性 build/CLI 始终使用独立输出，不用 dev 持久缓存代替严格生成验证。


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

### 开发期先生成公开合同，完整实现另行检查

`dts: true` 默认在 dev 使用公开合同检查。它解决的是：暴露一个表单时，不应仅因为其内部调用请求、路由或编辑器，就先分析整套应用才能提供 props 类型。该能力属于插件通用生成链，不要求修改业务路由、拆组件总入口、手写 DTO 或给第三方库打补丁。

插件在**隔离的类型编译读取视图**中提取合同；磁盘源码及 Vite 运行时转换不变：

- TS/TSX 先请求提供方 TypeScript 的 `transpileDeclaration`。只有官方单文件声明诊断允许独立生成时才使用其输出；需要跨文件推导返回值等情况保留源码，不能拿诊断伴随的 `any` 输出当成功结果。
- Vue 的非泛型 `<script setup lang="ts">` 保留公开合同依赖（显式props/事件、无props页面、字面量名称选项及可确认的暴露函数），移除与合同无关的实现和模板；最终组件声明仍由提供方官方 Vue Program 产生，不手拼 `DefineComponent`。具名类型导出与字段文档保留。字面量默认值保留；运行时props、解构默认值、复杂expose/model/slots/选项式或泛型组件、特殊编译扩展走原路径。快速路径的合同检查失败时自动回到完整源码生成，不发布近似类型。
- 合同引用的类型仍要解析和检查。引用大型库、全局声明或复杂推导时仍可能读取很多文件；不承诺所有工程都只读入口文件，或任何机器首次都低于固定秒数。

全局或模块类型增强应通过明确的副作用导入或工程ambient声明进入合同；这些显式增强不会作为无用导入删除。如果类型只在运行时装配的隐式环境中才成立，请使用`devCheck: "implementation"`，并在正式分发前确认增强也随公开声明交付，不能仅依赖提供方本机的环境。

**两种检查不能混淆：** dev 公开合同检查会拒绝缺失类型、错误类型引用等合同错误；它不检查被移除的函数体和模板业务表达式。比如组件的 `id: string` 参数仍精确，但模板误写 `id.toFixed()` 应由应用的 `vue-tsc --noEmit`/typecheck 检查。生成日志明确提示这一范围；类型清单及消费方 metadata 的 `check: "contract"` 记录该事实。类型生成成功、页面成功、业务实现检查通过是不同结论。

```ts
// 默认：自动开启，dev优先公开合同；无需额外生成命令。
federation({ name: 'provider', exposes: { './OrderForm': './src/OrderForm.vue' }, dts: true })

// 希望dev同时把完整静态实现错误作为类型分发门禁：
federation({ name: 'provider', exposes: { './OrderForm': './src/OrderForm.vue' },
  dts: { devCheck: 'implementation', dir: 'src/fulgurjs/types' } })

// 完全关闭提供与消费类型：
federation({ name: 'provider', dts: false })
```

`dts.devCheck` 类型为 `'contract' | 'implementation'`，默认 `'contract'`，只影响 dev 提供方生成。**生产 build 与 `fulgurjs types` 始终从真实源码检查完整静态闭包，不使用 dev 投影或成功快照绕过错误。** 正式发布前运行应用自己的 typecheck；应用全量检查范围比插件的 expose 静态闭包更大。

停止、重启、删除自动生成目录后的恢复仍是自动流程。成功缓存保留实际源输入校验，源码/类型/配置变化会失效；模式变化也隔离缓存，不能把公开合同检查命中说成完整实现检查通过。验证提速时用未改造的独立工程和大依赖图，比较合同精度与失败边界，不以某个业务工程的拆分成绩代替插件收益。


#### 桥接、暴露函数与旧版Vue工具

完整子应用的桥接模块也是公开合同。对于从本插件 `/vue` 或 `/react` 导入的 `defineBridgeApp`，投影从SDK真实签名取得返回类型；props取显式泛型、明确的工厂参数类型，或SDK原本的默认 `Record<string, unknown>`。不分析创建App/router的函数体，不把默认通用props伪造为业务DTO；陌生工厂、默认参数等无法确认的推导仍走原路径。具名别名导入也使用同一规则。

`defineOptions`只接受不会隐藏额外组件能力的字面量`name`/`inheritAttrs`。事件字符串数组保留原事件名和Vue原本的载荷类型。暴露的const函数、函数声明/重载与内联箭头函数，先由官方单文件声明生成确认签名。缺少返回注解时仅处理可证明的void落尾路径；有数据返回、可能never、可变值或流类型变化时回退，不能把Promise<never>/Promise<业务对象>改成Promise<void>。任意ref值、getter、展开对象和不明确的导入能力不猜测。

投影覆盖编译器实际读到的本地模块，包括ambient全局组件声明引入的页面，不只处理最外层expose。每次依据真实读取计算投影；同轮只复用同文本结果。父进程的旧准备文本不能覆盖之后的新源码。原文件、模板和样式仍由Vite正常执行。

模板与非CSS-module样式属于实现，类型视图会移除它们；CSS v-bind不再引用已被移除的实现变量。`noUnusedLocals`/`noUnusedParameters`也只在该投影视图关闭，因为其用途已经被擦除；原tsconfig不改，完整源码检查仍按原配置拒绝真正的unused错误，公开类型错误仍拒绝。不要把这两项配置复制到业务工程去绕过检查。

工具按提供方自己的版本工作：1.x原始Vue选项先用该版本官方默认值解析，不能把缺省lib误认成自定义编译器。1.x/2.x/3.x均记录实际编译输入，验证成功才持久缓存；无法追踪的扩展保守降级。测试矩阵使用真实旧版包，不靠改版本字符串模拟。

消费同步先在`node_modules/.cache/fulgurjs/types/sync`准备完整声明并原子切换，避免src里的半成品被自动组件/类型工具扫描而触发重复生成。临时缓存不可写或不同卷时使用同目录降级；失败保留上一代完整声明。清理仅处理已退出进程的自有临时目录，不删除另一个活跃实例的工作。

dev会在读取全局声明前观察其变更。自动导入/组件工具或源码在编译期间更新时，立即取消已失效的隔离编译，短暂合并写入后重跑；不等慢编译结束才发现旧输入，也不发布中间结果。只观察内容变化，正常取消不报TYP-001，关闭服务会释放自有观察器和进程。

所有临时tsconfig、编译输入和emit也放在`node_modules`的自有目录，不能放工程根，否则自动导入/组件工具可能把它们当成模块并不断改写全局声明。配置使用原tsconfig解析后的绝对路径；没有baseUrl时只转换paths目标，不新增baseUrl改变裸包解析。临时配置每次独占，用完清理；取消等待进程退出，不让旧清理删掉新任务文件。

自动声明工具重写相同内容时，编译器实际读入文本摘要与最终声明文件一致才允许时间戳变化；同轮读到不同文本、最终文本变化、普通源文件或工具代码的变化仍重检。该证明不能用文件名、mtime或“看起来相同”代替，不忽略真正的ABA窗口。
