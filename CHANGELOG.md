# Changelog

## 6.3.1

两阶段发布的最终交付版本：插件运行时代码与 6.3.0 完全一致，唯一内容差异是包内五模板资产升钉 6.3.0（依赖声明、`minimumReleaseAgeExclude` 与锁文件，已逐模板冻结安装与构建验证）。`fulgurjs create` 生成的工程从此依赖 6.3.0，与 GitHub 模板逐字节同源。规则见 docs/maintainers/releasing.md「模板依赖与两阶段发布」。

## 6.3.0

### 变更

- **CHANGELOG 历史条目精简为变更摘要**：删除早期版本条目中的旧 API 教程、迁移文档引用与验收流水账；完整历史细节可查对应版本的 Git tag。
- **DESIGN.md 重写为当前设计决策**（品牌/已锁定决策/文档口径），早期"100% 对齐 webpack"设计方案与里程碑记录移除；维护者架构导读（docs/maintainers/architecture.md）改为独立有效的架构文档。
- **发布流程成文两阶段规则**（docs/maintainers/releasing.md）：基础版本 B → 模板升钉 B 并重锁 → 最终交付版本 C（包内模板=B，运行时与 B 零差异）；消除「模板必须钉本版本」与「允许钉旧版」并存的矛盾口径。
- CLI `create`/`init` 成功输出中的命令提示统一为 `npx @fulgurjs/federation <命令>`（与文档一致；npm 上不存在 `fulgurjs` 包名）。

## 6.2.0

面向对外提供的第一版公开文档整理与公共面收敛。应用代码与模板工程无需任何代码改动；仅当你引用过下列弃用面时需要调整。

### 公共面清理（破坏性）

- **删除弃用类型别名 `RemoteInput`**（`/runtime`、`/vue`、`/react` 三入口的 type 导出面）：改用 `RemoteConfig`（签名包含 RemoteInput 的全部公开字段）。该别名自标注 deprecated 起无任何内部消费。
- **`fulgurjs init` 移除 `--template` 兼容写法**：此前按 `--out` 解释并打印更名提示；现在显式报错（退出码 2）并给出 `--out` 修法。
- **删除 exports 中的 `./internal/bridge-router-core.js` 死映射**：正式包 dist 中该映射目标文件不存在（构建分块内联），且全仓无任何消费者——声明子路径只会让直接引用它在解析期失败。internal 子路径本就不承诺公开兼容。

### 文档

- 公开文档全面清理为当前产品形态：删除迁移指南与"入口一览/旧入口已删除/旧文档去向/Legacy 英文参考"等全部面向过去的段落；仍有价值的知识（qiankun 概念映射、页面卸载清理清单、首次接入避坑）迁入快速上手/远程页面/排错文档。
- 中英文文档统一为同一套当前合同，移除"英文过时以中文为准"类声明；修复全部死链接与锚点拼写（含 CONTRIBUTING/SECURITY/DESIGN/maintainers 对照表）；`npx fulgurjs <cmd>` 统一改为 `npx @fulgurjs/federation <cmd>`（npm 上不存在 fulgurjs 包名，未安装依赖的工程里旧写法 404）。
- 快速上手补首次接入的真实坑：pnpm ≥11 默认 24 小时发布冷却（minimumReleaseAge）、pnpm 12 allowBuilds 占位提示、桥接宿主须同时安装双框架的例外说明。
- examples：showcase 模板 README 修正旧版本号与旧入口引用；templates/README 版本口径改为与模板 package.json 一致；删除"原目录迁移"映射表。

### 修复

- **exports 发布完整性回归**：`tests/exports.test.ts` 新增"每个 exports 子路径的 import/types 目标必须在磁盘可解析"断言（本次 bridge-router-core 死映射的防复发）。

## 6.1.9
- React URL 同步桥接的可选依赖探测改为「首次使用才 import」
- 五模板插件依赖升钉 6.1.8 并重生成锁文件

## 6.1.8
- npm 包内五模板升钉 6.1.7（本版本插件运行时代码与 6.1.7 一致，仅模板依赖与锁文件变化）

## 6.1.7
- dev 入口重试修复补全：业务模块树的 runtime import 不再被入口失败污染

