# 共享依赖：singleton、版本裁决与作用域

> shared 让多个应用共用同一个依赖实例（如同一份 Vue/React 运行时、同一家 Pinia store），避免双实例崩溃与体积冗余。裁决语义对齐 webpack Module Federation。

## 基本用法

```ts
// fulgurjs.config.ts（宿主与远程各写各的；双方都声明同一键才会互通）
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'my-app',
  exposes: { /* ... */ },
  shared: {
    // 完整写法（SharedHint 全项见下）
    vue: {
      singleton: true,            // 全页单实例（vue/react/react-dom/pinia/vue-router 强烈建议 true）
      requiredVersion: '^3.4.0',  // semver 全语法；false = 接受任意；缺省从本应用 package.json 推断
      strictVersion: false,       // 缺省：有本地副本且非 singleton → true（不满足即抛 MFU-003）
    },
    // 字符串简写：等价 { requiredVersion: '^4.4.5' }
    'vue-router': '^4.4.5',
    // 数组形式：shared: ['vue', 'pinia'] —— 每项等价 requiredVersion 从 package.json 推断
  },
} satisfies FederationOptions
```

原则：**只列「项目实际安装且跨应用共享」的库**。不要把业务库（组件库/dayjs 等）放 shared——插件会在预构建与构建期自动处理其内部对 shared 键的引用。独立 Router/store 的完整子应用隔离设计是合法的——不是所有共享项都必须 singleton。

## SharedHint 全部字段

| 字段 | 类型 | 默认 | 语义 |
|---|---|---|---|
| `singleton` | `boolean` | `false` | 只允许单实例：收敛到同一实例（「已加载优先」）。跨应用需要同实例响应性/Hooks/renderer 的库必须 true |
| `requiredVersion` | `string \| false` | 从本应用 package.json 依赖推断；推断不了降为 `false`（接受任意版本并提醒） | 期望版本范围，完整 semver 语法。`false` 显式接受任意 |
| `strictVersion` | `boolean` | **省略时**：有本地副本（`import !== false`）且非 singleton → `true`；其余 `false` | true 时版本不满足 requiredVersion 即抛 `MFU-003`（fail fast）。显式 `false` = 不满足也不抛（singleton 下通常配 false，靠 MFU-010 告警） |
| `shareKey` | `string` | 配置键（去尾部 `/`） | 在共享作用域里的键；导入名与共享名不同时用 |
| `shareScope` | `string` | 顶层 `shareScope`（默认 `'default'`） | 该项归属的共享分组 |
| `eager` | `boolean` | `false` | true = 本地副本打进初始 chunk（同步可用，常驻下载代价） |
| `import` | `string \| false` | 配置键 | 本地副本模块路径；**`false` = 纯消费不提供**（只消费别人的版本，没有本地 fallback）。与 `eager` 互斥（CFG-008） |
| `version` | `string` | 读本机 node_modules 实际安装版本 | 显式提供版本（极少需要；读本不到安装版本时按 `0.0.0` 注册并提醒） |
| `packageName` | `string` | 配置键 | 用于从 package.json 推断 requiredVersion 的包名（本地别名安装时用） |

省略 vs 显式值的关键差异：

- `requiredVersion` **省略** ≠ 接受任意——优先从 package.json 的 dependencies/optionalDependencies/peerDependencies/devDependencies 推断；只有推断不到才退为 `false` 并发警告；
- `strictVersion` **省略**的默认随 `import`/`singleton` 组合变化（见上表），不是恒 false；
- `import: false` 与 `eager: true` 同时写 = 配置错误 `CFG-008`；同一 `shareKey + shareScope` 重复声明 = `CFG-008`。

## 版本裁决规则

1. **满足 requiredVersion 的最高版本胜出**；多个候选版本本身不是错误（`^2.1.7` 包含 `2.3.1`，不能仅凭两个版本号不同判定不兼容）；
2. **已加载版本永不替换**——第一个被加载的实例在场时，后续请求协商到它；
3. **singleton 收敛到唯一实例**——全员拿到同一家，无论谁先加载；
4. `strictVersion` 冲突抛 `MFU-003`；
5. `MFU-010` 仅在**最终选中的单例版本不满足某个消费方的 requiredVersion** 时告警：列出候选版本、实际提供方、影响与修法；同一版本组合只提示一次。

