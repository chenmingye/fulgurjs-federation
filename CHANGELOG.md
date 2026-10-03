# Changelog

## 5.6.0

- **修复：Vite 8（rolldown）生产链路五项（V8-SYNC-FACADE 配套）**
  - **大型应用页面启动死锁**——根因（JeecgBoot 实测定位，运行时插桩实证）：TLA 协商门面（`await loadShare`）使 rolldown 把「顶层 await」沿静态依赖传播进消费方模块的惰性初始化包装；应用代码/依赖库自身既有的循环依赖（ant-design-vue 的 useConfigInject ⇄ theme）随即变成两个 async init 互等，永不落定——页面零报错、应用引导永不执行（vite 8.1.4/8.3.2、rolldown 1.1.5/1.2.12 同现；5.5.x 的产物补 async 只修语法层，运行期挂起仍在）。修复：**rolldown 构建路径下，共享绑定门面与命名空间门面改为同步 pin 形态**（与 React 侧 CJS 垫片同构）：`getLoadedShare` 命中已协商实例则复用；未命中（含 strictVersion 版本冲突——与 TLA 路径 loadShare→fallback 语义对齐，不抛 MFU-003）时 `pinLoadedShare` 登记本地副本（first-wins + 版本守卫），后续协商收敛同一实例。插件不再向应用图注入任何 TLA，循环依赖回到同步求值；rollup（vite 5–7）路径行为不变。验收：Jeecg A/B/React-C/React宿主 vite 8.3.2（rolldown 1.2.12）生产全场景 5/5（登录、A套B、三层深链刷新直达、A套C 中文 query 深链刷新直达、React宿主套B）零 console 错误；e2e vite8 dev 73/73 + prod 33/33。已知代价（仅 vite 8）：门面本地副本静态入图，协商命中他方实例时本地物理 chunk 仍会被模块图拉取（B-2/B-8 双版本场景 vue 本体网络副本 ≤2，优于旧 TLA 形态实测的 3 份；运行时身份仍收敛单一实例）。
  - **remoteEntry 失败重试在 rolldown 产物失效**——generateBundle 的 `__fgR` 包装正则只匹配单/双引号字面量，rolldown 以反引号渲染 `import(反引号字面量)`，包装从未生效：expose chunk 失败后被浏览器模块图负缓存，重试同 URL 直接拒绝（"Failed to fetch dynamically imported module"）。修复：三种引号都包装。
  - **vite8 依赖预载负缓存阻断同页重试**——vite8 preload 助手的 `<link rel=modulepreload>` 会把 JS 依赖写入模块图，网络失败被负缓存后 `__fgR` 只变换入口 URL 无法恢复依赖 URL（实测：解除阻断后 retry=2 入口 200 而依赖 chunk 零请求、Promise 永不落定）。修复：rolldown 构建下 remoteEntry 各 loader 的 `__vite__mapDeps` 过滤为仅 CSS（保留样式注入语义），JS 依赖改由模块图按需拉取；rollup 保持原生预载。
  - **vite8 manifest exposes 缺项**——expose 目标同时被应用自身静态引用时，rolldown 将其并入其他 chunk（无独立 facadeModuleId），generateBundle 的 expose→chunk 映射落空（manifest 缺 `./Button` 等，preloadRemote/MFU-006 断链）。修复：按 chunk.modules 索引反查兜底（rollup 恒走原路径零影响）。
  - **optimizeDeps 弃用警告**——vite ≥ 8 只下发 `rolldownOptions`（遗留 `esbuildOptions` 键触发 deprecation warning）；vite ≤ 7 保持原双键路径。
- **重设计：V8-ASYNC-FIX 产物补丁（esbuild 定位引导，2026-10-03）**——旧版阶段一为盲正则替换（可命中字符串/注释里的同形文本）、阶段二 AST 兜底实际不可达（标准 parser 对「await 位于非 async 函数」一律早期 SyntaxError，`this.parse` 必然先抛；旧实现另有 `collectBrokenFunctions` 从不填充数组的缺陷，即便可达也返回空）。新版由 esbuild 真实报错位置驱动（精确指向非法 await，字符串/注释内容永不误报）：在代码区掩码（轻量 lexer 排除字符串/模板/注释/正则字面量）内回扫定位最内层包裹函数头，按箭头/function 声明/表达式/方法简写形态插入 `async`，每轮插入后立即 esbuild 复验；不支持的形态（getter/setter/生成器/计算键方法）明确失败并带上下文，不产出错误补丁。门面同步化后插件自身产物不再触发该缺陷，本修复保留为「用户自有 TLA 代码 × 循环依赖」触发 rolldown codegen 缺陷的安全网。回归 `tests/async-mark-repair.test.ts` 12 例：含以 rolldown 真实运行时访问器（逐字取自 rolldown-runtime chunk）执行修复产物的运行语义验证（初始化顺序/只初始化一次/循环依赖不永久挂起/rejection 传播/字符串注释正则零改动/不支持形态明确失败）。
- **质量门禁**：单测 623 → 631（async 补标重设计 12 + optimizeDeps rolldown 分支 1）；e2e dev 73/73（vite 5.1.8/6.4.3/7.3.6/8.3.2 四档）+ prod 33/33（vite 6.4.3/8.3.2 两档）；React 18.3.1+RR6+vite 8.3.2 dev 34/34 + prod-react 20/20；tarball smoke 通过；两套 TS 0 错误；gzip/错误码 48 三方一致。**已知边界（如实登记）**：React 18 子应用被「声明 react 19 singleton 的宿主」承载（host-bridge-vue × R18 remote-react × vite8 桥接）时，单例 loaded-first 跨大版本收养使 react-dom@18 配到 react@19（`__SECRET_INTERNALS` 不存在）——MF 单例语义使然（vite 5–7 同配置同样触发，此前未测过该组合），正确姿势是宿主/远程版本对齐或声明 requiredVersion+strictVersion。
——根因（JeecgBoot 实测定位）：TLA 协商门面（`await loadShare`）使 rolldown 把「顶层 await」沿静态依赖传播进消费方模块的惰性初始化包装；应用代码/依赖库自身既有的循环依赖（ant-design-vue 的 useConfigInject ⇄ theme，运行时插桩实证为两个 async init 互等）随即变成永不落定的互等——页面零报错、应用引导永不执行（vite 8.1.4/8.3.2、rolldown 1.1.5/1.2.12 同现；5.5.x 时代的产物补 async 只修了语法层，运行期挂起仍在）。修复：**rolldown 构建路径下，共享绑定门面与命名空间门面改为同步 pin 形态**（与 React 侧 CJS 垫片同构——该路径在 vite8 一直可用）：`getLoadedShare` 命中已协商实例则复用；未命中 `pinLoadedShare` 登记本地副本（first-wins + 版本守卫），后续任何 `loadShare` 协商收敛到同一实例（单例不双份）。插件自身不再向应用图注入任何 TLA，循环依赖回到同步求值。rollup（vite 5/6/7）路径行为不变（保留 TLA 形态）。已知行为差异（仅 vite 8 构建路径）：自定义 `resolveShare` hook 不再参与静态导入的首次解析（此前协商过的快照仍会被命中）；`strictVersion` 版本冲突在静态导入处不再抛 MFU-012 而是回退本地副本。验收：Jeecg A/B/React-C/React宿主 vite 8.3.2（rolldown 1.2.12）生产全场景 5/5（登录、A套B、三层深链刷新、A套C 中文 query 深链刷新直达、React宿主套B），console/pageerror 零错误。
- **重设计：V8-ASYNC-FIX 产物补丁（esbuild 定位引导，2026-10-03）**——旧版阶段一为盲正则替换（可命中字符串/注释里的同形文本）、阶段二 AST 兜底实际不可达（标准 parser 对「await 位于非 async 函数」一律早期 SyntaxError，`this.parse` 必然先抛；旧实现另有 `collectBrokenFunctions` 从不填充数组的缺陷）。新版由 esbuild 真实报错位置驱动（精确指向非法 await，字符串/注释内容永不误报）：在代码区掩码（轻量 lexer 排除字符串/模板/注释/正则字面量）内回扫定位最内层包裹函数头，按箭头/function 声明/表达式/方法简写形态插入 `async`，每轮插入后立即 esbuild 复验；不支持的形态（getter/setter/生成器/计算键方法）明确失败并带上下文，不产出错误补丁。门面同步化后插件自身产物不再触发该缺陷，本修复保留为「用户自有 TLA 代码 × 循环依赖」触发 rolldown codegen 缺陷的安全网。回归 `tests/async-mark-repair.test.ts` 12 例：含以 rolldown 真实运行时访问器（逐字取自 rolldown-runtime chunk）执行修复产物的运行语义验证（初始化顺序/只初始化一次/循环依赖不永久挂起/rejection 传播/字符串注释正则零改动/不支持形态明确失败）。

## 5.5.2

- **修复：多远程宿主 react-refresh 发布脚本的错源网络噪声**——发布脚本动态 import「首个 http 远程」的 `/@react-refresh`，多远程（Vue 远程 + React 远程并存）时猜错 origin：JS 层 5.4.2 已容错，但浏览器仍记录一条 404 网络错误（JeecgBoot-A 实测：B(5372,Vue)+C(5373,React) 双远程，A 页控制台恒有一条 5372/@react-refresh 404）。现改为：仅单一 http 远程时才跨源导入（origin 无歧义）；多远程时只同步设置 preamble 标志（硬检查语义不变），真实 react-refresh 实例由各 React 远程自带 origin 的 shim 自举并发布页面级单例——A 页 404 噪声归零，React 远程挂载与 HMR 实测不受影响。

## 5.5.1

- **修复：`getLoadedShare` / `pinLoadedShare` / `clearSessionState` 在 `/runtime` 与 `/react` 入口的类型与生成链缺口**——三个函数在内核（`dist/runtime.js`）实际导出且生成脚本向 `runtime-entry.js` 注入了 `clearSessionState`，但 `src/runtime-entry.ts` / `src/react.ts` 源码导出面未包含（发布包 d.ts 因此缺失，TS 消费者不可导入；`getLoadedShare`/`pinLoadedShare` 的 JS 入口导出也缺失）。现统一：源码、d.ts、生成脚本（`gen-runtime-entry.mjs`）三处一致，React 入口补齐同面；导出面守卫测试（`tests/runtime-entry-graph.test.ts`）批准清单同步。包内 `demo` 场景（`demo/shared` 卡片⑫）以真调用覆盖：getLoadedShare 与 loadShare 结果对象严格相等、pinLoadedShare 收敛、clearSessionState 后新代次 onSession 重跑。

## 5.5.0

- **修复：Vite 8（rolldown）大型应用生产构建失败（V8-ASYNC-FIX）**——插件 TLA 协商门面使消费方模块的 chunk 内惰性初始化包装异步化后，与用户代码既有循环依赖相遇（JeecgBoot 实测：electron 工具模块 ⇄ 路由模块），rolldown 1.1.5 为循环另一侧生成的包装漏标 `async`（`e((()=>{await …}))` / `__esmMin((() => { await …` 两种形态），产物出现「await 位于非 async 函数」——esbuild 转译期报 `"await" can only be used inside an "async" function`，浏览器侧为 `SyntaxError: Unexpected reserved word`（5.4.x 时代曾被迫切 Vite 6 构建规避）。修复：插件在 `renderChunk`（order: pre，抢在 vite:esbuild-transpile 校验前）做检测与补标——esbuild 语法校验确证破损才修复，按 rolldown 包装签名补 `async`（即 rolldown 本应生成的代码，运行时助手对 Promise 包装本有支持），必要时 AST 定位兜底；修复后复验必须通过。正常产物零改动零解析成本；rollup（Vite 5/6/7）零触发。回归 `tests/async-mark-repair.test.ts`；Jeecg A/B（1920/1924 chunks）Vite 8.1.4 生产构建产物全部语法合法。**语义说明**：补标后的包装与 rolldown 在循环场景的既有输出一致（调用方同步调用返回 Promise 不等待，与 rolldown 自身对异步循环的处理相同），不改变任何调用点。
- **修复：桥接诊断三项（MFU-033 降噪 / spec 失真 / cause 双重包装）**
  - MFU-033 双诊断：宿主守卫（React `useBlocker`）回滚期的连续广播竞态曾产生重复的「子应用守卫拒绝应用宿主确认的位置」误导诊断。现在 `cancelled` 类失败（子应用自己的新导航取代广播应用，子应用自洽）按正常取消处理不再报 MFU-033；真实失步（`aborted` 等）仍报且诊断文本携带目标位置；连续完全相同的错误折叠为首条（不同失败事件永不合并）。
  - 桥接错误 spec 真实化：`defineBridgeApp`（Vue/React 子应用适配器）不再以占位 spec `'bridge'` 预包装 MFU-016——mount/unmount 的原始错误原样抛出，由宿主适配器在生命周期边界**单点包装**（`bridgeHostError`：真实 spec + phase + 原始 cause，只包装一次；已是插件诊断的错误原样保留）。子应用路由接线（`connectVueBridgeRouter` 等）的同步失败诊断 spec 也从硬编码 `'vue-router'`/`'child-router'` 改为通道携带的真实远程名（`RoutingChannel.spec` 公开，`BridgeChildRoute.spec?`）。