## 6.1.6
- dev 远程入口内部依赖失败后，同页「重试加载」现在能真实恢复（不再要求整页刷新）
- 模板依赖维持 6.1.4（发布时该版本尚不可锁，两阶段发布口径）

## 6.1.5
- npm 包内五模板升钉 6.1.4

## 6.1.4
- Vue 远程组件及页面：已解析的异步组件重挂到另一 app 时，重新完成该 app 的全局组件注册；页面固定在路由表中也能在新会话挂载或 KeepAlive 激
- `createHostPages` 与 `remoteComponent` 统一自动传入消费方注册器；零参组件 loader 的失败正常传播给 Vue 错误处理
- showcase Vue 宿主守卫：首次深链恢复不弹交互确认，后续导航仍执行权限确认

## 6.1.3
- npm 包内五模板升钉 6.1.2（6.1.2 已发布并核验：integrity 与五模板 pnpm-lock registry 重生成一致，`minimu
- bridge-router（Vue 子应用）：宿主广播应用的 `duplicated` 导航失败不再误报 `MFU-033`
- 类型：包根导出 `PageRouteLike`（四入口合同补齐）
- 示例/模板
- doctor 部署体检补单测：`tests/doctor.test.ts` 新增 9 场景（--no-entry/--no-manifest/--no-html
- 文档 zh/en：globalComponents 消费方 app 捕获范围澄清（当前仅 Vue `remoteComponent` 自动捕获；页面/React

## 6.1.2
- npm 包内五模板维持钉 6.1.0（6.1.0 与 6.1.1 运行时代码一致，同为「最后已发布验证版本」；包内模板与 `examples/templat
- transform：TS 类型位置的动态 import 不再被误改写（发布阻塞修复）
- bridge-router：URL 重复前缀在第一次宿主写入前显式拒绝（`MFU-032` 扩展）
- dts：dev 类型生成提示行不再把内部 setup 入口计入分母
- bridge 文档：`remoteComponent` 的 provide/inject（React Context）边界合同
- 示例（公开 Jeecg 集成 app-a/app-b）：`useForm` 实例就绪合同修复

## 6.1.1
- npm 包内五模板钉 6.1.0

## 6.1.0
- 组件联邦的全局注册组件安装（setup `globalComponents` 契约）
- `RemoteSetupModule.globalComponents`
- `LoadRemoteOptions.consumerApp`
- `globalComponents` 值支持零参 loader（`() => import('…')`，推荐形态）
- 单测：`tests/global-components.test.ts`（注册/换 app 重注册/幂等/跳过/MFU-011/失败清缓存/无声明零行为）+ 
- 修复（文档）：`createReactBridgeRouter` 返回值合同文档缺失 `routerReady` 与 `dispose`

## 6.0.0
- 破坏性版本：公共入口统一为四类
- 公共入口收敛
- Vite 配置与插件类型 → `@fulgurjs/federation`（包根，不变）；
- Vue 应用代码 → `@fulgurjs/federation/vue`（运行时全量 + remoteComponent/createHostPages + 
- React 应用代码 → `@fulgurjs/federation/react`（运行时全量 + React 适配 + defineBridgeApp/cre
- 框架无关浏览器模块 → `@fulgurjs/federation/runtime`（**不再导出** Vue 的 remoteComponent/create

## 5.9.3
- 修复：hostPages keepAlive 页在 Vue 3.5 下永不缓存
- 模板依赖钉 5.9.2（5.9.3 发布时的最后已发布验证版本；模板场景未用到 hostPages）

## 5.9.2
- 修复：`fulgurjs create --force` 提示与实际覆盖行为不一致
- 修复：模板统一 dev 启动器（`scripts/dev.mjs`）监督空窗与孤儿孙进程
- 改端口指导统一为四处同步清单
- 独立启动页/注释的默认端口标注
- 模板依赖钉 5.9.1（5.9.2 发布时的最后已发布验证版本；本版本仅改 CLI/文档/示例与版本常量，运行时与 5.9.1 无语义差异——README 与模

## 5.9.1
- npm 包内模板与正式版本对齐
- 版本 5.9.0 → 5.9.1

