# 配置参考：`federation(options)`

> `FederationOptions` 的字段全集。每个字段给出：类型、默认值、**省略 vs 显式值**的语义差异、有效范围。核对基准为源码 `packages/plugin/src/options.ts` 与[API 参考](api.md)。配置写在每项目一份的 `fulgurjs.config.ts`（默认导出直接可传给 `federation()`），见[快速上手](../guide/getting-started.md#手工接入三个文件)。

## 字段总表

| 选项 | 类型 | 默认（省略时） | 说明 |
|---|---|---|---|
| `name` | `string` **必填** | 无——缺省即报错 CFG-001 | 容器名。同页面宿主/远程必须唯一；须匹配 `/^[a-zA-Z][\w.-]*$/`（字母开头，无空格/斜杠） |
| `filename` | `string` | `'fulgurjs-remoteEntry.js'` | prod 容器入口文件名（固定文件名便于引用与部署规则落位；入口内容每次构建变，**必须 no-cache**，长缓存只给带内容哈希的 chunk）。改了 filename 部署层与 doctor `--entry` 要同步 |
| `exposes` | `Record<string, string \| { import: string; name?: string }>` | 不提供任何模块 | 对外暴露模块：键 `'./X'`（省略 `./` 会规范化并提醒），值源文件路径；对象形态的 `name` 为稳定 chunk 文件名。键不得占用内部保留键 `./__fulgurjs_setup__`（CFG-012） |
| `setup` | `string` | **无初始化行为**（普通 exposes 语义完全不变） | 可选远程初始化入口：相对应用根的 TS/JS 模块路径。默认导出 `setup(context)` 应用级执行一次；可选具名导出 `onSession(context)` 按宿主 `sessionKey` 去重执行。无应用级副作用时可只声明onSession/globalComponents/pageProviders，无需空默认函数；空模块无效。路径空/非字符串报 CFG-012。详见 [API 参考 · setup/onSession](api.md#setuponsession-远程初始化生命周期) |
| `remotes` | `Record<string, string \| RemoteEntryConfig \| (() => Promise<any>)>` | 不消费任何远程 | 消费的远程，四种形态见下节。键是 import 前缀，不得含 `@`、`/`、空白（CFG-003） |
| `shared` | `string[] \| Record<string, string \| SharedHint>` | 不共享任何依赖 | 共享依赖。字符串简写 = `requiredVersion`；数组 = 每项按 package.json 推断。字段全集见[共享依赖指南](../guide/sharing.md#sharedhint-全部字段) |
| `shareScope` | `string` | `'default'` | 默认共享作用域名；各项可用 `shared[*].shareScope` 覆盖 |
| `manifest` | `boolean \| Record<string, unknown>` | `true` | `false` 关闭；其余值开启（对象形态不提供额外字段配置）。prod 构建生成 `fulgurjs-manifest.json`——关闭不影响普通 loadRemote；preloadRemote 降为仅预载入口，check-pages 缺清单时无法验证 exposes；doctor 可通过 --no-manifest 继续检查其他端点 |
| `runtimePlugins` | `string[]` | `[]` | 运行时插件模块路径列表（相对路径按应用根解析）。hook 错误契约：观测 hook 抛错只告警；`resolveShare`（决策 hook）显式抛错向调用方传播。见 [API 参考 · 运行时插件](api.md#运行时插件) |
| `dts` | `boolean \| { dir?: string; devCheck?: 'contract' \| 'implementation' }` | `true` | 远程类型自动生成与同步。提供方：dev 后台生成、随 prod 构建输出**可分发声明资源**（声明闭包 + 类型清单，不依赖远程本机源码）；宿主：dev 自动同步到 `src/fulgurjs/types/`（无 src 布局回退 `.fulgurjs/types`）并生成 ambient 声明与类型注册表——普通 import、动态 import 与字符串 API（`loadRemote`/`remoteComponent`/桥接工厂）共用同一套类型。`{ dir }` 自定义输出目录；`false` 完全关闭。含 `.vue` 暴露的提供方需 `vue-tsc`（模板已带）。见 [CLI · types](cli.md#fulgurjs-types) |
| `devSharedSelf` | `boolean` | 按角色推断：提供 `exposes`/`setup` 的应用 `true`；纯宿主 `false`；**显式配置永远优先** | dev 下自身源码（含依赖）是否参与 shared 协商改写。双向联邦缺省即 `true` 无需显式。build 下协商门面自动隔离进插件专属 chunk，业务 manualChunks 可保留 |
| `devCorsOrigins` | `string[] \| '*'` | '*' | dev 联邦 entry/manifest/types 端点按本项响应；Vite 源码模块在 server.cors 省略时沿用本项，显式 server.cors 仅覆盖 Vite 侧。省略与显式 * 均可能在非 loopback 提示 DEV-011；不修改生产服务器。 |
省略语义小结：`manifest`/`dts` 省略 = 开启/默认；`setup` 省略 = 无初始化行为；`shared`/`exposes`/`remotes` 省略 = 对应能力关闭（都不配 = 孤岛配置，得到 CFG-006 类提醒：既不提供也不消费）。

## remotes 的四种形态

```ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'host',
  remotes: {
    // ① 字符串单地址：dev 自动拼 /@fulgurjs-entry.js，prod 自动拼 filename
    'remote-a': 'http://localhost:5101',

    // ② '自报名@url'：重命名语义（推荐字符串形式；对象 external 也支持，dev/prod 槽位写 name@ 即 CFG-007）
    'checkout': 'shop@http://localhost:5102',

    // ③ 对象：按环境拆分 + 容错参数（external/dev/prod 至少一项；每种实际运行环境必须能解析出地址）
    'remote-b': {
      dev: 'http://localhost:5103/remote-b',   // 缺省回落 external
      prod: '/remote-b',                       // 缺省回落 external
      shareScope: 'default',                   // 该远程的共享作用域
      timeout: 15000,            // 加载超时 ms（有限正数，配置期校验 CFG-009；省略用默认 15s）
      retries: 2,                // 失败重试次数（0–10 整数；省略默认 2）
      fallback: ['https://backup.example.com/remote-b/fulgurjs-remoteEntry.js'],  // 备用 remoteEntry，依次尝试
      breaker: { threshold: 5, resetMs: 30000 }, // 连续失败熔断（数值均须有限正数）
    },

    // ④ 函数：promise-based remote（构建时地址未知；等价 webpack "promise new Promise"，
    //    需在运行时配合 registerRemote 注册；配置中的键仍用于改写 import 语法，并发警告）
    'remote-c': () => fetch('/api/remote-url').then(r => r.text()),
  }
} satisfies FederationOptions
```

对象 dev/prod 槽位省略时只回落到 external，不互相回落；例如只有 dev 的配置不能保证生产可用。完整 .js URL 在 dev/prod 都原样使用，目录 URL 才拼入口文件名。备用 fallback 填实际入口文件 URL，不填站点目录。

`dev` / `prod` 指消费方的运行模式，不限制提供方的环境。本地 dev 可以指向已部署的生产远程，必须提供完整 `.js` 入口，例如 `dev: 'https://assets.example.com/admin/fulgurjs-remoteEntry.js'`。不能只写生产目录 `/admin` 或域名目录，否则 dev 会补成开发端点 `@fulgurjs-entry.js`。

| 消费方本地 dev 的目标 | dev 值示例 | 实际入口 |
|---|---|---|
| 提供方 Vite 开发服务 | `http://localhost:5174/admin` | `http://localhost:5174/admin/@fulgurjs-entry.js` |
| 已部署的提供方构建 | `https://assets.example.com/admin/fulgurjs-remoteEntry.js` | 该完整 URL 原样使用 |

类型同步跟随同一 dev 入口，在其目录查 `fulgurjs-manifest.json`，再按 manifest.types 下载声明；生产站点必须同时部署这些资源。配置不会让本地未部署源码出现在生产模块或类型里。完整步骤、资源路径与失败排查见[本地开发消费已部署远程](../guide/components-and-modules.md#本地开发消费已部署远程)。

这里的 remotes.fallback 是“备用容器入口”；loadRemote 的 fallbackModule 是“显式替代业务模块”；loadShare 的 fallback 是“本地共享依赖副本”。三者不是同一个开关，不能互换参数。

`timeout` 语义：超时只代表「调用方不再等待」，浏览器不会取消已发出的动态 import——后续调用复用同一 in-flight 记录，不会重复初始化同一容器。

## devCorsOrigins 三态示例

```ts
// ① 开（默认/省略）：全放开——跨 dev-server 协作开箱即用；非 loopback host 时提醒 DEV-011/012
federation({ name: 'remote-a', exposes: { './Button': './src/Button.vue' } })

// ② 显式全开：与省略时同样允许 *，非 loopback 时仍可能提醒 DEV-011
federation({
  name: 'remote-a',
  exposes: { './Button': './src/Button.vue' },
  devCorsOrigins: '*',
})

// ③ 自定义 allowlist：仅列出的宿主来源可跨源访问联邦端点与源码模块
federation({
  name: 'remote-a',
  exposes: { './Button': './src/Button.vue' },
  devCorsOrigins: ['http://localhost:5100', 'https://team.example.com'],
})
```

行为边界：`devCorsOrigins` 只作用于 dev（build 产物不受影响）；端点对未命中来源只是省略 `Access-Control-Allow-Origin` 响应头（同源请求不受任何影响）。

若项目另有 server.cors，请将它与 devCorsOrigins 的 allowlist 对齐，分别检查联邦端点和实际 JS/CSS 响应；一处收紧不表示另一处已收紧。上述策略不是认证/鉴权机制。

## `fulgurjs.config.ts` 的完整形状

```ts
// my-app/fulgurjs.config.ts —— 默认导出直接可传给 federation()；无 root/apps[]/角色壳
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'my-app',
  exposes: { './pages/home': './src/views/Home.vue' },
  remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
  setup: './src/fulgurjs/setup.ts',   // 可选：远程初始化入口
  shared: { vue: { singleton: true } },
  devSharedSelf: true,                // 可选：显式覆盖；缺省按角色推断
} satisfies FederationOptions

// ── 以下具名导出仅供 CLI explain/check-pages 读取，不是 federation() 的参数 ──
// 逐页接入的宿主：页面表与运行时 createHostPages 消费同一份数据模块（唯一手工维护位置）
// import { pages, remotePrefixes, deriveSpec } from './src/fulgurjs/host/pages.data'
// export const hostPages = { pages, remotePrefixes, deriveSpec }
```

- CLI 加载器以**原配置文件为解析基准** esbuild-bundle 读取：支持项目内相对导入的纯 TS/JS 数据模块、Node ≥ 18、CJS/ESM 双形态；缺失文件、无 `name`、字段形状不对、expose/setup 指向项目外或不存在文件均三段式报错；
- 运行时（Vite）与 CLI 解析同一份配置值；dev/prod 的 URL 选择规则与 `federation({ remotes })` 一致；

## 配置期校验（fail fast）

一切配置错误在 vite config 阶段立即以「问题 + 当前值 + 预期值 + 修法示例」三段式报出，不带错误配置静默运行。CFG 段错误码：`CFG-001`（name）～`CFG-012`（setup/保留键），全集见[错误码总表](errors.md)。`remotes` 运行参数（timeout/retries/breaker）在配置期即校验数值合法性，坏数值不留到运行时。

`dts.devCheck` 默认为 `contract`，只控制开发提供方检查范围；`implementation` 将完整静态实现检查作为dev门禁；`false`关闭类型。build/CLI始终完整检查。用法、回退边界、缓存及三态示例见[组件与模块](../guide/components-and-modules.md#开发期先生成公开合同完整实现另行检查)。