- **支持：Vue Router 5（peer `>=4.1.0 <6`）**——审查插件消费面（`Router`/`currentRoute.fullPath`/`push/replace/go`/`beforeResolve/beforeEach/afterEach`/`isNavigationFailure`/`NavigationFailureType`，枚举值 4/8/16 两版一致）后正式支持；vue-router 5.1.0 下路由/桥接全套单测 87/87 通过，JeecgBoot（vue-router ^5.1.0）dev+生产全链浏览器验收通过。
- 修复：Promise 远程名称不一致告警在重试/恢复链路重复刷屏——同一（配置名↔自报名）对只告警一次。
- 质量门禁：单测 615 → 623（async 补标 6 + MFU-033 降噪 2）；e2e dev 43/43、prod 28/28 全绿；两套类型（tsconfig + 最新 TS 口径）0 错误；gzip / 错误码 48 三方一致门禁通过。

## 5.4.3

- 修复：移除 5.4.2 误带入 `transformIndexHtml` 的一条无条件调试输出（`console.error` 探针在发布前漏删，污染使用方终端）。运行时与 5.4.2 一致，5.4.2 使用方请直接升级。

## 5.4.2

- 修复：多远程宿主 react-refresh preamble 错源（MFU-001 "can't detect preamble"）——Vue 宿主同时挂 Vue 子应用与 React 子应用时，发布脚本静态 import「首个 http dev 远程」的 `/@react-refresh`（错源 MIME 失败 → 标志未设）。修复：标志同步先设 + 动态 import 容错 + shim 自举兜底（`src/index.ts`、`src/virtual.ts` genReactRefreshShim）。
- 修复：`BridgeHostRouting` 类型未从 `/bridge/router/vue`、`/bridge/router/react` 导出（README §8.3 与发布包 d.ts 不符）。
- 新增导出面守卫用例（`tests/exports.test.ts`）。

## 5.4.1

- 修复 URL 同步两端适配器将 replace 误报为 push、子应用 go/back/forward 未委托宿主历史，以及连续导航被丢弃的问题。
- React 宿主等待真实 blocker 的 reset/proceed 与提交位置；canNavigate 改为可选预判。Vue 初始 ready 和导航执行异常不再吞掉，MFU-033 保留 cause，队列失败后可继续导航。
- 修复 Vite 5/6 配套 plugin-react 4 的跨框架 dev preamble 标志缺失，避免 Vue 宿主加载 React 远程失败；子目录部署示例的 blocker 按逻辑路径判断。
- 修复 React 18 + RR6 生产渲染的跨共享键 CJS 双实例：提供闭包只豁免自引用，react-dom → react 走同步协商；入口 init 前的同步副本复用现有 fallback 回写规则登记，避免 renderer 与组件使用不同 React。
- 通道离页、暂停与卸载会作废在飞和排队请求；自定义宿主 navigate 可接收 AbortSignal；子应用接线可传 ctx.signal 自动清理。Vue history base 不再二次剥离；前缀与目标拒绝编码逃逸。

## 5.4.0

- **新增：跨框架桥接 URL 同步（`/bridge/router/*`）**——宿主 URL 表达子应用内部位置：首次深链直达（不闪默认页、不发错接口）、刷新/收藏/新窗口恢复、子应用 Link/RouterLink/router.push 与宿主菜单/前进后退全量同步、根重定向以 replace 规范化（不凭空制造历史）。架构：宿主 Router 是浏览器历史唯一写入方，子应用用受控 memory 路由（Vue `connectVueBridgeRouter` / React `createReactBridgeRouter`，Link/useNavigate/RouterLink 全兼容）；独立路由通道承载位置与仲裁（请求编号/代次隔离/外部作废/取消恢复），path/search/hash 三段原样保留（重复键/编码/中文/片段不二次转换），同实例路径变化**不重挂 root、不重建 store、不重载远程**。
- **启用即校验，默认关闭**：`routing` prop（`{ basePath, navigation }`）显式开启；子应用 `defineBridgeApp(工厂, { routing: true })` 声明协议（工厂第二参数 `{ signal, routing }`，Vue 工厂支持 Promise 形态——初始 memory push 落定后必须再 `app.use(router)`，install 初始导航会覆盖深链位置，原型实证）。未声明协议而宿主启用 → `MFU-031`（不静默退回 memory）；basePath 非法/前缀冲突 → `MFU-030`；越界导航/非法 go → `MFU-032`；重定向环 → `MFU-033`（附目标链）。
- **取消语义（真实框架行为）**：Vue Router 4 push/replace 落定 NavigationFailure 即真实取消（URL/历史/子应用位置保持确认态，不自动重试）；React Router 仅支持 data router（`createBrowserRouter/createHashRouter`），`canNavigate` 与树内 `useBlocker` 同谓词——RR 的 navigate 被 blocker 拦截时静默返回 void（dist 源码核实），故端口预判取消零副作用。RR `location.pathname` 含 basename，端口新增 `basename` 选项剥部署前缀（§2.3 分层，生产子目录部署实测抓出）。
- **会话与生命周期**：换账号/登出作废旧通道（旧导航 cancelled、不写 URL、不复活子应用）；unmount 后迟到通知失效；KeepAlive 离页暂停写入（不抢占 URL、不销毁共享端口）；卸载失败容器封锁语义不变。前缀按路径段匹配并在页面级登记互斥。
- **包接线**：新增 `./bridge/router/vue`、`./bridge/router/react` 按需入口（vue-router ≥4.1 / react-router-dom ≥6.11 为可选 peer）；默认 `/bridge`、`/runtime`、`/react` 零路由库导入（导入图门禁覆盖）；两个路由入口各 ≤4096B gzip 门禁；错误码 44 → 48（三方一致）。宿主两入口 gzip：bridge-host-vue 3103B / bridge-host-react 2575B（仍 ≤4096B）。
- **质量门禁**：原型门禁 27/27（双向 + hash 变体，可控竞态断言）；单测 566 → 589（路由内核/双端适配/宿主 routing 集成 23 例）；e2e 新增 bridge-router 双向 dev 13 例 + 生产 U08（真实 nginx 回退深链刷新 + 资源 404 不被掩盖）；全量 e2e dev 43 + prod 28 + 桥接六项目 33 全绿。**已知开发态边界**：workspace link（pnpm 双虚拟仓库）下宿主/子各持一份 react-router-dom 物理副本会断 Router context——fixtures 以 `resolve.alias` 统一副本（README 8.8/8.3 说明；registry 正式包消费无此问题）。

## 5.3.3

- **修复：loadShare × pinLoadedShare 并发窗口的单例双实例风险（F9）**——`loadShare` 设置 `entry.loaded` 后等待 `entry.get()` 期间，CJS 垫片的 `pinLoadedShare` 可同步写入本地实例；getter 完成后原实现直接覆盖 `entry.value`，同步 CJS 消费者与异步消费者各持一份实例。现在实行条目实例 first-wins（协商结果让位于先写入的 pin/fallback 实例，loadShare 返回条目当前 value）、条目级 in-flight get（并发 loadShare 共享同一次加载，getter 恰好调用一次）、getter 拒绝后回滚 `entry.loaded`（修复前死条目残留「已加载」标记会永久抢占单例的已加载优先）——失败窗口内已有 pin 时收敛到 pin 实例。8 个确定性回归（可控 Promise 门）覆盖挂起中 pin / pin 先行 / 并发去重 / 拒绝重试与状态恢复 / resolveShare 组合 / 多版本边界；单元 558 → 566。`runtime.js` gzip 9204B ≤ 9216B。
- **结论修正（Vite 8 与 dev 冷启动）**：Vite 8（rolldown）dev / 生产构建 / 生产页面挂载自本版起均有完整验收证据（双向桥接 11 步交互矩阵 176/176，5.3.2 时期的「生产页面 BLOCKED（上游）」已在独立验收轮定位为插件层四个缺陷并全部修复）。dev 冷启动依赖预构建窗口（DEV-010）如实声明为使用边界：首轮 30~60s 内首开可能出现瞬时 504/请求挂起并由 vite reload 自愈，自动化验收请先按文档预热。
- 插件分组的 Vite 8 方案（原生 codeSplitting 保护组 + 共享提供/协商/垫片/运行时分层）与共享选择共用、CJS 垫片同步形态、宿主提供闭包不改写等修复随本版一并正式发布（前两轮候选 rc.1/rc.2 的完整门禁见验收报告 §9/§10）。

## 5.3.2

- **修正：回滚 5.3.1 中「宿主入口 init 注入改为 `import "virtual:fulgurjs-init"`」的实验性变更**——该变更本意是修复 vite 8 生产运行死锁（未成功，vite 8 运行期仍单列 rolldown 上游 BLOCKED），但在大型宿主（jeecg 系，vite 6）生产实测存在破坏地图渲染的风险面。5.3.2 恢复 5.3.0 的「init 代码内联入口模块」形态（原始注释「rollup 会摇树剥离独立模块的顶层调用」仍然成立），其余 5.3.1 修复（同步 CJS-NS 垫片 / BN09 容器封锁 / BN08 getContext 诊断 / publisher 守卫）全部保留。单元 540/540、e2e dev 43 + prod 28 复验通过。

## 5.3.1

- **修复：Vite 8（rolldown）下 React 联邦生产构建 REQUIRE_TLA 失败**——React 生态的本体为 CJS（`react-dom/cjs/*` 内部 `require("react")`），插件的 CJS require 重定向此前把目标指向与共享协商门面同体的垫片（`await loadShare(...)` 顶层 await 形态）；rolldown 按 Node 语义在构建期拒绝「CJS require 含顶层 await 的模块」（vite 5-7 的 rollup 无此限制，属存量兼容缺口，5.2.5 无桥接工程在 vite8 下同样复现）。现在 CJS 垫片改为**同步形态**：运行时新增 `getLoadedShare` 同步查询（loadShare 成功后缓存实例值，已协商加载的实例优先命中，跨端单例语义与 TLA 版 loadShare 对齐），未就绪时直连本应用本体（与 provide/fallback 同一模块，构建期单份 → 实例恒同）。vite 5.1.8/6.4.3/7.3.6/8.3.1 × {vue,react}×{host,remote} 十六个真实工程构建全部通过；`runtime.js` gzip 8812B（门禁 ≤9216B）。**已知边界（如实声明）**：vite 8.3.1 的桥接/React 生产**页面运行**在本轮仍无法通过挂载验收（rolldown 对「TLA 协商门面 × 动态目标透传重定向 × async chunk 强制拆分」的组合行为导致入口求值死锁，插件层六种分组/时序变体均无法完全规避；dev 全功能正常），归因为 rolldown-vite 上游行为，详见验收报告。
- **修复：Vue 宿主桥接 unmount 失败后容器未持久封锁（BN09）**——`createVueBridgeApp` 的 `invalidate()` 在契约卸载抛错时仅返回 false，未封锁容器；点击「重试加载」或改变 `sessionKey` 会绕过封锁在清理状态不明的同一容器上重挂（mount 次数增加、状态转 ready）。现在与 React 宿主对齐引入持久封锁标志：封锁后重试与换会话都不再在此容器启动新实例，默认错误占位移除「重试加载」按钮（只保留「刷新页面重试」），`bridgeLifecycleError` 的 unmount 修法文案明确「插件已持久封锁该容器，只能整页刷新恢复」。新增回归：A→B unmount 抛错后 mount 次数恒定、封锁后占位无重试按钮、换会话不绕过封锁、正常卸载后重挂仍可用。
- **修复：getContext 返回 null/undefined 时错误码丢失（BN08）**——`resolveBridgeContext` 已判定快照非法，但构造诊断消息时再次访问 `snapshot.then`，对 null/undefined 抛出普通 `TypeError`（`Cannot read properties of null (reading 'then')`），约定的 `MFU-016 phase: getContext` 丢失。现在诊断分支安全描述实际返回值（null/undefined/原始值/Promise/thenable 四类各有明确中文说明与修法），并新增四类返回值的回归断言（含"不抛 TypeError"）。
- **修复：宿主未装 @vitejs/plugin-react 时被注入失效的 react-refresh 探针（5.2.0 起回归）**——dev 下 `transformIndexHtml` 的 publisher 注入条件只检查「remotes 中存在 http dev 远程」，纯 Vue 宿主（remotes 全是 Vue 远程）也会被注入 `import "http://<Vue 远程>/@react-refresh"`，而 Vue 远程无 plugin-react 中间件，每页一条 404 console error（host-vue fixtures 实测，破坏 B-16 等用例的零 console 断言）。现在注入前增加「宿主 shared 含 react/react-dom（确有消费 React 模块的意图）」判定；桥接宿主（shared 三键 singleton）不受影响。
- **改善：loadShare 成功后缓存实例值（`ShareEntry.value`）**，供 CJS 垫片同步查询与未来同步消费通道使用；`getLoadedShare` 为内部 API，不进入公开入口导出面。
- 新增回归测试 5 个（单测 535 → 540）；e2e dev 43 例 / prod 28 例全绿；MES 真实项目回归与 Vite 矩阵详见验收报告（`docs/跨框架桥接实施验收报告-20261001.md` 补录节）。

## 5.3.0