## 5.9.0
- 新增 CLI：`fulgurjs create`——完整工程创建向导（新项目入口）
- 模板统一 dev 启动器
- CLI/文档引导一致性
- explain 桥接完备性 WARN
- README 中英同步
- 模板依赖随发布升级 5.9.0（精确版本 + 锁文件重生成，冻结安装验证）

## 5.8.0
- 修复：保留用户 manualChunks 时生产启动挂起/爆 TDZ（MC-FIX，rollup/vite 5–7 路径）
- MC-FIX-1（post 兜底改写缺 node_modules 闸门）
- MC-FIX-2（对象形式 manualChunks 包装漏 provider 隔离）
- MC-FIX-2C（provider 闭包割裂 → 跨 chunk TDZ）
- 验收：单测 654→656（新增纯宿主 manualChunks 回归 + 死锁防线锚点迁移）；e2e dev 43/43 + prod 28/28；真实项目 
- 版本 5.7.1 → 5.8.0（含 runtime 同步升版与产物再生）

## 5.7.1
- React 桥接兼容 react-dom/client 的 default-only CJS 命名空间（Vite 6 + React 18），使用同一 rend
- runtime gzip 预算 10240→10496B（实测 10273B）：共享屏障及旧冻结内核兼容为必要逻辑增量，继续保留硬门禁
- 修复同步消费拒绝异步 resolveShare 后的迟到 Promise 拒绝，避免额外 unhandledrejection
- HTML 入口配置 runtimePlugins 时增加异步协商屏障；远程 expose 执行前准备共享决策，消费方门面保持原有同步形态
- 首次消费者接管单例时按真实物理版本登记，不再把 React 18 实例填入标注 React 19 的槽位而绕过 strictVersion；另一版本的单例正在异
- runtimePlugins 的相对路径以项目 root 解析，避免入口/虚拟模块位置改变后解析错误

## 5.7.0
- 修复：Vite 8 同步协商门面的共享语义补修（strictVersion 拒绝 + resolveShare 契约）
- strictVersion 冲突被吞
- resolveShare 首次静态导入被跳过
- singleton 首个消费者接管语义
- 新增运行时 API：`loadShareSync(key, opts)`
- 质量门禁

## 5.6.0
- 修复：Vite 8（rolldown）生产链路五项（V8-SYNC-FACADE 配套）
- 大型应用页面启动死锁
- remoteEntry 失败重试在 rolldown 产物失效
- vite8 依赖预载负缓存阻断同页重试
- vite8 manifest exposes 缺项
- optimizeDeps 弃用警告

## 5.5.2
- 修复：多远程宿主 react-refresh 发布脚本的错源网络噪声

## 5.5.1
- 修复：`getLoadedShare` / `pinLoadedShare` / `clearSessionState` 在 `/runtime` 与 `/react` 入口的类型与生成链缺口

## 5.5.0
- 修复：Vite 8（rolldown）大型应用生产构建失败（V8-ASYNC-FIX）
- 修复：桥接诊断三项（MFU-033 降噪 / spec 失真 / cause 双重包装）
- MFU-033 双诊断：宿主守卫（React `useBlocker`）回滚期的连续广播竞态曾产生重复的「子应用守卫拒绝应用宿主确认的位置」误导诊断
- 桥接错误 spec 真实化：`defineBridgeApp`（Vue/React 子应用适配器）不再以占位 spec `'bridge'` 预包装 MFU-0
- 支持：Vue Router 5（peer `>=4.1.0 <6`）
- 修复：Promise 远程名称不一致告警在重试/恢复链路重复刷屏——同一（配置名↔自报名）对只告警一次

## 5.4.3
- 修复：移除 5.4.2 误带入 `transformIndexHtml` 的一条无条件调试输出（`console.error` 探针在发布前漏删，污染使用方终端

## 5.4.2
- 修复：多远程宿主 react-refresh preamble 错源（MFU-001 "can't detect preamble"）——Vue 宿主同时挂 V
- 新增导出面守卫用例（`tests/exports.test.ts`）

