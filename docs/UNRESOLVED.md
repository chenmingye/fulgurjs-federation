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

## U-2：lowcode 4 设计器页 dev 模式空白——avue 预构建双 vue 实例（2026-09-14）

- **当前状态**：经**两套后台**（pe-mes255 与本地 demo）分别实测，4 页
  （formDesign/reportDesign/graphReportDesign/moduleDesign）均为空白 →
  **确认与后台无关**，是 avue 在本插件 dev 管线下的固有限制。
  接口层已全通（零失败请求）；federatedBoot 已把 lowcode 全局注册
  （globCom/lowDesagn/avue/hasPermi 指令/i18n）补装到宿主 app（组件数 335→686）。
- **根因**：`@smallwei/avue@3.7.0` 只有 UMD 构建（`lib/avue.min.js`，无 ESM）——dev 下只能走
  optimizeDeps 预构建；预构建产物把 lowcode 自己的 vue 内联进 deps chunk（与门面协商到的宿主
  vue 形成双实例）→ avue 组件（avue-tree/avue-crud）渲染报
  `resolveComponent can only be used in render() or setup()` /
  `Cannot destructure property 'node' of 'undefined'`。
- **已排除的路径**：① exclude avue → UMD 作为源码服务直接语法错误（无 ESM 可用）；
  ② include 加 xe-utils（vxe 依赖 interop）→ 对非扫描依赖不生效；
  ③ **注意：显式写进 `include` 会压过 `exclude`**（原 include 里有 `@smallwei/avue`，
  必须先移除才可能生效，但移除后即落到路径 ①）——lowcode 的 optimize.ts 已还原为原状，
  不留半成品改动。
- **prod 预期可行（待验）**：build 走 rollup + commonjs 转换，avue.min.js 的 vue 导入可被插件
  改写到共享门面（lowcode prod 产物已实测 **220 个文件**含 `unifed-shared` 改写）→
  等 prod 双 vue 问题（见交接清单遗留 1）修好后一并验证；若 prod 通过，U-2 降级为「仅 dev 限制」。
- **dev 若必须打通的候选方向**（均需额外投入，暂缓）：给 avue 出一份本地 ESM 构建
  （esbuild 对 avue.min.js 做 cjs→esm 转换后入 src/vendor）；或 dev 下对 lowcode 页面退回
  iframe 通道。