- **新增：跨框架桥接 `/bridge` —— 子应用级 Vue↔React 双向互嵌**（README §8.2；实现合同见 `docs/跨框架桥接实施任务书-20260929.md`）
  - 子应用侧：`defineBridgeApp`（`/runtime` 与 `/react` 同名双导出）——工厂接收 props 快照、返回装配完整的 VueApp / ReactElement，契约负责按容器跟踪、挂载/卸载与清理；React 侧用提交探针兑现「首次根提交完成才算挂载成功」，`react-dom/client` 在实际 mount 时才动态加载。
  - 宿主侧：`createVueBridgeApp` / `createReactBridgeApp`（`/bridge/vue`、`/bridge/react` 分离推荐入口 + `/bridge` 聚合兼容入口）——受控 `sessionKey` 会话代次、`getContext` 同步快照校验（拒绝 thenable/非对象，`MFU-016 phase: getContext`）、`appProps` 挂载时浅拷贝快照（嵌套对象/函数保留原引用）、默认中文错误占位（「重试加载 / 刷新页面重试」）。
  - 会话语义：页面级单会话登记（同页多实例单会话约束，冲突 `MFU-017`）；换账号/登出（`sessionKey → null`）立即作废旧代次并卸载；换代先 `clearAppContext` 保证零旧账号残留；已进入 `loadRemote` 的工作不冒充取消——迟到结果按代次丢弃，远程 `onSession` 遵守既有 `signal.aborted` 契约。
  - 错误码：`MFU-015`（桥接契约非法）/ `MFU-016`（桥接准备或生命周期失败，`details.phase` 区分 getContext/mount/unmount）/ `MFU-017`（会话参数与 AppContext 不一致），码表三方一致校验扩展至 `bridge-errors.ts`。
  - 新增错误码共 3 个（总表 41 → 44）；README 中英双语 §8.2/§12、DESIGN §6.2、webpack MF 对照与迁移指南同步。
  - 隔离边界如实声明：桥接只隔离两棵组件树的挂卸边界——无 realm/CSS 隔离、子应用内部错误不冒泡宿主边界、子应用 memory 路由不与宿主 URL 同步；组件级混渲染继续不支持。
  - 使用合同：桥接宿主必须同时安装 vue + react + react-dom 并将 shared 三键全部 singleton；纯 Vue / 纯 React 项目零对方依赖不受影响。
  - 修复：dev 跨源场景 react-refresh shim 的自引用顶层 await 死锁（无 @vitejs/plugin-react 的宿主消费 React 远程时页面永久挂起；shim 自身不再参与导入改写）；为无 plugin-react preamble 的宿主注入首个 http(s) dev 远程 origin 的 react-refresh preamble + 页面级单例发布。
  - 新增错误码后 gzip 门禁同步：`bridge-host-vue.js` / `bridge-host-react.js` 各 ≤ 4096B（zlib level9，框架外置）；`runtime.js` ≤ 9216B、`react-adapter.js` ≤ 4096B 维持不变（本轮内核零改动）。
  - 示例：`examples/bridge/{vue-host,react-host,vue-remote,react-remote}` 四个独立工程（registry 正式包消费，双向各一对）。

## 5.2.5

- **修复：远程示例（examples/{vue,react}/remote）子路径生产部署的 modulepreload 404**——Vite 的 preload helper 会把依赖链接转成**根绝对路径**（`"/"+dep`），remote 以默认 base `/` 构建时，modulepreload 会打到宿主站点的根 `/assets/`（SPA fallback 回 HTML → MIME 错误）。`vite.config.ts` 现按 `command === 'build'` 自动切换 `base` 为 `/vue-remote/`、`/react-remote/`（dev 不受影响）；两份 README 的部署说明同步订正（不再声称"相对路径天然适配子路径"）。运行时代码无变更。

## 5.2.4

- **修正：示例锁文件的 integrity 字段改为不固定（registry 校验）**——锁文件无法内嵌"包含它自身的发布 tarball"的哈希（自引用悖论），5.2.3 包内预填的 integrity 与实际发布产物不一致（npm 安装不受影响，但元数据错误）。现在 `@fulgurjs/federation` 条目保留精确版本与 resolved URL、移除 integrity，安装时以 registry 元数据校验，永不再失配。插件运行时代码与 5.2.2/5.2.3 完全一致，无源码变更。

## 5.2.3

- **修正：包内四份示例（examples/{vue,react}/{host,remote}）的 `@fulgurjs/federation` 依赖声明与锁文件统一指向本版本 5.2.3**——5.2.1/5.2.2 包内示例仍声明 5.2.0（上一轮锁文件回填发生在发布后，未能进入当版产物）。插件运行时代码与 5.2.2 完全一致，无任何源码变更；`src/version.ts` 常量随版本同源门禁同步。

## 5.2.2

- **修复：对象形式 manualChunks 的宿主也获得运行时 chunk 隔离**——5.2.1 的隔离只覆盖函数形式与未配置两种；jeecg 系工程普遍使用对象形式（`manualChunks: { 'vue-vendor': ['vue', ...] }`），此时隔离被静默跳过，运行时代码仍被并入巨型 vendor chunk。现在对象形式被包装为等价函数（插件专属 chunk 判定优先，其余按 `/node_modules/<包名>/` 前缀匹配回原组）。MES admin（vite 6 + 对象形式）真实构建验证。

## 5.2.1

- **修复：宿主构建的运行时 chunk 隔离（MES admin 实测回归）**——宿主（remotes>0）构建此前仅在 devSharedSelf 下注入 manualChunks 隔离；普通宿主的运行时代码会被 rollup 默认归组并进巨型 vendor chunk，与对含动态 import 的 chunk 全量做 swc 变换的构建插件（vite-plugin-top-level-await@1.6.0，jeecg 系工程标配）冲突——printSync 必崩（missing field type / invalid type: null，@swc/core 1.13.5/1.15.47 同崩）。现在所有宿主构建都将运行时与共享门面隔离进插件专属 chunk；用户已有 manualChunks 时按 devSharedSelf 同款方式包装复用，output 为数组时显式告警（BLD-006）。真实工程（cku-mes-admin，vite 6）构建通过验证。

## 5.2.0

- **修复：Vue 默认错误占位没有可操作的恢复入口（D1）**——默认占位新增两个用户操作：「重试加载」（同页重建加载链，重跑真实 loader 含 beforeLoad；Vue 的 defineAsyncComponent userRetry 在 userFail 后永久失效，故恢复由占位组件自身承载，成功后原位渲染业务组件并透传 attrs）与「刷新页面重试」（用户点击才整页刷新，保留 pathname/query/hash，绝不自动触发）。`remoteComponent` 与 `createHostPages().component()` 两条路径一致；自定义 `errorComponent` 契约不变（完全接管、不注入按钮）；KeepAlive 组件树形状与 5.1.x 完全一致。
- **修复：React 默认错误占位补齐刷新恢复（D1/D2）**——load 阶段默认占位同样提供「重试加载 / 刷新页面重试」双操作（渲染阶段错误仍只提供「重试加载」，文案明确区分网络与远程代码错误）。
- **修复：生产静态子依赖失败的用户恢复闭环（D2）**——浏览器 module map 缓存静态子依赖失败（同 URL 再 import 直接拒绝），同页重试无法穿透；默认占位的「刷新页面重试」给出确定的整页恢复路径。`prod B3c` 由「两种结果都能 PASS」改写为确定性门禁：占位双操作可见 → 同页重试（记录结果）→ 产品按钮触发导航（跨刷新标记证明，非测试脚本 reload）→ 目标业务页面真实恢复；新增 Vue 静态依赖生产用例（remote-a 静态依赖链 fixture + host-vue 页面）。
- **修复：React 跨应用开发更新真实自动传播（D3）**——根因：react-refresh 运行时状态（helpersByRendererID/pending 队列）为模块私有，宿主页内第二份副本（远程 origin）刷新空转。修复：宿主 preamble 后注入发布脚本把页面级 react-refresh 单例发布到 globalThis；远程组件的 /@react-refresh 导入改写到插件 shim（dev），shim 优先委托页面单例、standalone 回退本源实例。R11 重写为「5 轮冷启动 × 3 次修改」零人工刷新热更新保活门禁 + R11b 普通 TS 依赖传播门禁（挂载宿主实际看到新值）。
- **修复：Vite 5.x 双 client 错误覆盖层 IllegalConstructor（D4）**——Vite 5 客户端对 `vite-error-overlay` 的 define 有注册守卫，双 client 场景第二份客户端的本地 ErrorOverlay 类未注册，按 HTML 规范 new 未注册 HTMLElement 子类抛 IllegalConstructor，远程编译错误覆盖层无法显示。修复：把 Vite ≥6 的注册表构造修法前移到 Vite 5 客户端代码（fulgurjs:dev-client-compat，不改已安装 Vite 源码）；fault.spec 的 5.1.4 版本门控 skip 移除，支持矩阵内该用例全部真实执行（Vite 5.1.4 本地实测通过）。
- **示例重构（D7）**：examples 按框架分组为 `examples/vue/{host,remote}`（5214/5213）与 `examples/react/{host,remote}`（5204/5203）四个完整可复制工程（npm + registry 精确正式包 + 独立 fulgurjs.config.ts + 完整入口/源码/README），每对演示远程可点击组件、普通 TS 模块调用、联邦首页/参数详情页、宿主导航懒加载、默认错误恢复；旧 `examples/{host,remote-a,react-host,react-remote}` 目录移除。中英文 examples 总入口与 GitHub 根 README 同步。
- **文档（D5）**：中英文 README 与恢复/HMR 实际行为对齐；「失败 dynamic import 绝对不会再次访问网络」等表述限定到真实浏览器边界；支持矩阵与恢复操作口径统一。

## 5.1.4

- 修复类型生成的数组 extends、目录 references、独立 baseUrl 继承及继承 include 上下文识别；多个应用 paths 接管不一致时保留可解析声明并提示统一配置。
- setup/onSession 失败包装保留原始 Error.cause，中文 MFU-012 与重试语义不变。
- 增加开发/生产共用 React 浏览器契约：冷加载、多实例、真实慢快请求竞态、双向跨框架模块及生命周期失败恢复。
- 忽略 examples 构建与自动类型产物；完整验收结果在发版后的独立报告记录。

## 5.1.3（2026-09-29）

- **修复：TS 应用配置上下文识别（dev 类型双轨判定）**——宽松声明是否让位于精确轨，此前扫描根目录全部 `tsconfig*.json`（仅排除 `tsconfig.node.json`），任何一份无关配置（如 `tsconfig.test.json`）出现 `<remote>/*` paths 即误判「应用已接管」，抑制应用导入所需的 ambient 声明（导入 TS2307）。现在按真实 TS 上下文判定：主配置选择（`tsconfig.json`，或唯一/唯一覆盖应用源码的 `tsconfig*.json`——含只有 `tsconfig.typecheck.json` 的工程）+ `references` 链上 include 覆盖应用源码/类型输出目录的子项目（solution 型 `files: []` 配置自身不判定，不再按文件名排除）；`extends` 链 paths 继承，paths 目标与 baseUrl 按声明所在配置的目录解析。无法唯一确定上下文时安全回退（生成默认宽松声明，导入可解析）。真实 tsc 编译回归：无关测试配置不抑制 ambient；应用接管后精确轨拒绝错误 props。
- **修复：生产重试 helper 并发失败代次竞态**——per-URL 状态机此前在并发失败时每个失败各自递增代次并改写当前 URL，并发中的其他调用可能落到不同 `fulgurjs_retry` 代次 URL 上（不同 URL = 不同 module map 条目 = 模块重复求值、单例身份分裂）。现在为 per-URL promise 状态机：并发调用共享同一 Promise（单请求、单失败、单代次推进）；成功缓存定型 Promise（重复访问零额外网络请求，身份严格保持，两个 expose 别名同 chunk 同样经此去重）。真实构建浏览器验证：别名身份/单次求值/成功后零多余请求与 retry 参数；入口失败、expose chunk 失败同页重试恢复；**静态依赖 chunk 失败为不可同页恢复的已知边界**（浏览器缓存该依赖 URL 失败，需整页刷新；已写入 README 边界说明，不做全站依赖图改写）。
- **测试基建**：`fixtures/remote-react` 新增同源别名 expose、静态依赖链（两个消费者使 leaf 独立成 chunk）与模块求值计数探针；`fixtures/host-react` 新增别名身份面板与静态依赖组件；`prod-react` 新增 B1–B3c 生产形态浏览器回归（并发失败单代次推进的断言 = 恢复请求 URL 恰为 `fulgurjs_retry=1`）。
- **文档**：中英文 README 的类型轨 paths 配置位置由「任一 tsconfig」订正为「应用 TS 上下文」语义；补生产重试恢复范围、并发语义与静态依赖边界说明。
- 交接的 MES dev / 8662 双环境完整验收在正式包安装后单独执行；本条不含 MES 验收结论。

## 5.1.2（2026-09-29）

- **修复 React hook 重载清理**：`useLoadRemote.reload()` 在发起新尝试时清空旧数据；失败后不再同时保留上次成功的数据。卸载和 effect 清理使在途 reload 失效，卸载后调用保存的 reload 不再发起请求或写状态；StrictMode 的新 effect 使用独立请求代次。
- **回归验证**：新增直接记录卸载后状态 setter 调用的测试，覆盖成功/失败迟到结果、失败重载的数据清理、连续 reload 乱序和 StrictMode；不以 React 忽略卸载后的更新作为取消成功的证据。
- **测试入口与文档**：默认开发命令包含 Vue/React 的 dev/fault 四个项目，生产命令包含两个框架的 prod 项目；中英文安装清单补齐 auto-import 与 React fixtures，删除过时的用例数量和“生产测试不进 CI”表述。
- **Vite 5 已知限制范围**：错误覆盖层用例只对已复现的 5.1.4 跳过，其他 Vite 5 版本执行正常断言；跳过仍单列，不算通过。
- 本版是小范围修复；TS 应用配置上下文识别、生产重试完整浏览器验证和 MES 双环境全量验收仍需后续任务完成，不宣称完整验收通过。