## 5.4.1
- 修复 URL 同步两端适配器将 replace 误报为 push、子应用 go/back/forward 未委托宿主历史，以及连续导航被丢弃的问题
- React 宿主等待真实 blocker 的 reset/proceed 与提交位置；canNavigate 改为可选预判
- 修复 Vite 5/6 配套 plugin-react 4 的跨框架 dev preamble 标志缺失，避免 Vue 宿主加载 React 远程失败；子目录部
- 修复 React 18 + RR6 生产渲染的跨共享键 CJS 双实例：提供闭包只豁免自引用，react-dom → react 走同步协商；入口 init 前
- 通道离页、暂停与卸载会作废在飞和排队请求；自定义宿主 navigate 可接收 AbortSignal；子应用接线可传 ctx.signal 自动清理

## 5.4.0
- 启用即校验，默认关闭
- 取消语义（真实框架行为）
- 会话与生命周期
- 包接线
- 质量门禁

## 5.3.3
- 修复：loadShare × pinLoadedShare 并发窗口的单例双实例风险（F9）
- 结论修正（Vite 8 与 dev 冷启动）
- 插件分组的 Vite 8 方案（原生 codeSplitting 保护组 + 共享提供/协商/垫片/运行时分层）与共享选择共用、CJS 垫片同步形态、宿主提供闭

## 5.3.2
- 修正：回滚 5.3.1 中「宿主入口 init 注入改为 `import "virtual:fulgurjs-init"`」的实验性变更

## 5.3.1
- 修复：Vite 8（rolldown）下 React 联邦生产构建 REQUIRE_TLA 失败
- 修复：Vue 宿主桥接 unmount 失败后容器未持久封锁（BN09）
- 修复：getContext 返回 null/undefined 时错误码丢失（BN08）
- 修复：宿主未装 @vitejs/plugin-react 时被注入失效的 react-refresh 探针（5.2.0 起回归）
- 改善：loadShare 成功后缓存实例值（`ShareEntry.value`）
- 新增回归测试 5 个（单测 535 → 540）；e2e dev 43 例 / prod 28 例全绿；MES 真实项目回归与 Vite 矩阵详见验收报告（`d

## 5.3.0
- 新增：跨框架桥接 `/bridge` —— 子应用级 Vue↔React 双向互嵌
- 子应用侧：`defineBridgeApp`（`/runtime` 与 `/react` 同名双导出）——工厂接收 props 快照、返回装配完整的 VueAp
- 宿主侧：`createVueBridgeApp` / `createReactBridgeApp`（`/bridge/vue`、`/bridge/react` 
- 会话语义：页面级单会话登记（同页多实例单会话约束，冲突 `MFU-017`）；换账号/登出（`sessionKey → null`）立即作废旧代次并卸载；换代先
- 错误码：`MFU-015`（桥接契约非法）/ `MFU-016`（桥接准备或生命周期失败，`details.phase` 区分 getContext/mount

## 5.2.5
- 修复：远程示例（examples/{vue,react}/remote）子路径生产部署的 modulepreload 404

## 5.2.4
- 修正：示例锁文件的 integrity 字段改为不固定（registry 校验）

## 5.2.3
- 修正：包内四份示例（examples/{vue,react}/{host,remote}）的 `@fulgurjs/federation` 依赖声明与锁文件统一指向本版本 5.2.3

## 5.2.2
- 修复：对象形式 manualChunks 的宿主也获得运行时 chunk 隔离

## 5.2.1
- 修复：宿主构建的运行时 chunk 隔离（MES admin 实测回归）

## 5.2.0
- 修复：Vue 默认错误占位没有可操作的恢复入口（D1）
- 修复：React 默认错误占位补齐刷新恢复（D1/D2）
- 修复：生产静态子依赖失败的用户恢复闭环（D2）
- 修复：React 跨应用开发更新真实自动传播（D3）
- 修复：Vite 5.x 双 client 错误覆盖层 IllegalConstructor（D4）
- 示例重构（D7）

## 5.1.4
- 修复类型生成的数组 extends、目录 references、独立 baseUrl 继承及继承 include 上下文识别；多个应用 paths 接管不一致时
- setup/onSession 失败包装保留原始 Error.cause，中文 MFU-012 与重试语义不变
- 增加开发/生产共用 React 浏览器契约：冷加载、多实例、真实慢快请求竞态、双向跨框架模块及生命周期失败恢复
- 忽略 examples 构建与自动类型产物；完整验收结果在发版后的独立报告记录

## 5.1.3（2026-09-29）
- 修复：TS 应用配置上下文识别（dev 类型双轨判定）
- 修复：生产重试 helper 并发失败代次竞态
- 测试基建
- 文档

## 5.1.2（2026-09-29）
- 修复 React hook 重载清理
- 回归验证
- 测试入口与文档
- Vite 5 已知限制范围
- 本版是小范围修复；TS 应用配置上下文识别、生产重试完整浏览器验证和 MES 双环境全量验收仍需后续任务完成，不宣称完整验收通过

## 5.1.1（2026-09-28）
- 修复：同实例会话切换（React）
- 修复：tsconfig paths 判定语义化
- 修复：类型降级残留失效转发文件
- 修复：生产重试 URL 污染成功加载
- 修复：Vite 8 依赖预构建外部化
- 测试与文档

## 5.1.0（2026-09-28）
- React 完整支持（浏览器客户端）
- 修复：失败恢复穿透浏览器 ESM 失败缓存
- 修复：`react-adapter` 产物内联 react 的隐患
- 开发类型双轨（Vue/React 通用）
- 完整英文 README（README.en.md）
- 内部：vue-adapter 纯页面解析提取为共用的 host-pages-core.ts（Vue 行为与既有断言保持）；新增 fixtures/host-re

## 5.0.4（2026-09-28）
- 修复开发类型生成的地址解析

## 5.0.3（2026-09-28）
- 修复开发类型降级失效

## 5.0.2（2026-09-27）
- 测试可移植性修复

## 5.0.1（2026-09-26）
- 修复 dev manifest 的 version 恒为 0.0.0

## 5.0.0（2026-09-26）
- `@fulgurjs/federation/config` 子路径
- CLI `--app` 选择器
- check-pages 旧聚合形态的本地 dist 回退
- `init --config` 聚合输出分支
- `remoteType`（只接受唯一值 `module`）、`library`（从未参与输出）、`automaticAsyncBoundary`（恒为 true
- `exports['./internal/vue.js']`：生成门面实际引用 `./internal/vue-adapter.js`（保留），`remoteC

