# 未决问题台账

> 规则：拿不准、非本任务范围、需用户/后端配合的问题记入此处，不阻塞主线推进。
> **2026-09-14 更新**：后台已切换为**本地 demo 原项目**（`http://localhost:8085/demo`，
> admin/Demo@123456），U-1 随之消解；U-2 复测确认与后台无关。

## U-1：~~pe-mes255 后台 CUSTOM 流程引用的前端表单组件缺失~~ → ✅ 已消解（2026-09-14）

- **原现象**（使用衍生后台 pe-mes255 时）：审批详情页业务表单区渲染联邦 FormRouterPage 壳后，
  console 报 `组件未找到: views/page/flowable/form/EnvFourDrugStockOutForm.vue` 等，
  业务表单内容为空。
- **定性**：前后端配置错位，**非插件/迁移缺陷**。这些 Env*/Bas* 表单组件在 demo 前端
  （原项目与 testbed 副本）里都不存在——pe-mes255 衍生后台的流程定义
  `formCustomViewPath` 指向了衍生前端才有的组件。
- **消解验证（切回本地 demo 后台后实测）**：流程实例详情页业务表单区**完整渲染真实业务表单**——
  14 个输入框、真实回填值（单据号 `SC20260910357`、产品型号「单片集成电路（共晶焊接）
  ALC0851XX」、承担部门「五所」、检查组结论「无问题通过」等）、子表 3 行、
  `iframe 数 = 0`（联邦直渲染）、**零失败请求、零 console 错误**。
  截图 `docs/screenshots/migration1-dev/t6-local后台-详情页业务表单区.png`。
- **结论**：业务表单区联邦化在 demo 后台下**完整可用**。若将来仍需对接 pe-mes255，
  需向该项目方索要其 Env*/Bas* 表单组件源码补入 admin 前端。

## U-2：lowcode 6 页空白——✅ 已结案（2026-09-15，见路线图 §2.2 D2 结案记录）

> **结案摘要**：两级根因（prod 的 dayjs→esm 别名双重 interop；dev 的 CJS 依赖裸服务）。
> 插件新增 optimizeDeps shared 外部化 + build 期 CJS require 垫片重定向两项能力后，
> 6 页 dev/prod 全部可用、与乾坤基线行为一致。以下为原始排查记录存档。

### U-2 原始记录（2026-09-14）

> ⚠️ **2026-09-14 定性修正（用户指示）**：此项**不再记作"avue 只有 UMD 的第三方限制"**，
> 也不接受 iframe 兜底/降级/"仅 dev 限制"。理由：真实工程本就在用 UMD-only 依赖，**插件必须支持**；
> 且 prod 报错形态（rollup 产物内 CJS default interop 破损）本身就指向插件侧的 CJS/UMD 处理缺陷。
> → **归入 `docs/插件成型路线图.md` P0-2，按插件缺陷修复，验收标准 = 6 页功能可用 + 双环境零报错。**

- **当前状态**：**dev + prod 双环境均不可渲染**（页面：formDesign / reportDesign /
  graphReportDesign / moduleDesign / reportTest / form_external，共 6 页）。
  路由与页签正常、接口零失败，内容区空白。
  - dev：`resolveComponent can only be used in render() or setup()` /
    `Cannot destructure property 'node' of 'undefined'`
  - prod：`TypeError: p.default.extend is not a function`（6 页一致），定位在 lowcode 产物
    `assets/domUtils-*.js` 的 element-plus date-table `useDateTable` 等 dayjs 插件注册处
    （`u.default.extend(n.default)` 的 CJS interop 形态）
- **接口层已全通**（零失败请求）；federatedBoot 已把 lowcode 全局注册
  （globCom/lowDesagn/avue/hasPermi 指令/i18n）补装到宿主 app（组件数 335→686）。
- **dev 机制**：`@smallwei/avue@3.7.0` 只有 UMD 构建（`lib/avue.min.js`，无 ESM）——dev 下走
  optimizeDeps 预构建；预构建产物把 lowcode 自己的 vue 内联进 deps chunk（与门面协商到的宿主
  vue 形成双实例）。**待解决的是"插件如何让 UMD-only/CJS-only 依赖在 dev 下也走门面协商"**。
- **prod 机制**：avue UMD 经 rollup+commonjs 转换进产物后，依赖链上 dayjs/element-plus 的
  CJS default interop 在 chunk 拆分后拿到未初始化对象 → 顶层 `.default.extend` 报错。
  **待定位：插件改写（门面化）与 commonjs 转换的先后顺序是否破坏了 interop。**
- **已排除的路径**（作为排查记录保留）：① exclude avue → UMD 作为源码服务直接语法错误；
  ② include 加 xe-utils → 对非扫描依赖不生效；③ **显式写进 `include` 会压过 `exclude`**
  （原 include 里有 `@smallwei/avue`，须先移除才可能生效，但移除后即落到路径 ①）。