## 5.1.1（2026-09-28）

- **修复：同实例会话切换（React）**——已挂载的 `useLoadRemote`/`remoteComponent`/页面组件此前不观察 `AppContext.sessionKey`，宿主换账号后同实例不重载。现在渲染期读取当前登录代次，`sessionKey` 变化即在同一实例上重走加载生命周期（不重挂载、不产生第二份 React；同会话 rerender 不重载；`undefined→A`、`A→B`、`A→登出→B` 均覆盖；Vue KeepAlive 退出语义不受影响）。
- **修复：tsconfig paths 判定语义化**——宽松声明是否让位于精确轨，现在按 JSONC 语义解析（注释/无关配置/纯 exact 键不再误判），沿 extends 链继承，排除 `tsconfig.node.json`（node 上下文不影响应用导入）；指向非插件精确目录的映射会跳过宽松声明并给出诊断。
- **修复：类型降级残留失效转发文件**——`devFsRoot:false` 或源码不可达降级时同步清理插件自有的 `<remote>.d/` 精确轨目录；同一工程内「精确→降级→恢复」全程真实编译通过（此前残留转发文件导致 TS2307）。`dts:false` 明确为只停不删。
- **修复：生产重试 URL 污染成功加载**——remoteEntry 的重试 helper 此前按调用次数 cache-bust（第二次成功加载也被改写成 retry URL，模块重复求值、单例身份分裂）。现在为失败驱动的 per-URL 状态机：成功永不改写（身份保持），仅真实失败后的下一次尝试变更 URL（`fulgurjs_retry=N` 单调递增，已带 query 用 `&` 拼接）。dev 容器 loader 与运行时入口语义不受影响。
- **修复：Vite 8 依赖预构建外部化**——Vite 8 的 rolldown 优化器对 `optimizeDeps.esbuildOptions.plugins` 仅执行 resolve（不执行 load），共享键外部化桩不可加载（UNLOADABLE_DEPENDENCY），远程 React 协商链全断。现在同时注入 `optimizeDeps.rolldownOptions.plugins`（识别兼容层产出的 namespace 前缀 id；门面 URL external；`isEntry` 放行预构建入口）；Vite ≤ 7 行为不变。
- **测试与文档**：Playwright 项目与 spec 文件一一对应（此前 Vue 项目重复执行 React 用例）；R15 类型检查改为独立负向用例矩阵（遗漏必填字段/错误字段类型/错误回调签名/函数参数，各断言预期诊断）+ 真实生成器 any 降级编译链；跨框架普通模块断言改真实导出成员与计算值；错误监听前置到导航前；英文 README 重写为独立完整手册（全部公共 API/字段/错误码/边界，不依赖中文补全）。React 18.0.0 精确下界补验（隔离工程 dev 全链）。

## 5.1.0（2026-09-28）

- **React 完整支持（浏览器客户端）**：新增 `@fulgurjs/federation/react` 入口——`remoteComponent`（pending/错误占位与错误边界内置、timeout 适配层超时、不用 React.lazy 的失败缓存陷阱）、`useLoadRemote`（代次守卫的模块 hook：StrictMode 双 effect/快速切换/慢请求晚返回/卸载后返回只允许最新有效请求写状态）、`RemoteErrorBoundary`（页面级兜底 + resetKeys）、`createReactHostPages`（与 Vue 共用同一份页面表数据与 definePages R1–R5 校验；不提供 keepAliveNames）。peer 新增可选 `react`/`react-dom`（`>=18 <20`）；纯 React 项目零 Vue 依赖、纯 Vue 项目零 React 依赖（静态导入图与 tarball 消费双向守护）。共享 `react`/`react-dom` singleton：dev 期预构建外部化自动改道 jsx-runtime/jsx-dev-runtime 内部引用，prod 期 CJS require 垫片覆盖 `react-dom/client` 子路径；Hooks/StrictMode/Context 跨端单实例经真实浏览器 e2e 验证（React 19.3；18 隔离验证见验收报告）。
- **修复：失败恢复穿透浏览器 ESM 失败缓存**（Vue/React 通用）——同 URL 的失败 `import()` 会被浏览器 module map 缓存为失败（重试零网络请求）。运行时入口（`entryFailCounts` + `fulgurjs_retry=N` query）、dev 容器 expose loader（字面量主路径保持 vite URL 规范化一致 + `@vite-ignore` 重试分支）、prod remoteEntry 产物（`__fgR` 包装）三处统一实现「失败后的重试变更 URL」；服务恢复后点击重试真实重新拉取（此前仅整页刷新可恢复）。
- **修复：`react-adapter` 产物内联 react 的隐患**——peerDependencies 曾漏列 react/react-dom 导致 tsup 未外置；本版 peer 完整（此前版本无 React 入口，无实际影响面）。
- **开发类型双轨（Vue/React 通用）**：此前 ambient declare module 内的相对 re-export 是 TS2439 非法声明，被用户工程常规 skipLibCheck 静默吞成 any。现零配置生成合法带体宽松声明（可解析）；新增精确轨 `<types>/<remote>.d/` 目录转发模块，宿主 tsconfig 配一段 `"paths": { "<remote>/*": ["<types目录>/<remote>.d/*"] }` 即获得源码级类型（错误 props/参数编译失败）；配置了 paths 的远程自动跳过同名宽松声明避免遮蔽。
- **完整英文 README（README.en.md）**：与中文 README 同源的当前用法全量文档（含 React API/41 错误码/边界/懒加载口径），随 npm 包发布；npm 默认 README 仍为中文，两份顶部互链。
- 内部：vue-adapter 纯页面解析提取为共用的 host-pages-core.ts（Vue 行为与既有断言保持）；新增 fixtures/host-react + fixtures/remote-react、examples/react-host + examples/react-remote、React dev/fault/prod e2e 套件与 CI 矩阵接线；prod-setup 隔离 NGINX 增加 /host-react 与 /remote-react 子路径。

## 5.0.4（2026-09-28）

- **修复开发类型生成的地址解析**：按宿主开发服务的 origin（包含协议）解析协议相对与同源相对的 remote dev 地址，避免页面可加载却因 `new URL()` 缺基址而跳过类型生成。新增真实 HTTP manifest 回归测试；5.0.3 的 any 降级声明修复保留。

## 5.0.3（2026-09-28）

- **修复开发类型降级失效**：远程关闭 `devFsRoot` 或源码目录在宿主不可访问时，按 manifest 的公开暴露模块生成真正的 `any` 环境声明，支持默认、具名和副作用导入，覆盖过期源码映射；内部 setup 不生成用户声明。此前只有降级提示，没有声明文件，实际 TypeScript 导入会报 TS2307。新增真实 TypeScript 编译与不可访问目录回归验证。

## 5.0.2（2026-09-27）

- **测试可移植性修复**：`build-manifest-css.test.ts` 改用 `fs.realpathSync(os.tmpdir())` 建 vite root——macOS 的 `os.tmpdir()` 返回 `/var/...`（符号链接），vite 会把 root realpath 成 `/private/var/...`，两者不一致使 `vite:build-html` 生成跨符号链接的相对 fileName 被 rollup 拒绝，单测在 macOS 上必失败（CI Linux 不受影响）。仅测试代码，dist 产物零变化；修复后本机单测 385/385。

## 5.0.1（2026-09-26）

- **修复 dev manifest 的 version 恒为 0.0.0**：`genDevManifest` 此前查 `pkgDependencies['fulgurjs']`（0.5.0 品牌更名前的旧包名键，更名后真实包名 `@fulgurjs/federation` 使该键永不命中），导致宿主 DEV-006 对每个远程都误报「版本不一致（远程为 0.0.0）」。现直接写远程自身插件版本（`pluginVersion`），DEV-006 恢复真实比对语义；附回归测试。prod manifest 不受影响。

## 5.0.0（2026-09-26）

有意破坏公开 API 的清理版（插件尚无外部用户，公开使用面只描述真实可用能力）。旧 API 传入时给出「当前值 → 原因 → 迁移写法」的中文错误，不静默接受。

### 删除：4.1.0 聚合配置整条兼容链

- **`@fulgurjs/federation/config` 子路径**：`defineRepoConfig` / `loadRepoConfig` / `federationOptionsForApp` 与 `RepoConfig`/`UserConfig`/`AppConfig`/`HostConfig`/`RemoteConfig`/`DeployConfig`/`RemoteAddress` 聚合类型不再发布（exports/typesVersions/构建入口同步移除）。替代：每个应用根目录一份 `fulgurjs.config.ts`，默认导出直接 `satisfies FederationOptions`。配置内导入旧子路径或旧形状（`root + apps[]`）时，CLI 输出「拆分到各项目根」的中文迁移指引。
- **CLI `--app` 选择器**：从 help 移除；传入报中文错误（说明其为聚合链选择器并给出单项目替代）。`explain`/`check-pages` 只接受单项目配置。
- **check-pages 旧聚合形态的本地 dist 回退**：删除。显式 `--manifest`/`--site` 来源失败如实报「无法验证」，无本地 dist 兜底。
- **`init --config` 聚合输出分支**（各应用 Vite 粘贴块、NGINX 样板）删除；单项目输出保留。`PageEntry` 类型迁至单项目契约模块（`app-config.ts`）继续服务 `hostPages`，页面表功能不受影响。

### 删除：无实际效果的配置选项（传入报 `CFG-011`）

- `remoteType`（只接受唯一值 `module`）、`library`（从未参与输出）、`automaticAsyncBoundary`（恒为 true）、`dataPrefetch`（恒为 true，预载用 `preloadRemote()`）、`usedExports` / `ignoreUnusedSharedExports`（no-op，打包器原生 tree-shaking 已覆盖）。`CFG-011` 重定义为「已删除选项的迁移报错」；类型层不再允许这些字段，JS/`as any` 传入由运行时校验兜底。

### 删除：无消费者的导出键

- `exports['./internal/vue.js']`：生成门面实际引用 `./internal/vue-adapter.js`（保留），`remoteComponent`/`createHostPages` 由 `/runtime` 提供（`src/vue.ts` 保留，供 runtime-entry 内联消费）；`dist/vue.*` 不再随包发布。

### 不变（本轮明确保留）

`/runtime` 全部导出（含 `getRuntime`/`shareScopeMap`/`getContainer`/`parseSpec`/`unwrapDefault` 低层 API）、`./internal/context.js`、`./internal/pages.js`、`./internal/vue-adapter.js`、`exposes`/`loadRemote`/`preloadRemote`、`setup`/`onSession` 生命周期、`createHostPages`/`remoteComponent`、虚拟模块机制、dev/prod 双引擎与懒加载。

## 4.3.1（2026-09-26）

- 将插件自身的配置、共享依赖和远程加载诊断改为中文，保留错误码与原始底层异常；修复 `MFU-010` 将多个兼容候选版本误判为冲突的问题，真正不兼容时显示原因与修法，并对同一版本组合去重。
- 移除基于裸导入前缀猜测“漏配远程”的提示；它会将 `vite/modulepreload-polyfill`、`@vue/runtime-dom` 等普通依赖误报为远程配置问题。真正无法解析的导入仍由构建工具报错。
- 中文诊断使运行时 gzip 从 7547B 增至约 8649B；体积门禁由 8192B 调整为 9216B，仍限制无意增长。

## 4.3.0（2026-09-25）

### 修复（4.2.1 复核问题）

- **`check-pages` 远程地址全形态推导**：新增 `manifestUrlForRemoteAddress` 共享解析（与运行时同语义）——绝对 prod 地址支持目录 URL / 完整 `fulgurjs-remoteEntry.js` URL / `name@url` 前缀 / `fulgurjs-manifest.json` 直链；`name@url` 形态此前被 `^https?://` 门禁误判为相对地址而报「无法验证」。相对 prod + `--site` 组合同样经统一推导。
- **`check-pages` manifest 来源优先级**：显式 `--manifest` > 显式 `--site`（只用指定来源，失败=「无法验证」）> 本地 dist（仅在未指定任何线上来源时兜底）。修复旧聚合配置在 `--site` 指定死地址时仍回退本地旧 dist 并退出 0 的问题——指定线上站点验证时不再可能被本地产物冒充。来源报告带实际命中 URL（含 localhost 回退）。
- **CLI 独立目录 TS 配置加载**（`app-config.ts`）：esbuild 定位改为「受控编译器」——候选（配置工程直连 → 经 vite 传递依赖 → CLI 自身依赖树）必须先通过 `satisfies` 语法能力探针（esbuild ≥0.14.49），不再按「找到就用」收编偶然悬挂的旧版（曾实测 esbuild 0.11.23 使合法配置报 `Expected ";" but found "satisfies"`）；`esbuild` 成为包直接依赖（^0.27.0），无本地 Vite 的独立目录 `init`/`explain` 开箱可用（Node 18/24 实测）。
- **CLI localhost 回环回退**：Node 18 的 fetch 将 `localhost` 只解析到 `::1`（本机服务通常只监听 IPv4），CLI 抓取 manifest 失败时自动改试 `127.0.0.1` 并以实际命中的 URL 作为来源报告（Node 18 下 `--site http://localhost:8662` 不再误报「无法验证」）。

### 文档订正

