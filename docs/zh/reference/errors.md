# 错误码总表

> 48 个错误码，按段分组：CFG（配置期）/ DEV（开发期）/ BLD（构建期）/ MFU（运行时）/ CC（跨应用上下文）。每条给出**现象 / 原因 / 修法**三段式。错误文案中的修法具体到配置键 / 文件 / 命令；`fulgurjs doctor` 可提前把部署面的 MFU-001 类问题拦在上线前。
>
> 维护提示：新增/修改错误码必须三处同步——源码码表（`src/runtime/errors.ts` 的 MFU 段 / `src/context.ts` 的 CC 段）＋ 登记表 `CODE_REGISTRY`（`src/diagnostics.ts`）＋ 本表；`npm run build` 里的 `scripts/check-manual-codes.mjs` 做三方一致性校验（见[维护者 · 测试方法](../../maintainers/testing.md)）。

### 6. 错误码总表

#### CFG 配置期

| 码 | 现象 | 原因 | 修法 |
|---|---|---|---|
| `CFG-001` | vite config 阶段报「缺少必填的 name」或「name 格式不正确」 | `federation({})` 缺 name，或 name 不匹配 `/^[a-zA-Z][\w.-]*$/`（空串/数字开头/含空格斜杠） | 在 `federation({ name: 'my-app' })` 声明同一页面内唯一的非空字符串 |
| `CFG-002` | 配置期报「exposes 必须是对象」或 `exposes["x"].import 缺失` | exposes 写成了数组/字符串，或某条目缺少源文件路径 | 写成形如 `{ './Module': './src/path' }` 的对象；每键值是路径字符串或 `{ import: './src/path' }` |
| `CFG-003` | 配置期报「remotes 键包含非法字符」/「没有地址」 | remotes 键含 `@`、`/` 或空白；或某远程未填任何地址 | 键用纯模块名（如 `remote-a`，同时是 import 前缀）；`external`/`dev`/`prod` 至少填一个地址 |
| `CFG-004` | 配置期报「shared 必须是数组或对象」 | shared 写成了字符串等非法形态 | 用 `['vue']` 或 `{ vue: { singleton: true } }` |
| `CFG-005` | 配置期报 remotes 键与 shared 键同名冲突 | 同一个名字既在 `remotes` 又在 `shared`——加载改写规则会互相覆盖 | 重命名其一（通常改 remotes 键，如 `vue` → 不允许则用别的前缀名） |
| `CFG-006` | 启动时警告「未配置 exposes 或 remotes，目前只会注册共享依赖」 | 孤岛配置：既不提供也不消费（常见于手滑删了 exposes） | 要提供模块配 `exposes`；要消费远程配 `remotes` |
| `CFG-007` | 配置期报「对象写法不支持 name@ 前缀」 | `remotes['x'].dev/prod` 写成 `'bpm@http://…'`——对象形式整串当 URL 拼接，产出坏地址（运行时表现为无关的 MFU-001） | 对象 dev/prod 槽位写不带前缀的 URL（远程名称默认用键名）；需要改名用字符串写法 `'name@url'` |
| `CFG-008` | 配置期报「不能同时配置 eager 和 import:false」或「共享键重复声明」 | `eager` 需要本地副本打进初始 chunk，与 `import: false`（纯消费）互斥；或同 shareKey+shareScope 声明了两次 | 二选一：`{ eager: true }` 或 `{ import: false }`；合并重复声明或改用不同 shareKey |
| `CFG-009` | 配置期报 timeout/retries/breaker 数值非法 | `timeout`/`breaker.threshold`/`breaker.resetMs` 非有限正数；`retries` 非 0–10 整数 | `timeout: 15000`、`retries: 2`（上限 10 防退避风暴）、`breaker: { threshold: 5, resetMs: 30000 }` |
| `CFG-010` | 配置期报 devCorsOrigins 形态非法 | 值既不是 `"*"` 也不是 http(s) 来源数组 | `'*'`（全放开）或 `['http://localhost:5100', …]` allowlist |
| `CFG-011` | 配置期报「选项 xxx 已在 5.0.0 删除」并给迁移写法 | 传入了 webpack 兼容/无效选项：`remoteType`/`library`/`automaticAsyncBoundary`/`dataPrefetch`/`usedExports`/`ignoreUnusedSharedExports`（任何值含历史合法值都报） | 直接删除该字段：remoteEntry 恒为 ESM、TLA 异步边界恒开、tree-shaking 由打包器原生完成；预载用运行时 `preloadRemote()`（`/runtime` 导出） |
| `CFG-012` | 配置期报「setup 必须是相对应用根目录的非空模块路径」或「exposes 键已由联邦 setup 入口保留」 | setup 为空/非字符串；或 exposes 占用内部保留键 `./__fulgurjs_setup__` | setup 写如 `'./src/fulgurjs/setup.ts'`；保留键改名为其他公开 expose，原文件路径配置到 `federation({ setup })` |