- **已否决的方向**：~~iframe 兜底~~（用户明确否决：新插件不允许兜底）、
  ~~标记"仅 dev 限制"~~（同上）。
- **允许的技术方向**：① 插件支持 UMD-only/CJS-only 依赖（插件侧转换/门面改写优化产物/自定义
  loader —— 首选，属能力升级）；② 辅助生成 ESM 入口（由插件自动完成，而非要求用户手改 avue）；
  ③ 向 avue 上游提 ESM 需求（可并行，但不能作为把问题挂起的理由）。

## U-6：prod 25-moduleDesign 单条 console 报错——EP shared 单副本下 tooltip 引用解析（2026-09-17）

- **现象**：prod 8662 的 25-moduleDesign 页 1 条 `TypeError: w.getBoundingClientRect is not a
  function`（console.error，非 pageerror）；dev 同页零报错。页面功能无损：avue-crud 壳 +
  诚实空态（暂无数据）正常渲染，接口零失败。EP 进 lowcode shared（D.4 第一步）后新出现，
  此前该页报错已由守卫+垫片清零。
- **根因（已定位到调用点）**：element-plus 2.10.2 `es/components/popper/src/composables/use-content.mjs:50`
  ——`onMounted` 里 watch 的 getter **无守卫调用**
  `unref(computedReference)?.getBoundingClientRect()`；当 tooltip 走 virtual-triggering /
  trigger 解析到非 DOM 节点（文本/注释/组件实例）时抛 TypeError，经 Vue watcher 错误处理
  落 console.error。单副本（shared singleton）前该 watch 也存在，但多副本时期此页面该
  tooltip 路径未触发；dev 与 prod 的 VNode 构建（注释/空白节点处理）差异使 dev 不复现。
- **已排除**：页面自身两处 `<el-tooltip>`（isLazy/isRefresh 表头 Icon 提示）——`.box-item`
  探测为 0，两列未渲染，未挂载，非责任方；抛错点在 lowcode 产物 `assets/index-*.js` 内
  编译后的 EP 组合式（avue/EP dropdown 调用链），应用侧不可触达。
- **为何不修（应用侧无干净修法）**：① patch node_modules（pnpm patch）可消音但污染依赖
  树，且属上游缺陷本地遮蔽；② 页面源码无对应可改点（责任 tooltip 不在页面源码内）；
  ③ 功能零影响（已截图+文本验证空态正常）。
- **规避/后续**：① 升级 element-plus 至修复该无守卫调用的版本（上游 issue 类：
  virtual-ref 为组件实例/非元素时 useContent watch 抛错）；② 若 console 噪音不可接受，
  用 pnpm patch 在 `use-content.mjs` 该行加 `typeof ... === 'function'` 守卫（一次性、
  随依赖重装丢失，需记入补丁清单）；③ 观察 D.4 后续收敛（manualChunks/shared 策略变化）
  是否改变该 tooltip 的挂载路径。
- **验收口径**：本项按「EP shared 已知限制」记录结案——collect 25 页 1 条 console.error
  为已知噪音（pageerror 恒为 0），其余 26 页 collect 双零。

## U-7：插件裸门面 export* + TLA 在 rolldown 产物下命名绑定全 undefined（2026-09-17 定位）

- **现象**：任何消费方在 provider 注册后 `loadShare('element-plus')`（即走 provider 路径），
  拿到的命名空间 494 个命名导出**全部 undefined**（仅 default 事后有值）——D 项排查时由
  lowcode federatedBoot 首次触发（"p is not a function"）。
- **根因**：`genSharedFacade`（packages/plugin/src/virtual.ts:15）生成
  `import * as ns; export * from 'element-plus'; export default ns.default ?? ns`。
  rolldown 把 `export *` 连同 vite-plugin-top-level-await 的 `__tla` 机制编译为
  「130+ 个 `let` 提升绑定 + `Promise.all(...).then(async () => { ka = Ma ?? xa })`」——
  **只有 default（ka）在 then 回调里被赋值，其余命名绑定永远 undefined**（产物
  `virtual_fulgur-shared_element-plus-D7makIBd.js` 已逐字节核对）。EP 命名空间本体
  （fallback 目标 `index-DKRCPYQT.js` 的 `_` 导出，493 键）完全健康——坏的是门面层。
- **影响面**：仅「provider 注册后经 loadShare 消费 bare 门面」的路径（宿主自身不走；
  页面内消费走 ?f= 绑定门面 + 各自 fallback 时正常）。当前 testbed 无存量消费方
  （federatedBoot 已改深路径绕开），属**潜伏缺陷**。
- **修法方向（插件侧，待排期）**：`genSharedFacade` 弃用 `export *`，改枚举式再导出
  （复用 `enumerateCjsExports`，同 `genSharedNsFacade` 的
  `export const x = ns.x` 形态——枚举赋值不依赖 rolldown 的 export* 展开）；
  或升级 rolldown 观察 export*+TLA 展开是否已修。修完应回归：构造「provider 注册后
  loadShare」场景断言命名导出非 undefined（当前无此用例）。