- **remoteEntry 缓存语义统一**：修正「固定文件名利于 CDN 长缓存」与部署章节「必须 no-cache」的自相矛盾——统一为「文件名稳定便于引用，入口内容每次构建变必须 no-cache；只有带内容哈希的 chunk 才可长缓存」。
- **README「真实工程验证」表述**：移除「27 页零报错、逐页写操作闭环」等以 23/23 页有字为证据的过度结论，改为「以 26 条页面记录 + 27 个菜单入口的逐项业务断言为准，结论见对应版本验收报告」。
- **示例重构**：`examples/fulgurjs.config.example.ts`（无默认导出、不可运行）拆为 `examples/remote-a/` 与 `examples/host/` 两个真实可复制、可 CLI 校验的单项目配置（含最小源文件），附 README 复制方法。

### 修复（续）

- **`createHostPages` 异步组件包装结构回归 4.2.1 已验证形态**：直接命名 `defineAsyncComponent`
  包装器（按 spec 独立创建，不触碰远程模块导出对象），移除外层 stateless `defineComponent`
  包装——外层包装会在「保活页 → 登出/切换布局」的卸载路径上触发 Vue core
  `parentComponent.ctx.deactivate is not a function`（KeepAlive + async component 竞态，
  vue 3.5.43 实测复现）。
- **会话组件缓存只在新的非空 `sessionKey` 出现时重置**：登出（sessionKey 变 undefined）不清缓存——
  `clearAppContext` 后路由过渡期宿主布局仍会重渲染当前联邦页，此刻重建组件会让 KeepAlive
  在激活路径上换子组件。会话语义不受影响：onSession 去重由 runtime 在 `loadRemote` 时按当前
  sessionKey 判定；下一次登录出现新代次 ID 时缓存照常重置。

### 性能

- **整远程预载默认关闭**（宿主桥模板契约）：`PREFETCH_REMOTES` 默认 `[]`——首次进入联邦页只下载该页所需资源（dashboard 不再因登录而预载全部 expose 清单）。`preloadRemote('remote')` 显式整远程预载能力保留；README §9.1.3 新增四层区分（路由表声明 / 页面真实加载 / 单页预取 / 整远程预取）与「预取是下载不等于执行」语义。

## 4.2.1（2026-09-25）

### 修复

- **`check-pages --require-verified` 退出码语义**：此前只要传了该开关，即使全部页面验证命中也以非零退出（开关位被误当结果位）。现按「`--require-verified` 且实际存在无法验证项」判定——registry fixture 验收中发现（4.2.0 发布后），补回归用例。

## 4.2.0（2026-09-25）

### 新能力：每项目一份 `fulgurjs.config.ts`（单项目契约，默认主路径）

- **默认导出直接是 `federation()` 选项**：`fulgurjs.config.ts`（应用根目录）默认导出
  `satisfies FederationOptions` 的选项对象，`vite.config.ts` 只需
  `import fulgurjsConfig from './fulgurjs.config'` + `federation(fulgurjsConfig)` 一次注册——
  无 `loadRepoConfig`/`federationOptionsForApp`/父目录配置/应用名字符串查找。宿主与远程分属
  互不相邻的仓库时各自独立构建/部署/诊断（只声明对方 URL 与容器名）。
- **宿主页面核对数据具名导出 `hostPages`**（`{ pages, remotePrefixes, deriveSpec? }`）：仅供
  CLI `explain`/`check-pages` 读取，与运行时 `createHostPages` 消费同一份数据模块——页面表
  唯一手工维护位置，`check-pages` 核对的就是浏览器实际使用的页面数据。
- **CLI 配置加载器**（内部，不入项目 Vite 代码）：以原配置文件为解析基准 esbuild-bundle
  （支持项目内相对导入的纯数据模块、extensionless、Node ≥ 18、pnpm 严格布局经 vite 依赖树
  解析 esbuild）；缺失文件/无 name/字段形状错/expose 指向项目外或不存在文件三段式报错。
- **CLI 单项目化**：`init` 默认生成单项目起步模板（不再生成聚合配置样板）；`explain`
  按**实际 federation 选项**判角色（配 remotes=消费、配 exposes/setup=提供，两者均有=双角色），
  单项目形态免 `--app`；`check-pages` 支持 `--manifest <remote>=<路径|URL>`（可多次）、
  `--site` 按消费方 prod 地址推导、输出每个 remote 的 manifest 实际来源、
  `--require-verified` 严格模式（无法验证也非零退出）。
- **`FederationOptions` 类型公开导出**（4.1.0 已导出，4.2.0 起为单项目契约的正式依赖）。

### 行为变更

- **`fulgurjs init` 只生成配置起步模板**：不生成桥/路由/启动器/NGINX 文件（NGINX 内容仅作
  打印样板随旧聚合配置输出）。README/迁移指南同步订正：删除不存在的 `host.prefetch` 配置面
  说法（预载名单 = 宿主桥 `PREFETCH_REMOTES` 常量）。
- **旧聚合配置（`root + apps[]`）自动识别、兼容期保留**：`defineRepoConfig`/`loadRepoConfig`/
  `federationOptionsForApp` 行为不变（`explain`/`check-pages` 需 `--app`）；但文档主路径、
  `init` 模板与示例一律为单项目形态。`explain` 对聚合配置同样按实际选项判角色（双向联邦
  应用显示「双角色」）。

## 4.1.0（2026-09-24）

### 新能力：远程初始化生命周期 + 宿主页面适配器 + 单配置驱动

- **`federation({ setup })` 远程初始化（可选）**：声明初始化入口文件（默认导出 `setup(context)` 应用级执行一次，可选具名导出 `onSession(context)` 按宿主 `sessionKey` 去重执行；换账号/重登自动重跑，退出 `clearAppContext()` 清理会话状态）。`loadRemote('remote/模块')` 是统一触发入口（容器 init 后、返回模块前）；`loadRemote('remote')`、`getContainer()`、`preloadRemote()` 不执行初始化。失败显式报错可重试：`MFU-011`（导出非法）/ `MFU-012`（执行失败）/ `MFU-013`（有 onSession 缺 sessionKey）/ `MFU-014`（自递归）。内部 expose 键 `./__fulgurjs_setup__`（CFG-012 拦截占用），不进 dts/公开 exposes 清单。旧的「expose 启动器 + 宿主手动 loadRemote 调用」写法继续可用（兼容形态）。
- **`createHostPages({ pages, remotePrefixes, ... })` 宿主页面适配器**：一份页面表供宿主路由与布局共用；URL 解析（base 剥离/深链/参数解码失败不崩）、最长前缀远程归属、`definePages` R1–R5 校验、异步组件缓存（会话切换自动重建）、骨架屏/错误占位、保活名称内置。包装组件不修改远程模块导出对象。
- **`federationOptionsForApp(config, app)`**（`@fulgurjs/federation/config`）：仓库配置直转 Vite 插件选项（name/remotes/exposes/setup/shared/devSharedSelf）；同键不同地址报错带两边值。`HostConfig.pages` 转为可选（应用代码页面表为运行时真源），新增 `deriveSpec`/`devSharedSelf` 字段。
- **`clearAppContext()`**：退出清理——删 context + 作废全部远程会话信号与 onSession 去重状态；不重置模块缓存/共享模块图/应用级 setup。无运行时单例时静默幂等（不阻断登出）。
- **CLI**：`fulgurjs explain`（配置解释器：角色/remotes/exposes/setup/shared/页面映射/devSharedSelf 来源/加载链，纯本地）；`fulgurjs check-pages`（页面表 ↔ 远程 manifest exposes 契约核对，确定性错误非零退出，远程不可达报「无法验证」）。

### 行为变更

- **`devSharedSelf` 角色推断（§12.4）**：提供 `exposes`（或 `setup`）的应用默认 `true`（此前双向联邦默认 `false`、README 要求显式 `true`——漏配曾是已知错误配置来源）；纯宿主默认 `false`；显式配置永远优先。
- **不支持选项硬报错（§12.6）**：`remoteType` 非 `module`、`library.type` 非 `module/esm`、`automaticAsyncBoundary: false` 从「warning + 静默回落」改为配置期 `CFG-011` 报错；`remoteType` 类型收窄为字面量 `'module'`。
- **runtime gzip 门禁 6144B → 8192B**：setup/onSession 生命周期固有增量（4.1.0 实测 7585B）。
- `@fulgurjs/federation/runtime` 新增导出：`clearAppContext`、`createHostPages`；类型新增 `RemoteSetupContext`、`RemoteSetupModule`、`HostPages`、`HostPagesOptions`、`ResolvedHostPage`；`AppContext` 新增 `sessionKey` 字段。

## 4.0.0（2026-09-24）

### 应用代码改用物理入口

- 唯一公开应用入口改为 `@fulgurjs/federation/runtime`，提供实际的 ESM 文件与类型声明；配置入口仍为包根和 `/config`。
- `virtual:fulgurjs-api` 与 `@fulgurjs/federation/client` 删除。3.x 用户将应用导入改为 `/runtime`，并清除 tsconfig 中的 `client` 类型项及旧生成的 `fulgurjs-runtime.d.ts`。
- 开发态 exposes 使用内部页面级代理；`remoteComponent()` 保持同步返回 Vue 组件。`remoteSchema` 静态具名导入由插件拆出，非开发环境为空清单。
- Vue 适配层与运行时内核分离，公开 ESM 图只引用一份 `runtime.js`。
- `/runtime` 只提供 ESM `import` 条件，使用时需安装 Vue；包根和 `/config` 的 CJS 条件不变。新入口沿用 3.0.x 实际 JS 门面的值导出，不提供 `runtime` 对象或 default（旧 `client.d.ts` 曾多声明这两项）。

| 旧应用写法 | 4.0.0 写法 |
|---|---|
| `virtual:fulgurjs-api`（3.0.x） | `@fulgurjs/federation/runtime` |
| `virtual:fulgurjs-runtime`（≤2.x） | `@fulgurjs/federation/runtime` |
| `@fulgurjs/federation/context`、`/pages`、`/vue`（≤2.x） | `@fulgurjs/federation/runtime` |
| `import remoteSchema from 'virtual:fulgurjs-remote-schema'` | `import { remoteSchema } from '@fulgurjs/federation/runtime'` |
| tsconfig `types` 中的 `@fulgurjs/federation/client` | 删除该项；类型由 `/runtime` 的包导出解析 |

## 3.0.1（2026-09-24）

### 修复

- **runtime-proxy 的 `parseSpec` 保持同步语义**：3.0.0 的 serve 门面把 runtime 部分转发到惰性单例委托时，`parseSpec` 也在 promise 转发列表里——同步纯函数经 promise 转发返回 Promise，返回对象的属性全部为 undefined。修复：`parseSpec` 同步直读页面级单例（时序契约同 shareScopeMap）。


## 3.0.0（2026-09-24）

### 破坏性变更：应用代码唯一 API 入口 `virtual:fulgurjs-api`

应用代码的一切联邦导入收敛为一个虚拟模块；旧入口从包 exports 白名单删除（import 即解析失败）。

**迁移映射**：

| 3.x 之前 | 3.0.0 起 |
|---|---|
| `import { loadRemote, … } from 'virtual:fulgurjs-runtime'` | `import { loadRemote, … } from 'virtual:fulgurjs-api'` |
| `import { provideAppContext, getAppContext, requireAppContext } from '@fulgurjs/federation/context'` | 同一来源改为 `'virtual:fulgurjs-api'` |
| `import { definePages, validatePages } from '@fulgurjs/federation/pages'` | 同一来源改为 `'virtual:fulgurjs-api'` |
| `import { remoteComponent } from '@fulgurjs/federation/vue'` | 同一来源改为 `'virtual:fulgurjs-api'` |
| `import remoteSchema from 'virtual:fulgurjs-remote-schema'`（default） | `import { remoteSchema } from 'virtual:fulgurjs-api'`（具名） |

不变（构建期/配置面，非应用代码导入）：`vite.config.ts` 的 `import { federation } from '@fulgurjs/federation'`、`fulgurjs.config.ts` 的 `import { defineRepoConfig } from '@fulgurjs/federation/config'`、tsconfig 类型入口 `@fulgurjs/federation/client`。`virtual:fulgurjs-runtime` 保留为插件内部实现细节（门面/容器入口/改写管线引用），不再是公开 API。

技术说明：serve 形态的门面对 runtime 部分转发惰性单例委托（远程页面导入不拉起副本链），prod 形态为静态 re-export（各副本经 `globalThis.__FULGURJS_RUNTIME__` 收敛）；`remoteComponent` 在 dev 下调用期惰性加载。类型声明整体聚合到 `virtual:fulgurjs-api`（`@fulgurjs/federation/client`）。

### 破坏性变更：2.x 全部旧入口不再可用

`@fulgurjs/federation/pages`、`./context`、`./vue` 子路径的 d.ts/typesVersions 映射同步删除。升级方式：全局搜索上述五个旧来源，按映射表替换为 `virtual:fulgurjs-api`（`fulgurjs init` 生成的模板与核对清单已全部是新写法）。


## 2.1.0（2026-09-23）

### 兼容性与健壮性强化（WP1~WP8，方案见 docs/兼容性与健壮性强化实施方案.md）