## 4.3.1（2026-09-26）
- 将插件自身的配置、共享依赖和远程加载诊断改为中文，保留错误码与原始底层异常；修复 `MFU-010` 将多个兼容候选版本误判为冲突的问题，真正不兼容时显示原因与
- 移除基于裸导入前缀猜测“漏配远程”的提示；它会将 `vite/modulepreload-polyfill`、`@vue/runtime-dom` 等普通依赖误
- 中文诊断使运行时 gzip 从 7547B 增至约 8649B；体积门禁由 8192B 调整为 9216B，仍限制无意增长

## 4.3.0（2026-09-25）
- `check-pages` 远程地址全形态推导
- `check-pages` manifest 来源优先级
- CLI 独立目录 TS 配置加载
- CLI localhost 回环回退
- remoteEntry 缓存语义统一
- README「真实工程验证」表述

## 4.2.1（2026-09-25）
- `check-pages --require-verified` 退出码语义

## 4.2.0（2026-09-25）
- 默认导出直接是 `federation()` 选项
- 宿主页面核对数据具名导出 `hostPages`
- CLI 配置加载器
- CLI 单项目化
- `FederationOptions` 类型公开导出
- `fulgurjs init` 只生成配置起步模板

## 4.1.0（2026-09-24）
- `federation({ setup })` 远程初始化（可选）
- `createHostPages({ pages, remotePrefixes, ... })` 宿主页面适配器
- `federationOptionsForApp(config, app)`
- `clearAppContext()`
- CLI
- `devSharedSelf` 角色推断（§12.4）

## 4.0.0（2026-09-24）
- 唯一公开应用入口改为 `@fulgurjs/federation/runtime`，提供实际的 ESM 文件与类型声明；配置入口仍为包根和 `/config`
- `virtual:fulgurjs-api` 与 `@fulgurjs/federation/client` 删除
- 开发态 exposes 使用内部页面级代理；`remoteComponent()` 保持同步返回 Vue 组件
- Vue 适配层与运行时内核分离，公开 ESM 图只引用一份 `runtime.js`
- `/runtime` 只提供 ESM `import` 条件，使用时需安装 Vue；包根和 `/config` 的 CJS 条件不变

