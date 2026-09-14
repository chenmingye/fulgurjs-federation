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

## U-2：lowcode 4 设计器页空白——avue 预构建双 vue 实例（2026-09-14）

- **当前状态（2026-09-14 升级）**：**dev + prod 双环境均不可渲染**。dev 为 avue 预构建内联
  本地 vue 双实例；prod（插件 build 门禁修复 + prod remoteEntry 注册 remotes 之后实测，
  8662）4 页（formDesign/reportDesign/graphReportDesign/moduleDesign）同样空白，
  错误签名与 dev 不同：`TypeError: p.default.extend is not a function`（4 页一致），
  定位在 lowcode 产物 `assets/domUtils-BHw4j-To.js` 的 element-plus date-table
  `useDateTable` 等 dayjs 插件注册处（`u.default.extend(n.default)` 的 CJS interop 形态）。
  lowcode 为纯 remote（无 remotes），本轮 build 门禁修复不改变其管线——prod 失败系原有问题。
- **接口层已全通**（零失败请求）；federatedBoot 已把 lowcode 全局注册
  （globCom/lowDesagn/avue/hasPermi 指令/i18n）补装到宿主 app（组件数 335→686）。
- **dev 根因**：`@smallwei/avue@3.7.0` 只有 UMD 构建（`lib/avue.min.js`，无 ESM）——dev 下只能走
  optimizeDeps 预构建；预构建产物把 lowcode 自己的 vue 内联进 deps chunk（与门面协商到的宿主
  vue 形成双实例）→ avue 组件（avue-tree/avue-crud）渲染报
  `resolveComponent can only be used in render() or setup()` /
  `Cannot destructure property 'node' of 'undefined'`。
- **已排除的路径**：① exclude avue → UMD 作为源码服务直接语法错误（无 ESM 可用）；
  ② include 加 xe-utils（vxe 依赖 interop）→ 对非扫描依赖不生效；
  ③ **注意：显式写进 `include` 会压过 `exclude`**（原 include 里有 `@smallwei/avue`，
  必须先移除才可能生效，但移除后即落到路径 ①）——lowcode 的 optimize.ts 已还原为原状，
  不留半成品改动。
- **prod 失败机制（初判，未挖穿）**：avue UMD 经 rollup+commonjs 转换进产物后，
  其依赖链上 dayjs/element-plus 的 CJS default interop 在 chunk 拆分后
  （`.default.extend` 于顶层执行时）拿到未初始化完成的对象。乾坤基线（8661）下 4 页
  正常渲染（基线截图 22-25 存在），差异点在联邦管线的 vue 门面化与 chunk 拆分。
- **候选方向**（均需额外投入，暂缓）：
  1. 给 avue 出一份本地 ESM 构建（esbuild 对 avue.min.js 做 cjs→esm 转换后入 src/vendor）；
  2. **iframe 兜底**：lowcode 4 设计器页退回 iframe 通道（乾坤时代形态，admin unifedPages
     工厂按页指定 iframe 通道即可，页面本身在 lowcode 独立部署下可用）；
  3. 向上游 avue 提 issue 索要 ESM 构建。