- **新增单一 API 入口 `virtual:fulgurjs-api`**：一个虚拟模块拿全联邦 API（runtime 全部公开函数 + `definePages` / `validatePages` + `remoteSchema`）；旧入口（`virtual:fulgurjs-runtime`、`@fulgurjs/federation/pages`、`virtual:fulgurjs-remote-schema`）全部继续可用且与新旧入口收敛同一运行时单例。
- **修复 auto-import 后置注入绕过门面化的一类缺陷**（WP1）：unplugin-auto-import 的 vite 适配器硬编码 `enforce: 'post'`，注册在 federation() 之后时其注入的 shared 导入会静态绑定本地副本（双响应性系统：ref 赋值不触发渲染）。修复 = 解析期兜底改道（已被本插件改写过的模块内后置出现的裸 shared specifier → 协商命名空间门面），与插件注册顺序无关。
- **manifest 契约**（WP4）：`fulgurjs-manifest.json` / dev manifest 携带 `schemaVersion: 1`；Node 侧消费端（dts / remote-schema probe / doctor）统一经契约校验器取数；未知主版本拒绝消费并给出诊断（不再静默当空 manifest）；2.0.x 无 schemaVersion 形态按 v1 兼容。
- **修复根相对 remote 地址的资产解析**（WP4）：`remotes: { x: { prod: '/xxx' } }` 目录形态 entry 下，manifest 相对资产此前解析到站点根（404）；现按 entry 所在目录解析。manifest fetch 增加 8s 超时。
- **dts 路径边界**（WP5）：dev manifest 的 `exposes[].src` 只接受相对路径（拒绝绝对路径 / `..` / 空）；`fsRoot` 与目标 realpath 后做包含判定（symlink 逃逸拒绝）；异常 remote 只跳过自身不落半截声明；生成声明中的模块名统一合法 TS 字符串序列化。
- **新增 `devCorsOrigins` / `devFsRoot` 选项**（WP5）：dev 跨源访问策略统一（插件端点与 server.cors 同一来源；用户显式 `server.cors` 永远优先；数组按 Origin 反射 allowlist）；`devFsRoot: false` 时 dev manifest 不携带本机路径。非 loopback host 下通配 CORS / fsRoot 暴露分别提醒（DEV-011 / DEV-012）。
- **运行时容错**（WP6）：注册表全部无原型字典（`__proto__` / `constructor` 等键不再误读误写原型链）；`registerRemote` 参数校验当场抛错（`timeout` 有限正数 / `retries` 0..10 整数 / `breaker` 有限正数；配置期 CFG-009 先拦）；熔断 `threshold`/`resetMs` 按 remote 生效（重复注册刷新参数、保留计数状态）；重试退避封顶 4s + 随机抖动；entry 动态 import 单一 in-flight（超时≠取消，慢成功后容器 init 恰一次）；promise remote 的解析受 timeout 约束；观测 hook（`beforeLoadRemote`/`afterLoadRemote`）抛错只告警不改写加载结果、决策 hook（`resolveShare`）抛错向调用方传播；MFU-001 错误信息对 URL 脱敏（去凭证与 query）。
- **新增 `parseSpec` 运行时导出**（WP7 顺带修复）：类型声明早已存在但 runtime bundle 未导出（导出面漂移），现补齐。
- **受控诊断 `DEBUG=fulgurjs:*`**（WP8，默认关闭）：`FULGURJS_DEBUG` / `DEBUG` 环境变量开启分类诊断（`transform` / `facade` / `manifest`，JSON → stderr）；模块路径脱敏（root 内相对路径、root 外仅文件名），不输出源码文本与凭证；替代一切 /tmp 临时日志。
- **错误码新增**：CFG-009（remote 运行参数非法）、CFG-010（devCorsOrigins 形态非法）、DEV-011 / DEV-012（非 loopback 暴露面提醒），总数 31 → 35（三方一致性门禁自动校验）。
- **测试与 CI**（WP1~WP3）：新增 fixtures `remote-auto` / `host-auto`（auto-import 插件链回归）；真实构建单测覆盖双引擎（Rollup 6.4.3 / Rolldown 8.3.0）× 双注册顺序 / manualChunks 对象/函数/无/数组四形态 / 危险环检测器 / manifest 资产存在性；prod-setup.sh 隔离改造（mktemp 专属目录、8999 被占自动选空闲端口、`--stop` 只停自己启动的实例）；CI 新增 prod-e2e（runner 内 NGINX）、vite5 每周定时兼容（vite@5.1.4）、tarball consumer smoke（npm pack → 临时 consumer → exports/类型/build/dev 加载）作业。


## 2.0.3（2026-09-23）

### 修复（production remote CSS manifest / preload）

- **修复 expose manifest 漏报 CSS**：Vite 可将 expose 导入的全局 CSS 归属到其静态依赖 chunk；此前插件只读取 expose facade 自身的 `viteMetadata.importedCss`，导致样式不进入 `fulgurjs-manifest.json`。现在在 `generateBundle` post 阶段递归收集 expose 静态依赖图中的 CSS，再写入对应 expose 条目。
- **修复根相对 remote 地址**：配置 `prod: '/lowcode'` 时也能生成 `/lowcode/fulgurjs-manifest.json`；保留绝对地址与协议相对地址的 origin/path 语义。
- **运行时按 expose 加载样式**：`loadRemote('remote/Expose')` 在 manifest 可用时预载该 expose 的 JS chunk 与 CSS，并等待 stylesheet load/error 后再返回模块；仅传 remote 名时保留预载全部 exposes 的行为。CSS 失败报告 `MFU-007`，不阻断 JS 模块加载。
- **补齐 build 后置转换**：build 阶段允许处理 pre 阶段标记过、但随后由 auto-import 等插件注入新 import 的模块；依赖 `transformModule` 幂等，serve 路径维持原有重复处理守卫。
- **回归验证**：覆盖静态依赖 chunk 持有 CSS、根相对 manifest URL、请求 expose 的 CSS 预载与等待行为；8662 实际运行态认证弹窗验收 computed `z-index: 5000`。

## 2.0.2（2026-09-22）

### 修复（D6：双向宿主 devSharedSelf 开启后 prod 构建产物 chunk 循环崩溃）

- **缺陷**：双向联邦宿主（既 expose 又消费 remote）按文档口径设置 `devSharedSelf: true` 后，
  `vite build` 成功但 prod 运行时崩溃——`SyntaxError: Unexpected token '<'`（chunk 被 SPA 回退）
  + `TypeError: _e is not a function`（协商函数未初始化）。仅在「宿主 + 用户 manualChunks 强制
  分组（对象/函数形式）」组合下触发（实测 mes-zc admin：vue-vendor ⇄ antd-vue-vendor 环）。
- **根因**：`devSharedSelf` 使 node_modules 参与门面化，被 manualChunks 强制分组的包
  （如 vue-vendor 组内 vue-router）内部的 shared 导入被改写为协商门面；门面为静态
  `import` 运行时的 TLA 模块，被 rollup 按消费方归组拖入其他强制组 → 跨组静态环 →
  门面 TLA 求值顺序错位。
- **修复 1（门面形态参数化，virtual.ts）**：`genSharedFacade` / `genSharedNsFacade` /
  `genBindingFacade` / `genRemoteBindingFacade` 新增 dynamic 形态——门面对运行时与 shared
  本体的依赖全部改为 TLA 内 `await import(...)`，命名空间门面以 `{ ...ns }` 复制阻断 rollup
  透传内联——门面 chunk 对外零静态依赖（"汇"形态），与任何 manualChunks 分组正交，不可能成环。
  **dynamic 仅在 devSharedSelf 宿主（build）启用；其余一切场景（纯 remote、dev serve）保持
  2.0.0 静态形态，产物与行为零变化**（硬约束；纯 remote 若启用动态化会在自动分包下出现
  「门面 TLA → 动态 import 本体 chunk ← 静态 import 门面」死锁，实测确认）。
- **修复 2（shared 闭包静态化，transform.ts + index.ts）**：devSharedSelf 宿主（build）下，
  provide 键本体闭包内的模块（如 vue-router 包、vue-demi 转发层——经 shared 本体文件解析
  传递依赖）对 shared 键的导入**不做门面化**（同一 provide 闭包天然同实例）——斩断
  「fallback 动态 import 本体 chunk ← 本体消费方静态 import 门面」的 TLA 混合环（实机死锁：
  页面停在骨架屏、零报错）。别名转发层的 `export * from <key>` 因此保持静态、不再触发
  ESM 门面化硬报错。纯 remote 不启用，行为零变化（硬约束）。
- **修复 3（manualChunks 包装注入，index.ts）**：devSharedSelf 宿主 + 用户配置了
  manualChunks 时，插件包装注入归组函数——运行时隔离进 `fulgurjs-runtime` 组、协商门面按
  shareKey 隔离进 `fulgurjs-shared-<key>` 组、远程绑定门面进 `fulgurjs-remote-facades-*` 组。
  对象形式的 specifier 解析延迟到 buildStart（走完整解析管线含 alias），解析失败丢组并告警。
- **修复 4（post 阶段 auto-import 兜底，index.ts）**：build 下 post.transform 不再跳过非
  `.vue` 文件——unplugin-auto-import 等后置插件注入的 `import { ref } from 'vue'` 发生在
  pre.transform 之后，此前会绕过门面化、静态绑定本地 vue 副本，与协商实例形成**双响应性
  系统**（实测：同一组件内 A ref 的赋值不触发渲染、B ref 的赋值正常；jsdelivr 级表现即
  「弹窗 model 置 true 却不渲染」）。pre 已改写过的文件由 `isPluginProcessedModule` 守卫
  拦下，不会双重改写。
- **新增诊断**：`BLD-006`——output 为数组形态时无法自动注入，三段式提示手工加隔离分支。
- **集成器**：宿主为双向（有 exposes 且有 remotes）时 vite.config 模板产出
  `devSharedSelf: true`（落实 README 口径；须配合本版插件使用）。
- **测试**：+10（门面 dynamic/static 双形态断言 ×6、真实 vite build 产物形态用例 ×1——
  覆盖「宿主 + devSharedSelf + manualChunks 对象形式」这条此前零覆盖的路径，断言产物无环、
  门面隔离、"汇"形态、node_modules 门面化指向隔离 chunk；post 兜底源码契约 ×3）。

### 已知边界

- devSharedSelf 宿主的协商门面 chunk 集中在插件专属组：与「门面分散在各业务 chunk」的
  旧形态相比，首屏会多下载所属 shareKey 的门面 chunk（未压缩量级 = 门面行数，gzip 后显著
  缩小）；这是换取「与 manualChunks 共存」的结构性代价。
- 入口文件（index.html 直引的模块）内的 remote 导入在 build 下不参与改写（入口只内联 init
  即短路返回，既有边界）：remote 导入请放在非入口模块。

## 2.0.1（2026-09-22）

### 变更（文档与包面，零运行时变化）

- **README 补全公开类型/函数名**（对齐「README 写全所有 API」）：`FederationOptions`、
  `PageRouteLike` / `PagesOptions` / `PageViolation` / `RemoteSchemaEntry`、
  `RepoConfig` / `UserConfig` / `AppConfig` / `HostConfig` / `RemoteConfig` / `DeployConfig` /
  `PageEntry` / `RemoteAddress`、`loadRepoConfig`；§1 与 §4 的 import 示例带上类型。
- **peer 下限对齐实测值**：`vite` `>=5.0.0` → `>=5.1.0`（历史兼容矩阵实测下限为 5.1.4）。
- **发布物收窄**：移出内部草稿 `docs/vite-upstream-issue-irregexp.md`（仅存档性质，非用户文档）。
- **仓库公开面整理**：8 个内部工作文档（已执行的 0.9.0 任务书、Trusted Publishing 迁移清单、
  改进项评估、三个设计方案、qiankun 调研、上述草稿）移入 `docs/_workspace/`（本地工作区、不入库），
  `docs/` 只保留面向用户的四个文档；相关代码注释与 CHANGELOG 引用同步修正，全仓零失效引用。
- 两处过时文档元数据修正：webpack-mf 对照文档的版本戳、vite-upstream 草稿的断链引用与失效 commit 号。

## 2.0.0（2026-09-22）

### 破坏性变更（公开 API 去掉冗余品牌前缀，无兼容别名）

背景：包名与子路径已承担命名空间职责（`@fulgurjs/federation/context` 等），标识符再挂 `Fulgurjs`
前缀属纯冗余，且长度失控（`provideFulgurjsAppContext` 达 26 字符）。本版统一去前缀，**旧名直接移除**。

| 子路径 | 旧名 | 新名 |
|---|---|---|
| `/context` | `provideFulgurjsAppContext` | `provideAppContext` |
| | `getFulgurjsAppContext` | `getAppContext` |
| | `requireFulgurjsAppContext` | `requireAppContext` |
| | `FulgurjsAppContext` | `AppContext` |
| `/pages` | `defineFulgurjsPages` | `definePages` |
| | `validateFulgurjsPages` | `validatePages` |
| | `FulgurjsPagesOptions` / `FulgurjsPageRouteLike` | `PagesOptions` / `PageRouteLike` |
| `/config` | `defineFulgurjsConfig` | `defineRepoConfig` |
| | `loadFulgurjsConfig` | `loadRepoConfig` |
| | `FulgurjsRepoConfig` / `FulgurjsAppConfig` / `FulgurjsUserConfig` | `RepoConfig` / `AppConfig` / `UserConfig` |
| | `FulgurjsHostConfig` / `FulgurjsRemoteConfig` / `FulgurjsDeployConfig` | `HostConfig` / `RemoteConfig` / `DeployConfig` |
| | `FulgurjsPageEntry` / `FulgurjsRemoteAddress` | `PageEntry` / `RemoteAddress` |
| 主入口 | `FulgurjsOptions` | `FederationOptions` |
| 运行时 | `FulgurjsRuntime`（类型） | `FgRuntime` |
| | `FulgurjsError`（内部类，仅经 `err.name` 可见） | `FgError` |