#### DEV 开发期

| 码 | 现象 | 原因 | 修法 |
|---|---|---|---|
| `DEV-001` | dev 启动/首次加载报远程 manifest 拉取失败 | remote dev server 不可达（未启动/端口错/网络） | 确认远程 dev server 已启动且 `remotes[*].dev` 地址正确；`npx fulgurjs doctor --base http://localhost:<端口> --apps <子目录> --dev` 体检 |
| `DEV-002` | dev 提示 remote manifest 为空或格式不识别 | 对端不是 fulgurjs 插件产物，或插件版本过旧 manifest 形状不识别 | 对端安装/升级 @fulgurjs/federation 并重启其 dev server；核对访问的是 `@fulgurjs-manifest.json` 端点 |
| `DEV-004` | dev 预构建警告：已知 UMD-only 依赖不在 optimizeDeps.include | UMD/CJS 依赖被移出预构建，存在预构建内联本地 vue 风险 | 把该依赖放回 `optimizeDeps.include`（插件自动外部化 shared 键） |
| `DEV-005` | dev 提示 remotes dev URL 端口无监听 | `remotes[*].dev` 指向的端口没有进程监听（远程未启动或改了端口未同步） | 启动远程 dev server；按[改端口四处清单](../guide/examples.md#改端口的固定清单)同步宿主 remotes dev 地址 |
| `DEV-006` | dev 启动警告宿主/远程插件版本不一致 | 同页面多个应用的 @fulgurjs/federation 版本不同（运行时副本风险） | 统一各应用插件版本（workspace 内对齐依赖；独立仓库用相同版本号） |
| `DEV-009` | dev 页面报门面/虚拟模块 404 | `.vite` 缓存漂移（插件升级后旧缓存与新门面签名不匹配） | `rm -rf node_modules/.vite` + 重启 dev server（必要时换浏览器 profile） |
| `DEV-010` | dev 冷启动首轮 30~60s 出现瞬时 504/"ce" 或页面重载 | Vite 依赖预构建窗口（新依赖发现触发重新优化 + full reload），是瞬态不是故障 | 先真实打开页面预热再做断言/测试；稳定态不受影响 |
| `DEV-011` | dev 启动提醒：非 loopback host + 通配 dev CORS | `devCorsOrigins` 缺省/`'*'` 且 host 暴露到局域网，联邦端点对任意来源放开 | 显式 `devCorsOrigins: '*'`（声明知情）或改来源 allowlist 数组 |
| `DEV-012` | dev 启动提醒：非 loopback host + dev manifest 携带 fsRoot | dev manifest 含本机绝对路径（`fsRoot`），非 loopback 访问时本机路径外发 | `devFsRoot: false`（宿主 dts 降级 any 桩并提示）；`fsRoot` 永不进入 prod manifest |

#### BLD 构建期

| 码 | 现象 | 原因 | 修法 |
|---|---|---|---|
| `BLD-001` | 构建报 expose 源文件解析失败 | `exposes` 值指向的文件不存在/语法错误/路径指向项目外 | 核对 exposes 的源文件路径（相对项目根）；修复文件或路径 |
| `BLD-002` | 构建报构建目标低于 es2022 | `build.target` 低于 es2022——顶层 await（TLA）需要 | `build.target: 'es2022'` 或更新 |
| `BLD-003` | 构建警告 expose 目标组件含必填 props | expose 的组件声明了无默认值的必填 props——宿主按 props 透传时可能渲染缺参 | 必填 props 给默认值，或在使用处保证始终传入 |
| `BLD-006` | 构建报 output 数组形态下无法自动注入协商门面 chunk 隔离 | `build.rollupOptions.output` 是数组，插件无法自动加协商门面 chunk 隔离分支 | 手工在 output 各分支补齐插件提示的隔离规则 |

#### MFU 运行时

| 码 | 现象 | 原因 | 修法 |
|---|---|---|---|
| `MFU-001` | 运行时报远程容器/模块加载失败（含网络/超时/重试耗尽/熔断） | 远程不可达、入口地址错、超时后重试耗尽、或连续失败触发熔断 | 核对 remote 地址与可用性；配置 `fallback` 备用入口或调 `timeout`/`retries`；上线前用 `fulgurjs doctor` 体检部署面 |
| `MFU-002` | 运行时报 remoteEntry 自报名与配置名不一致 | 容器自报的 name 与 `remotes` 键/配置期望不一致（重命名未对齐） | 改 remotes 键对齐自报名，或用字符串 `'自报名@url'` 写法显式声明重命名 |
| `MFU-003` | 运行时抛 strictVersion 版本不满足 | `strictVersion: true`（或缺省规则命中）且协商到的版本不满足 `requiredVersion` | 对齐各应用依赖版本；或放宽 strictVersion/requiredVersion（确认兼容后） |
| `MFU-004` | 运行时报共享模块缺失且无本地 fallback | 请求的 shared 键没有任何提供方，且本应用未提供本地副本（`import: false`）；或未准备的同步消费者遇到异步 resolveShare hook（`details.syncUnsupported: true`） | 确认提供方 shared 声明与本端加载顺序；自定义入口先 `await loadShare(name, opts)` 再动态导入新消费者 |
| `MFU-005` | 运行时报同一容器用不同 share scope 重复 init | 同一容器被以两个不同 shareScope 初始化（协商状态歧义） | 统一该远程的 shareScope（remotes 配置与运行时注册保持一致） |
| `MFU-006` | 运行时报请求的模块未被该远程 exposes | spec 的 expose 键与远程 exposes 清单对不上 | 核对 `远程名/exposes 键`（spec 不要重复加远程名前缀；`fulgurjs check-pages` 可批量核对） |
| `MFU-007` | console 警告预加载失败（不阻断业务） | `preloadRemote` 预取的 chunk/CSS 不可达 | 查 `fulgurjs:error` 事件历史与远程部署；预载失败不影响后续真实加载 |
| `MFU-008` | 运行时报未知远程 | spec/调用里的远程名不在 `remotes`/运行时注册表里 | 核对远程名拼写；动态远程先 `registerRemote`/`registerRemotes` |
| `MFU-009` | 运行时报加载到的模块没有任何导出 | expose 目标文件没有导出（空模块/只有副作用） | 给 expose 目标文件补导出；确认加载的是预期文件 |
| `MFU-010` | 运行时警告选中的共享单例版本不满足某消费方要求（列出候选版本、提供方、影响与修法；同一组合只告警一次） | singleton 收敛到的版本不在某消费方 requiredVersion 内；或桥接宿主/子应用缺 singleton 导致双实例症状（Invalid hook call） | 统一依赖版本；确认告警可接受或调整 requiredVersion；跨框架宿主三键 singleton |
| `MFU-011` | 运行时报 setup 生命周期入口导出形态非法（报实际类型/预期签名/修法） | setup 模块的默认导出或具名 `onSession` 不是函数（其他导出不作为入口） | setup 文件默认导出 `setup(context)` 函数；可选具名导出 `onSession(context)` 函数 |
| `MFU-012` | 该次 `loadRemote` 拒绝，报 setup/onSession 执行抛错（cause 含原始异常） | 初始化代码自身抛错 | 修复 setup/onSession 内部错误后直接重试——只清失败阶段缓存（setup 失败重试从 setup 开始；onSession 失败只重跑会话段），已成功阶段不重复 |
| `MFU-013` | 运行时报远程声明 onSession 但宿主 AppContext 缺 sessionKey | 宿主未提供非敏感登录代次 ID（禁止用 token 充当） | 宿主登录流程 `provideAppContext({ sessionKey })`——每次成功登录/重登生成新值，token 刷新沿用 |
| `MFU-014` | 运行时报 setup/onSession 同步段内递归 loadRemote 同一远程 | 初始化同步段内加载同远程模块——该调用会等待自身形成死锁 | 初始化内不要加载同远程模块；跨远程加载放异步段 |
| `MFU-015` | 运行时报桥接契约非法（`./bridge` 默认导出缺 mount/unmount 或非函数） | expose `./bridge` 的模块没有用 `defineBridgeApp` 构造契约对象 | 子应用入口改用 `defineBridgeApp(...)` 默认导出（见[子应用桥接](../guide/app-bridge.md)） |
| `MFU-016` | 运行时报桥接准备或生命周期失败（`details.phase` 区分 getContext/mount/unmount；根因含子应用原始错误） | getContext 返回 Promise/非对象、mount 首次提交前抛错、或 unmount 清理抛错 | 按 phase 排查子应用代码：getContext 返回同步快照对象；mount 失败先清理 app/root 再抛；unmount 修复清理逻辑——unmount 抛错的容器被持久封锁，整页刷新恢复 |
| `MFU-017` | 运行时报桥接会话参数与 AppContext 不一致 | 受控 `sessionKey` 与全局会话矛盾（getContext 快照不一致）、非法值（空串/数字）、或页面级单会话冲突（多实例代次不一致） | 同页受控桥接实例统一会话；sessionKey 只用 非空字符串/null/省略 三态；换代按「先 null 卸载、clearAppContext、再写新代次」顺序 |
| `MFU-030` | 桥接路由同步配置/前缀冲突报错 | basePath 非法（空/根/带 query·hash·通配）或同页重叠前缀登记 | basePath 用宿主路由视角的静态绝对路径（如 `/approval`）；同页各同步实例前缀不重叠 |
| `MFU-031` | 桥接报路由协议缺失/通道失效 | 宿主启用 routing 但子应用未声明 `{ routing: true }`；或通道销毁后复用/再订阅 | 子应用契约第二参数声明 `{ routing: true }` 并从 `ctx.routing` 接线；换会话/卸载后不复活旧通道 |
| `MFU-032` | 桥接报非法导航 | 子应用导航目标越界自身前缀（`../`、跨前缀）、非法 `go` 参数、或失效通道的请求 | 子应用只导航自身 basePath 内的位置；go 参数用合法整数；通道作废后不再发起导航 |
| `MFU-033` | 桥接报路由准备/同步失败（附目标链/cause，不静默回退 memory） | 守卫/加载器/端口执行异常拒绝、或连续内部 replace 超过 5 次（重定向环） | 修复子应用守卫/加载器异常；排查重定向环（子应用路由定义的循环重定向） |

#### CC 跨应用上下文

| 码 | 现象 | 原因 | 修法 |
|---|---|---|---|
| `CC-001` | 远程初始化抛三段式错误（got / expected / example） | `requireAppContext(...)` 请求的必需字段在 AppContext 缺失 | 宿主桥在加载远程前 `provideAppContext({...})` 写入缺失字段（见[API 参考 · AppContext](api.md#2-appcontext--跨应用传值与方法引用)） |
| `CC-002` | 远程页报运行时单例不可用 | 远程页面被独立直开（未经宿主联邦加载）——没有页面级运行时与 context | 经宿主联邦加载远程页；时序契约 bridge → 远程 setup → 页面模块 |

## 排查入口

- 按症状（不看码）：[排错目录](../troubleshooting/README.md)
- 配置期错误先跑 `npx fulgurjs explain`；部署面问题先跑 `npx fulgurjs doctor`
- 运行时诊断：`window.__FULGURJS_INFO__`（各 remote 状态与 setup 阶段）、`window.__FULGURJS_SCOPE__`（shared 协商结果）、`fulgurjs:error` 事件
