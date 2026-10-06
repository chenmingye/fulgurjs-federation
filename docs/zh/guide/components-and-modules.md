# 组件与模块加载

> 加载一个远程组件或函数模块，不需要桥接、页面表或登录初始化——这是联邦的最小用法。对应 6.0.0 入口：Vue 从 `@fulgurjs/federation/vue` 导入，React 从 `@fulgurjs/federation/react` 导入，框架无关代码从 `@fulgurjs/federation/runtime` 导入。

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

键约定 `'./X'`（可省略 `./` 前缀，配置会规范化并提醒）；值是相对本项目根的源文件路径。只有作为「页面」接入宿主页面路由表时才要求独立页（从路由取参），普通组件无此要求。组件必填 props 应给默认值，否则构建期报 `BLD-003`。

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

- 内部等价 `defineAsyncComponent({ loader: () => loadRemote(spec, opts).then(m => m.default ?? m) })`，返回标准 Vue 异步组件；
- **零兜底**：加载失败显式进错误态；不传 `errorComponent` 时渲染内置占位（错误码 + 根因 + 修法 + 「重试加载 / 刷新页面重试」按钮），`window` 的 `fulgurjs:error` 事件照常发出；
- 同 spec 多组件实例共享 `loadRemote` 内部 Promise 缓存，容器模块只加载一次。
- **provide/inject 不跨提供方根部**：远程组件渲染在**消费方**的组件树里——提供方 app 根部（`App.vue` 等）的 `provide`（全局 `AppProvider`、prefixCls、主题、ConfigProvider 等）不会跟着组件走；消费方自己的祖先 provide 正常生效。暴露面依赖这类上下文时，在**暴露入口组件**内自 provide（单一来源，如把 `AppProvider` 包进暴露组件模板根），不要要求每个宿主重复注册。未命中 inject 的症状是取到默认空值（典型：类名前缀变成 `undefined-xxx`、主题类缺失）。

**React**（`@fulgurjs/federation/react`）：

```tsx
import { remoteComponent } from '@fulgurjs/federation/react'

type PanelProps = { title: string }
const RemotePanel = remoteComponent<PanelProps>('remote-a/Panel', {
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
- **Context 不跨提供方根部**：与 Vue 同理，提供方 app 根部创建的 React Context 在消费方树里不可见；依赖 Context 的暴露面在暴露入口组件内自带 Provider（单一来源）。

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

## 开发类型直连

`dts` 默认开启：dev 下插件拉取远程 manifest，为每个公开 expose 生成类型声明到 `src/fulgurjs/types/`（无 src 布局回退 `.fulgurjs/types`），src 布局项目 tsconfig 零配置生效：

```ts
// 宿主里直接以 '远程名/X' 形态导入获得类型
import UserBadge from 'remote-a/shared/user-badge'
```

- `mode: 'source'`（默认）：跨工程源码直连，补全/跳转直达远程源码；VSCode 打开生成物可能显示工程外文件诊断（仅编辑器显示问题，命令行检查与构建不受影响）；
- `mode: 'shim'`：宽松占位，IDE 干净但无源码级补全；
- 两种 mode 都要读取 remote 本机源码枚举导出名；`dts` 不是不可信 manifest 的安全边界，只对可信来源开启；
- 远程源码不可访问（`devFsRoot: false` 或跨机器）：降级生成 `any` 声明（默认/具名/副作用导入均可解析，无精确类型）；`dts: false` 完全关闭；
- React expose（.tsx/.ts）与 Vue 共用同一套生成，另支持在宿主 tsconfig 配 `paths` 后获得源码级精确类型（见 [API 参考 · React 的 dev 类型](../reference/api.md#react-的-dev-类型)）。

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

完整 48 码见[错误码总表](../reference/errors.md)；按症状排查见[排错目录](../troubleshooting/README.md)。