两处命名取舍：

- `defineRepoConfig` 而非 `defineConfig`——避开与 vite 的 `defineConfig` 撞名（`fulgurjs.config.ts`
  描述的是「一个仓库的多个应用」）。
- 运行时错误 `err.name` 由 `FulgurjsError` 变为 `FgError`：该类不在导出面（用户从不 import，
  只经 `err.code` / `err.name` 观察），若有按 `name` 匹配错误的监控配置需同步。`err.code`（MFU-xxx 等）
  语义与取值不变。

### 刻意保持不变的品牌元素

- **跨应用单例键** `globalThis.__FULGURJS_RUNTIME__` / `__FULGURJS_APP_CONFIG__` / `__FULGURJS_SCOPE__`：
  跨版本互操作契约——改了会让新旧版本互相看不见对方的运行时与 context 存储。
- 虚拟模块 `virtual:fulgurjs-runtime`、CLI `fulgurjs`、配置文件 `fulgurjs.config.ts`、错误码前缀 `[fulgurjs:MFU-001]`。
- 运行时函数名（`loadRemote` / `loadShare` / `preloadRemote` / `registerRemote(s)` / `initSharing` /
  `getContainer` / `getRuntime` / `unwrapDefault` / `parseSpec`）：对齐 webpack Module Federation 命名，便于迁移对照。

### 迁移

按上表把旧名替换为新名即可，语义一一对应、无行为变化。注意 `provide/get/requireFulgurjsAppContext`
三个是「含前缀的完整函数名」，新名为 `provide/get/requireAppContext`（去的是 `Fulgurjs` 与 `AppContext`
之间的品牌词，`AppContext` 保留）。

## 1.0.0（2026-09-22）

### 破坏性变更（正式定版，API 面冻结）

- **删除旧配置 API**：`provideFulgurjsAppConfig` / `getFulgurjsAppConfig` 从 runtime、虚拟门面
  （`virtual:fulgurjs-runtime` 委托模块）、`client.d.ts` 类型面全部移除——跨应用传值**唯一通道**为
  `@fulgurjs/federation/context` 的 `provideFulgurjsAppContext` / `getFulgurjsAppContext` /
  `requireFulgurjsAppContext`。存储本体即全局镜像对象 `window.__FULGURJS_APP_CONFIG__`（不再经
  runtime 转发），runtime 包体相应缩减。
- 迁移：全局搜索 `provideFulgurjsAppConfig` / `getFulgurjsAppConfig` 替换为 context 子路径对应函数
  （语义一一对应，仅函数名与导入路径变化）。

### 清理（无历史遗留）

- **移除 `docs/manual.html`**（早期手册的历史存档，其引用的截图已不在仓库）——README 为唯一权威文档。
- 设计文档状态勘误：D.2 / D.4 / D.5 已实施项的状态标记修正（原标注"待执行/未实现"）。


## 0.9.0（2026-09-21）

### 新增（发布可靠性 + IDE 边界 + 配置面）

- **`dts: { mode: 'source' | 'shim' }`**（默认 `source`，行为不变）：`shim` 形态的类型声明不引用跨工程源文件（宽松占位），根治 VSCode/Volar 打开 `types/*.d.ts` 时的跨工程诊断红波浪线；取舍为无源码级补全/跳转（README §9.1.5）。
- **`fulgurjs.config.ts` 新增 `host.prefetch: 'all' | string[] | false`**（默认 `'all'`，行为不变）：空闲预载名单成为正式配置面，init 生成 bridge.ts 时注入 `PREFETCH_REMOTES` 常量（README §9.1.3）。
- **`npm run typecheck:latest`**：用最新 TypeScript + vue-tsc 对 `tests/types-repro/` 典型消费形态做类型回归——根治"工程内旧 TS 绿、用户 IDE（新 TS）红"的盲区（0.8.2 的 EP locale ts2345 即由此暴露）。
- **CI 流水线**：`.github/workflows/ci.yml`（push/PR：单测 + 双口径 typecheck + build/gzip 门禁）与 `.github/workflows/publish.yml`（GitHub Release 触发 `npm publish --provenance`，Trusted Publishing 迁移已完成）。

### 变更

- **gzip 门禁真实化**：`scripts/check-gzip.mjs` 接入 build（阈值 ≤6144B，实测基线 5232B）；`version.ts` 注释口径修正（原"≤5120 CI 守卫"与事实不符）。
- **发布物移除 `docs/manual.html`**（早期手册，内容停留在较早形态，避免双源漂移）：本 README 为唯一权威文档；仓库内文件保留为历史存档。

### 修复

- types-repro 样例集 + `buildShimModule`/`resolveDtsMode` 单测（单测 183 → 188）。

## 0.8.4（2026-09-21）

### 文档（README / 迁移指南全面清理历史沿革表述，只保留当前形态，零代码变化）

- 删除全部"X.X 起 / 原规则已废除 / 早期版本~~删除线~~"式版本沿革叙述（静态导入改写、目录默认值、
  缓存自动清理、三B-1 历史段等十余处）——使用文档只描述当前行为，版本史归 CHANGELOG。
- 特性列表与 API 参考标题去除版本后缀（"（0.7.0 起）/（0.8.0 起）"）；deprecated 标注保留（当前事实），
  去"0.9 删"类未来预告。
- 语句复核：快速开始的运行时导入说明重写为单句当前形态。

## 0.8.3（2026-09-21）

### 文档（README §9.1 / 迁移指南三E 重写为标准配置参考格式，零代码变化）

- 按成熟开源库的 Options Reference 体例重写：每个能力给出**配置项名 / 类型 / 默认值 / 配置位置**四要素，
  配「开启 / 关闭 / 自定义」三态可运行示例与行为边界清单——替换原先「默认开启、可关闭」式的行为性描述。
- 新增 §9.1 配置面总览表（能力 × 配置项 × 类型 × 默认值 × 配置位置）。
- 骨架屏如实标注为「无配置项」并列出内置参数（`loadingComponent` / `delay: 200ms` / `errorComponent`），
  自定义路径指向 §8 `remoteComponent`；诊断面板标注「无配置项」并给出 prod 访问路径。

## 0.8.2（2026-09-21）

### 修复（类型兼容，用户 IDE 实测暴露）

- **`provideGlobalConfig(getFulgurjsAppContext(), app)` 的 ts(2345)**：EP `ConfigProviderProps.locale`
  为 `Language` 类型，context 的 `locale` 按设计是 `unknown` 扩展位——集成模板三处消费端
  （宿主桥 + bpm/lowcode federatedBoot）改为 `as Record<string, any>` 断言（消费端按 UI 库形状收窄）。

### 精简（AppContext 默认 provide 9 键 → 6 键，用户反馈"互相传的东西太多"）

- **`token` 一次性快照移出默认 provide**：与 `getToken` 函数引用重复且会过期（拉取式永不过期）；
  `FulgurjsAppContext` 类型同步删除 `token` 字段。取值一律 `getToken()`。
- **`formUrl` / `baseUrl` 移出默认 provide**：自 0.7.0 `remoteComponent` 直渲染（iframe 通道删除）后
  无消费点。项目如需可经扩展位 `[key: string]: unknown` 自行提供。
- 取证依据：testbed 全量 grep 上述三键零消费（除 bridge 传参本身）；`user` / `getToken` / `store` /
  `hostApp` / `locale` / `events` 六键各有真实消费点（boot 双注入 / EP 注入 / 方法池 / 组件注册），保留。
- 单测同步（扩展位语义用例）；README §9 示例与字段表、迁移指南三C 同步。

## 0.8.1（2026-09-21）

### 文档（0.8.0 使用文档补齐，零运行时变化）

- **README 新增 §9.1「乾坤功能融合三件套 + 联邦诊断面板」**：A 保活（`keepAlive: true` 页面级配置、include 白名单与 max=8 语义、默认关的原因）/ B 骨架屏（内置自动，无需配置）/ C 空闲预载（`PREFETCH_REMOTES` 开关）/ D 诊断面板（`/fulgurjs-demo` 六块内容表）/ E IDE 说明。
- **README §9 方法模块补端到端示例**（exposes 声明 → api.ts 纯函数 → loadRemote 调用三步）。
- **迁移指南新增「三E 乾坤融合三件套 + 诊断面板」速查表**（配置入口/默认值/行为），含 IDE 提示。
- **IDE 说明**（同入每应用 `src/fulgurjs/README.md` 模板）：`types/*.d.ts` 生成物在 VSCode/Volar 打开时可能显示跨工程「找不到模块 '@/...'」波浪线（推断项目检查工程外 .vue 的显示问题）——命令行 `vue-tsc --noEmit` 走本应用 tsconfig 为 0 错误，构建不受影响；升级后 context 导入报 ts(2307) 为 IDE 旧包缓存，Restart TS Server 即消。
- 修复：集成器 pages.ts 模板注释与现场对齐（`defineAsyncComponent` 不支持 `name` 选项的表述清理）。

## 0.8.0（2026-09-20）

### 新增（跨应用传值与方法引用收编 + 乾坤功能融合，设计文档定稿后实施）

- **`@fulgurjs/federation/context` 新子路径（~2KB 独立文件，与 `./vue` 同模式）**：
  - `provideFulgurjsAppContext(config)`——宿主桥一次性写入跨应用上下文（merge 语义，幂等可多次，后写覆盖）；
  - `getFulgurjsAppContext()`——读快照（传输层快照 + 函数引用，非响应式，与乾坤 props 同语义；嵌套对象如 `events` 引用共享）；
  - `requireFulgurjsAppContext(...keys)`——远程 boot 显式校验消费：缺任一键 → **`CC-001`** 三段式抛错（got/expected/example 指向宿主桥），页面无运行时单例（独立直开远程页）→ **`CC-002`** 显式（修法 = 经宿主联邦加载）；
  - `FulgurjsAppContext` 类型（标准字段表：`user` / `token` / `getToken` / `store` / `hostApp` / `locale` / `events` + `[key: string]` 项目扩展位）随子路径与 `client.d.ts` 双发布。
- **方法引用一等公民两条通道**：① context 携带函数引用（`getToken` / `events.main.getDictItems` 高频热路径直调、子应用反向注册 `events.bpm.formEvent`）；② exposes 方法模块 `loadRemote('remote/api')`（低频/重逻辑跨应用调用，dts 类型直连自动覆盖）。
- **架构边界（gzip 红线不破）**：runtime.js 逻辑 0.8.0 **零改动**（仅版本常量随版本走）——context 子路径内部经 `globalThis.__FULGURJS_RUNTIME__` 单例委托运行时既有方法，存储与旧 W4（`__FULGURJS_APP_CONFIG__`）同一份。
- **旧名 deprecated**：`provideFulgurjsAppConfig / getFulgurjsAppConfig` 继续可用（存储同一份），`client.d.ts` 与 README 标 `@deprecated` 指向新名，0.9 删除。
- **错误码总表 30 → 32**：新增 CC 段（`CC-001` context 必需字段缺失 / `CC-002` 运行时单例不可用）。

### 文档（乾坤功能融合配套，全部宿主/模板侧，插件 runtime 零改动）

- README 特性声明新增「CSP 友好（原生 ESM 无 eval）」；新增 §9 AppContext API 参考（字段表/时序契约/方法模块规范）；迁移指南新增「跨应用传值」节与「页面卸载清理清单」节（乾坤 unmount 强制清理的联邦等价物：`onUnmounted` 摘除 window 级监听/定时器/context.events 反向注册）。
- 乾坤功能融合三件套（保活 keep-alive 白名单 / 页面加载骨架屏 / 空闲预载编排）与联邦诊断面板均为**集成器模板/宿主项目侧**能力，用法见迁移指南与 `fulgurjs.config.ts` 模板注释；调研依据：16 项逐项对照（：9 项已有、4 项与架构哲学冲突不搬、3 项值得搬 + inspector 概念轻量化落地）。

## 0.7.1（2026-09-20）

### 修复（TS 子路径类型兼容，demo-app testbed 用户 IDE 实测暴露）

- **`typesVersions` 子路径类型映射**：`moduleResolution: "node"`（node10 语义，vben/jeecg 一代工程常见，如 TS 4.9 + `moduleResolution: "node"`）不读 package.json `exports`，`import ... from '@fulgurjs/federation/pages'` 报 ts(2307)。新增 `typesVersions` 把 `./pages` / `./config` / `./vue` 映射到对应 `dist/*.d.ts`——TS 3.1+ 任意解析模式可用；TS ≥4.7 的 bundler/node16 仍走 `exports`，两者互不冲突。运行时无任何变化（Vite 一直认 exports）。
- 新增清单防漂移测试（exports 子路径 ↔ typesVersions ↔ 磁盘 d.ts 三方一致）。

## 0.7.0（2026-09-20）

### 新增（Vue 直渲染 API，设计文档定稿后实施）