## 3.0.1（2026-09-24）
- runtime-proxy 的 `parseSpec` 保持同步语义

## 3.0.0（2026-09-24）
- 迁移映射：

## 2.1.0（2026-09-23）
- 新增单一 API 入口 `virtual:fulgurjs-api`
- 修复 auto-import 后置注入绕过门面化的一类缺陷
- manifest 契约
- 修复根相对 remote 地址的资产解析
- dts 路径边界
- 新增 `devCorsOrigins` / `devFsRoot` 选项

## 2.0.3（2026-09-23）
- 修复 expose manifest 漏报 CSS
- 修复根相对 remote 地址
- 运行时按 expose 加载样式
- 补齐 build 后置转换
- 回归验证

## 2.0.2（2026-09-22）
- 缺陷
- 根因
- 修复 1（门面形态参数化，virtual.ts）
- dynamic 仅在 devSharedSelf 宿主（build）启用；其余一切场景（纯 remote、dev serve）保持
- 修复 2（shared 闭包静态化，transform.ts + index.ts）
- 修复 3（manualChunks 包装注入，index.ts）

## 2.0.1（2026-09-22）
- README 补全公开类型/函数名
- peer 下限对齐实测值
- 发布物收窄
- 仓库公开面整理
- 两处过时文档元数据修正：webpack-mf 对照文档的版本戳、vite-upstream 草稿的断链引用与失效 commit 号

## 2.0.0（2026-09-22）
- `defineRepoConfig` 而非 `defineConfig`——避开与 vite 的 `defineConfig` 撞名（`fulgurjs.con
- 运行时错误 `err.name` 由 `FulgurjsError` 变为 `FgError`：该类不在导出面（用户从不 import，
- 跨应用单例键
- 虚拟模块 `virtual:fulgurjs-runtime`、CLI `fulgurjs`、配置文件 `fulgurjs.config.ts`、错误码前缀 
- 运行时函数名（`loadRemote` / `loadShare` / `preloadRemote` / `registerRemote(s)` / `ini

## 1.0.0（2026-09-22）
- 删除旧配置 API
- 迁移：全局搜索 `provideFulgurjsAppConfig` / `getFulgurjsAppConfig` 替换为 context 子路径对应函数
- 移除 `docs/manual.html`
- 设计文档状态勘误：D.2 / D.4 / D.5 已实施项的状态标记修正（原标注"待执行/未实现"）

## 0.9.0（2026-09-21）
- `dts: { mode: 'source' | 'shim' }`
- `fulgurjs.config.ts` 新增 `host.prefetch: 'all' | string[] | false`
- `npm run typecheck:latest`
- CI 流水线
- gzip 门禁真实化
- 发布物移除 `docs/manual.html`

## 0.8.4（2026-09-21）
- 删除全部"X.X 起 / 原规则已废除 / 早期版本~~删除线~~"式版本沿革叙述（静态导入改写、目录默认值、
- 特性列表与 API 参考标题去除版本后缀（"（0.7.0 起）/（0.8.0 起）"）；deprecated 标注保留（当前事实），
- 语句复核：快速开始的运行时导入说明重写为单句当前形态

## 0.8.3（2026-09-21）
- 按成熟开源库的 Options Reference 体例重写：每个能力给出**配置项名 / 类型 / 默认值 / 配置位置**四要素，
- 新增 §9.1 配置面总览表（能力 × 配置项 × 类型 × 默认值 × 配置位置）
- 骨架屏如实标注为「无配置项」并列出内置参数（`loadingComponent` / `delay: 200ms` / `errorComponent`），

## 0.8.2（2026-09-21）
- `provideGlobalConfig(getFulgurjsAppContext(), app)` 的 ts(2345)
- `token` 一次性快照移出默认 provide
- `formUrl` / `baseUrl` 移出默认 provide
- 取证依据：仓库全量 grep 上述三键零消费（除 bridge 传参本身）；`user` / `getToken` / `store` /

## 0.8.1（2026-09-21）
- README 新增 §9.1「乾坤功能融合三件套 + 联邦诊断面板」
- README §9 方法模块补端到端示例
- IDE 说明
- 修复：集成器 pages.ts 模板注释与现场对齐（`defineAsyncComponent` 不支持 `name` 选项的表述清理）