加载顺序（dev 与 prod 一致）：应用/容器初始化时插件生成的 init 模块调用 `initSharing(shareScope)` 建作用域并把各 `shared` 键经 `registerShare` 登记；随后业务代码里对该键的导入被改写为经 `loadShare` 协商——同步消费者拿已就绪/同步可用的实例，异步消费者等待协商结果。`initSharing`/`registerShare` 一般由 init 模块自动完成，手工调用只用于自定义运行时。

## 同步与异步裁决

- **默认（无 runtimePlugins）**：HTML 入口在执行应用前完成共享准备；远程容器在执行 expose 前完成裁决；同步门面复用同一决策。
- **配置 `runtimePlugins` 且 hook 是异步的**：配置了 runtimePlugins 的 HTML 入口在执行应用前完成共享裁决与加载；远程容器也在执行 expose 前完成异步裁决。异步 hook 可以选择低版本或原表之外的条目，不会被本地副本覆盖。应用与 provider 之间保留动态导入边界，Vite 8 的消费方门面仍无 TLA。
- **入口边界**：没有 HTML 入口的 library/自定义入口，或应用运行后才 `registerPlugins` 更改策略，需要先 `await loadShare(name, opts)`，再动态导入新的消费者；已经求值的静态绑定无法追溯改写。未准备的同步消费者遇到异步 hook 报 `MFU-004`（`details.syncUnsupported: true`）；`strictVersion` 冲突报 `MFU-003`。

## shareScope：分组隔离（React 18/19 同页隔离）

不同 shareScope 是互不干预的共享分组，各组独立裁决版本。**同页使用 React 18 与 React 19** 时：为整组 React、renderer 及其消费方设置独立 scope，通过桥接传普通 props/回调，**不跨 renderer 传 ReactElement 或 Context**：

```ts
// 宿主（React 19）
export default {
  name: 'rv-host',
  remotes: {
    'remote18': { dev: 'http://localhost:5441/remote18', prod: '/remote18' },
  },
  shared: {
    react: { singleton: true, shareScope: 'react19', requiredVersion: '^19.0.0' },
    'react-dom': { singleton: true, shareScope: 'react19' },
  },
} satisfies FederationOptions

// remote18（React 18）自身配置 shareScope: 'react18'；加载时指定：
// await loadRemote('remote18/Widget', { shareScope: 'react18' })
```

singleton 不把不兼容的大版本变成兼容——React 18 的 renderer 不能经协商兼容 React 19；要么对齐版本，要么按 scope 隔离整组依赖及消费者。可运行示例：[examples/demos/react-versions](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/react-versions)。

## dev 下自身源码参与协商：`devSharedSelf`

`devSharedSelf` 控制 dev 下自身源码（含依赖）是否参与 shared 协商改写：

| 场景 | 缺省值 | 说明 |
|---|---|---|
| 提供 `exposes`（或 `setup`）的应用 | `true` | 被宿主消费的组件需协商到宿主实例 |
| 纯宿主（只消费） | `false` | 自身 import 即自身 provide，避免巨型工程 TLA/循环依赖风险 |
| 双向联邦（既 expose 又消费） | `true` | 4.1.0 起按角色推断，无需显式背诵；**显式配置永远优先** |

build 下该路径的协商门面自动隔离进插件专属 chunk（`fulgurjs-runtime` + `fulgurjs-shared-<key>`）；共享包本体（含其静态闭包）自动隔离进 `fulgurjs-provider-<key>` 组（5.8.0 起，优先于用户 `manualChunks` 分组——防自等待环与跨 chunk TDZ），**业务自身的 manualChunks 分组规则可原样保留**；不保证用户任意模块图无循环。

## 诊断

- `window.__FULGURJS_SCOPE__`：share scope 实时协商结果（键 → 版本 → `{ get, from, loaded }`）；
- `loadShare(name, opts?)`：显式协商（最高版本胜出/已加载优先/singleton 收敛）；opts：`{ requiredVersion?, singleton?, strictVersion?, shareKey?, shareScope?, fallback? }`；
- `getLoadedShare(name, opts?)`：同步读取已就绪实例，不下载模块；未命中返回 undefined；
- `shareScopeMap`：共享注册表本体，查看诊断可以，普通业务不要直接修改。

错误码：`CFG-004/005/008`（配置期）、`MFU-003`（strictVersion 冲突）、`MFU-004`（共享缺失且无 fallback）、`MFU-010`（单例版本不满足某消费方）。逐条现象/原因/修法见[错误码总表](../reference/errors.md)。