- **`remoteComponent(spec, opts)`（`@fulgurjs/federation/vue` 子路径）**：远程组件直渲染的标准封装——`defineAsyncComponent({ loader: () => loadRemote(spec, opts).then(m => m.default ?? m) })`。选项：`loadingComponent` / `errorComponent`（不传时内置错误占位：错误码+根因+修法三段式）/ `retries`（透传 loadRemote）/ `delay` / `timeout`。H3 零兜底：加载失败显式进错误态，`fulgurjs:error` 事件照常发出；模块去重沿用 loadRemote Promise 缓存；`vue` 为可选 peerDependency。
- **架构边界**：runtime.js 保持框架无关（不 import vue），gzip 红线零增量——Vue 封装独立子路径文件、按需引入。

### 变更（集成模板与文档）

- **集成器 detail 页模板简化**：30 行 D.1 防御式样板（`globalThis.__FULGURJS_RUNTIME__` 单例 + 手动 try/catch + shallowRef）替换为一行 `remoteComponent(spec)`；**删除 `isFederatedRealm()` + iframe 乾坤旧通道**（H3 零兜底 + 新插件定位，用户拍板）。后果：乾坤基线（如 8661）详情页表单区随 iframe 通道下线降级为存档；独立直开远程页从静默 iframe 改为显式错误态。
- 迁移指南「三B-1 远程页面如何取宿主运行时」更新：0.4.1 起静态导入已是标准（自动惰性单例代理），globalThis 直取降级为特殊场景；坑 #10 同步改写。
- README API 参考新增 §8（remoteComponent 选项表与语义）。

## 0.6.2（2026-09-20）

### 变更（目录结构定稿，宿主应用补齐）

- **宿主应用的桥接文件归位 `src/fulgurjs/host/`**（原散在文件夹根部）：`bridge.ts`（token/用户/EP locale 桥）+ `pages.ts`（联邦页面路由表）——三应用形态统一为「按角色子目录」（远程=exposes/，宿主=host/，人人有 types/）；每个应用 `src/fulgurjs/` 内附 README.md 说明各子目录归属与手改边界（迁移工具自动生成）。
- 迁移指南「目录约定说明」同步 host/ 结构。

## 0.6.1（2026-09-20）

### 修复（发布面）

- **包内 README/CHANGELOG 与 0.6.0 行为对齐**：0.6.0 构建时打包的仍是 0.5.9 文案（默认目录写成 `.fulgurjs/types`）——实际行为已改为 `src/fulgurjs/types/`。npm 文档以本版为准。

## 0.6.0（2026-09-20）

### 变更（默认值，目录统一）

- **dts 生成目录默认 `src/fulgurjs/types/`**（src 布局项目 tsconfig 零配置生效；无 src 布局回退根目录 `.fulgurjs/types`；`dts: { dir }` 可覆盖）——联邦所有产物集中 `src/fulgurjs/` 一个文件夹（用户评审定稿）：`types/`=插件生成（勿手改），`exposes/`=迁移工具脚手架的用户代码（联邦启动引导 + 暴露组件）。防火墙原则不变：插件只写 `types/`，绝不触碰用户文件。
- 迁移指南「目录约定说明」同步：宿主侧桥接文件等脚手架约定可按团队习惯重组。

## 0.5.9（2026-09-20）

### 变更（默认值，src 零污染）

- **dts 生成目录默认收敛到根目录 `.fulgurjs/types/`**（原 `src/fulgurjs-types/`，Nuxt `.nuxt` 同款体验）：插件的自动生成物不再出现在用户 src 里；tsconfig `include` 加一行 `".fulgurjs"` 即全量生效（远程模块类型直连 + 运行时类型垫片）。`federation({ dts: { dir } })` 可自定义/回退旧位置。迁移方式：删除旧目录 → 升级后重启 dev → tsconfig include 换成 `".fulgurjs"`。
- 迁移指南新增「目录约定说明」：`src/fulgurjs-exposes/` 等为迁移工具脚手架约定而非插件要求，可按团队习惯重组。

## 0.5.8（2026-09-20）

### 修复

- **dts 具名枚举的 as 别名**：`export { a as b }` 导出名取别名 b（0.5.7 误取原名）。

## 0.5.7（2026-09-20）

### 修复

- **dts 生成：环境模块改显式具名重导出**——`declare module` 里的 `export *` 不转发具名导出（TS 实测限制，远程 TS 模块类型直连为空）。生成时枚举源文件顶层具名导出，输出 `export { names } from`（正则面枚举 const/let/var/function/class/interface/type/export{}，含 as 别名）；无可枚举名退回 export * 保副作用导入。

## 0.5.6（2026-09-20）

### 修复

- **dts 生成：非 .vue 源码的 re-export 去掉 `.ts` 扩展名**——TS 默认禁止 `.ts` 后缀导入（需 allowImportingTsExtensions），带后缀的 `export * from "x.ts"` 在用户 skipLibCheck 下静默解析失败 → 远程 TS 模块（如共享状态文件）类型直连为空。.vue 保留扩展名（SFC 解析必需）。

## 0.5.5（2026-09-20）

### 修复

- **client.d.ts 改 script 形态**：0.5.3/0.5.4 的声明文件顶层含 export interface → 整个文件成为 module，其中的 `declare module` 退化为 augmentation 被静默忽略（TS 环境声明必须住非 module 文件）——全部类型内联进 declare module 块，垫片加载即全局生效。对外类型仍经 `virtual:fulgurjs-runtime` 导出（`import type { LoadRemoteOptions } from "virtual:fulgurjs-runtime"`）。

## 0.5.4（2026-09-20）

### 修复

- **类型垫片改 import 式**：0.5.3 生成的 `fulgurjs-runtime.d.ts` 用 `/// <reference types>` 指令指向包内声明，实测该指令解析不了 npm 包子路径（TS 5.6/vue-tsc 实证），垫片不生效——改用副作用 import 加载 `@fulgurjs/federation/client`（client.d.ts 本体不变），include 目录即生效。

## 0.5.3（2026-09-20）

### 修复（TS 体验）

- **`virtual:fulgurjs-runtime` 类型声明随包发布**：包内新增 `client.d.ts`（exports `./client`），运行时全部导出（loadRemote/loadShare/preloadRemote/registerRemote*/getRuntime/version 等 17 项）带完整签名；此前用户按 README §2 导入运行时 API，TS 报 `Cannot find module 'virtual:fulgurjs-runtime'`。dev 启动时插件还自动在 `src/fulgurjs-types/fulgurjs-runtime.d.ts` 生成引用垫片——include 该目录（远程模块类型直连本就要求）即零配置生效。+4 单测（守声明面与 runtime.js 导出面漂移，162/162）。

## 0.5.2（2026-09-20）

### 修复

- **dev 下 `preloadRemote` 注入的 expose 链接全部 404（npm 深度验证轮发现）**：dev manifest 的 `exposes[].file` 曾写 dts 类型直连的虚拟路径 `/@fulgurjs-src/...`（dts 实际只消费 `fsRoot`+`src`），而 `preloadRemote` 读同一字段注入 `<link rel=modulepreload>`——dev 下每个 expose 预载 404、预载完全无效。现改为真实可请求的模块 URL（与 dev 容器 `get` 的裸 URL 同款，含 base 前缀）；prod 不受影响（file 本就是产物路径）。+1 回归单测（158/158）。

## 0.5.1（2026-09-19）

### 修复

- **宿主页面「虚拟运行时导入 + 远程动态导入」混用漏改写（真实 npm 用户验证轮发现）**：post 阶段防双重生成守卫原先按「代码含 `virtual:fulgurjs-runtime` 字样」一刀切跳过，导致同一文件里合法导入 `loadRemote`（README §2 标准用法）后再写 `import('remote-a/X')`（README §1 标准用法）时远程导入漏改写，dev 下 vite:import-analysis 直接 500。现改为按插件生成物特征精确判定（代理化导入 `virtual:fulgurjs-runtime-proxy` / 改写助手 `__fulgurjs_loadRemote`·`__fulgurjs_loadShare` / 构建入口注入标识 `/* fulgurjs:init */`），用户混用照常工作；补 4 组单测（157/157）。

### 变更（发布面）

- **README 双端导航统一**：README 内 8 处文档相对链接（manual.html×4 / 迁移指南 / webpack MF 对照 / 沙箱边界审计 / DESIGN）改为 GitHub 绝对 URL——npm 页面与 GitHub 点击行为一致（npm 不解析包内相对链接，此前在 npm 上全部 404）。

## 0.5.0（2026-09-19）

### 变更（品牌全面对齐，breaking）

- 全品牌从 `fulgur` 对齐为 **`fulgurjs`**（npm 上 fulgur 组织名被占用）：
  - CLI 命令：`fulgur` → **`fulgurjs`**（`npx fulgurjs init` / `npx fulgurjs doctor`）
  - 虚拟模块：`virtual:fulgur-runtime` → **`virtual:fulgurjs-runtime`**（代理模块同步更名）
  - 全局单例：`__FULGUR_RUNTIME__` → **`__FULGURJS_RUNTIME__`**（`__FULGURJS_APP_CONFIG__` / `__FULGURJS_SCOPE__` / `__FULGURJS_INFO__` 同步）
  - 产物文件名：`fulgur-remoteEntry.js` / `fulgur-manifest.json` → **`fulgurjs-remoteEntry.js`** / **`fulgurjs-manifest.json`**（NGINX 规则同步更名）
  - 配置文件：`fulgur.config.ts` → **`fulgurjs.config.ts`**；错误前缀 `[fulgur:*]` → `[fulgurjs:*]`；运行时事件 `fulgur:error` → `fulgurjs:error`
  - GitHub 仓库：**fulgurjs-federation**（旧地址自动重定向）
- 升级方式：0.4.x 用户全局替换 `fulgur` → `fulgurjs`（导入/全局名/NGINX 文件名/CLI 命令）即可。

## 0.4.2（2026-09-19）

### 修复（npm 发布面）

- **npm 包内 README 与仓库 README 是两个文件**——包内是 4.7kB 旧版（无 API 参考）。现在构建时自动以仓库根 README（含完整 API 参考）为准，npm 页面与 GitHub 展示一致。
- npm 包自带完整文档：docs/manual.html（使用手册）、迁移指南、webpack 对照、沙箱审计、兼容矩阵、CHANGELOG、DESIGN、examples 起步样例——包内 README 的相对链接在 npm 上不再 404。

## 0.4.1（2026-09-19）

「让插件自动处理，而不是让用户记住规则」——两条使用规则自动化，使用面大幅简化。

### 变更（规则自动化）

- **任何文件都可以直接 `import { ... } from 'virtual:fulgurjs-runtime'`**（原 DEV-008 规则自动化）：
  exposes 目标文件（远程页面）里的静态导入，dev 下由插件自动改写为惰性单例委托模块
  （求值期零副作用、调用期转发页面级运行时单例）。用户不再需要知道
  「宿主/远程页面取运行时的不同姿势」，0.4.0 的手工 globalThis 写法已无需使用。
- **插件升级后重启 dev server 即可**（原 DEV-009 规则自动化）：dev server 启动时插件自动
  检测版本变化并清除本应用 node_modules/.vite 预构建缓存，无需手工 rm -rf。

### 修复

- runtime 两个存量 TS 断言错误（as Error → as FulgurjsError）与 fallback 源码契约断言同步。

## 0.4.0（2026-09-18）

开箱即用批次（A→E）全部落地；W7 发布链按用户指示顺延（未发布 npm）。

### 新增
- **CLI（主包内置 bin `fulgurjs`）**
  - `fulgurjs init`：起步模板（带注释的 `fulgurjs.config.ts`：宿主/远程/页面路由表/部署形态，
    单文件可入库可复跑）+ 配置校验（CFG 三段式报错）+ 输出可直接粘贴的样板
    （各应用 federation() vite 块、NGINX no-cache 站点模板、通用接入核对清单）；
    **项目无关**——不内置任何具体项目的模板、锚点或文件改写
  - `fulgurjs doctor`：部署面体检——remoteEntry/manifest/index.html 的 200/no-cache/JS 形态、
    CORS、chunk 抽样可达（含 index.html 引用与一跳下钻、200-HTML 回退伪装识别）、
    版本协商 skew 预演、`--dev` 模式端口/容器入口探测；`--json` 供 CI
- **W4 跨应用全局配置协商**：runtime 新增 `provideFulgurjsAppConfig` / `getFulgurjsAppConfig`
  （页面级单例、浅合并、globalThis 镜像）——EP locale/size 类跨副本配置的机制化收编
- **W5 诊断补码**：CFG-007（remotes 对象形式误用 name@ 前缀）、CFG-008（shared 非法组合）、
  DEV-010（dev 冷启动预构建窗口提示）；BLD-003 必填 props 扫描器（按实测降级为手册核对项）
- **W8 验证基建**：持久 profile 重部署用例（复刻 immutable 缓存坑）、full-verify 失败自动归因、
  func-results 联动归档

### 修复
- **U-7 裸门面**：`genSharedFacade` 改枚举式再导出——rolldown 产物下 `export *`+TLA 展开致
  命名绑定全 undefined（provider 注册后 loadShare 拿到的命名空间只有 default）；
  生成物级核对 494 个导出名全部进入赋值回调；bare 导入 prod 实测通过

### 变更
- **插件去项目化（2026-09-19 定调）**：移除 init 中曾内置的具体项目集成模板/锚点/补丁
  （历史实现见 git 历史）；`fulgurjs init` 重写为纯通用脚手架，配置 schema 同步精简。
  插件为所有项目服务，不做任何单一项目的形状。
- runtime gzip 5212 B（红线 ≤5250 内）；单测 148/148；错误码 30 个全量文档对齐