## 0.8.0（2026-09-20）
- `@fulgurjs/federation/context` 新子路径（~2KB 独立文件，与 `./vue` 同模式）
- `provideFulgurjsAppContext(config)`——宿主桥一次性写入跨应用上下文（merge 语义，幂等可多次，后写覆盖）；
- `getFulgurjsAppContext()`——读快照（传输层快照 + 函数引用，非响应式，与乾坤 props 同语义；嵌套对象如 `events` 引用
- `requireFulgurjsAppContext(...keys)`——远程 boot 显式校验消费：缺任一键 → **`CC-001`** 三段式抛错（g
- `FulgurjsAppContext` 类型（标准字段表：`user` / `token` / `getToken` / `store` / `hostApp
- 方法引用一等公民两条通道

## 0.7.1（2026-09-20）
- `typesVersions` 子路径类型映射
- 新增清单防漂移测试（exports 子路径 ↔ typesVersions ↔ 磁盘 d.ts 三方一致）

## 0.7.0（2026-09-20）
- `remoteComponent(spec, opts)`（`@fulgurjs/federation/vue` 子路径）
- 架构边界
- 集成器 detail 页模板简化
- README API 参考新增 §8（remoteComponent 选项表与语义）

## 0.6.2（2026-09-20）
- 宿主应用的桥接文件归位 `src/fulgurjs/host/`

## 0.6.1（2026-09-20）
- 包内 README/CHANGELOG 与 0.6.0 行为对齐

## 0.6.0（2026-09-20）
- dts 生成目录默认 `src/fulgurjs/types/`

## 0.5.9（2026-09-20）
- dts 生成目录默认收敛到根目录 `.fulgurjs/types/`

## 0.5.8（2026-09-20）
- dts 具名枚举的 as 别名

## 0.5.7（2026-09-20）
- dts 生成：环境模块改显式具名重导出

## 0.5.6（2026-09-20）
- dts 生成：非 .vue 源码的 re-export 去掉 `.ts` 扩展名

## 0.5.5（2026-09-20）
- client.d.ts 改 script 形态

## 0.5.4（2026-09-20）
- 类型垫片改 import 式

## 0.5.3（2026-09-20）
- `virtual:fulgurjs-runtime` 类型声明随包发布

## 0.5.2（2026-09-20）
- dev 下 `preloadRemote` 注入的 expose 链接全部 404（npm 深度验证轮发现）

## 0.5.1（2026-09-19）
- 宿主页面「虚拟运行时导入 + 远程动态导入」混用漏改写（真实 npm 用户验证轮发现）
- README 双端导航统一

## 0.5.0（2026-09-19）
- 全品牌从 `fulgur` 对齐为 **`fulgurjs`**（npm 上 fulgur 组织名被占用）：
- 虚拟模块：`virtual:fulgur-runtime` → **`virtual:fulgurjs-runtime`**（代理模块同步更名）
- 全局单例：`__FULGUR_RUNTIME__` → **`__FULGURJS_RUNTIME__`**（`__FULGURJS_APP_CONFIG__`
- 产物文件名：`fulgur-remoteEntry.js` / `fulgur-manifest.json` → `fulgurjs-remoteEntry
- 配置文件：`fulgur.config.ts` → **`fulgurjs.config.ts`**；错误前缀 `[fulgur:*]` → `[fulgurj

## 0.4.2（2026-09-19）
- npm 包内 README 与仓库 README 是两个文件

## 0.4.1（2026-09-19）
- 任何文件都可以直接 `import { ... } from 'virtual:fulgurjs-runtime'`
- 插件升级后重启 dev server 即可
- runtime 两个存量 TS 断言错误（as Error → as FulgurjsError）与 fallback 源码契约断言同步

## 0.4.0（2026-09-18）
- CLI（主包内置 bin `fulgurjs`）
- `fulgurjs init`：起步模板（带注释的 `fulgurjs.config.ts`：宿主/远程/页面路由表/部署形态，
- 项目无关——不内置任何具体项目的模板、锚点或文件改写
- `fulgurjs doctor`：部署面体检——remoteEntry/manifest/index.html 的 200/no-cache/JS 形态、
- W4 跨应用全局配置协商
- W5 诊断补码
