# 未决问题台账

> 规则：拿不准、非本任务范围、需用户/后端配合的问题记入此处，不阻塞主线推进。

## U-1：pe-mes255 后台 CUSTOM 流程引用的前端表单组件缺失（2026-09-14）

- **现象**：审批详情页业务表单区（CUSTOM 表单）渲染联邦 FormRouterPage 壳后，console 报
  `组件未找到: views/page/flowable/form/EnvFourDrugStockOutForm.vue`（四药出库）、
  `EnvAccidentDisposalForm`（销爆处理）、`BasFormulaFlowForm.vue`（配方管理）等，
  业务表单内容为空（模块配置等子表"暂无数据"）。
- **定性**：**前后端配置错位，非联邦迁移回归**。这些 Env*/Bas* 表单组件在 demo 前端
  （原项目与 testbed 副本）的 `src/views/page/flowable/form/` 目录中均不存在
  （已对照原项目只读核验）。pe-mes255 衍生后台的流程定义 formCustomViewPath 指向了
  衍生前端才有的组件。乾坤时代同样 iframe 嵌入 admin FormRouterPage，客户端组件映射
  同样找不到，行为一致。
- **影响**：待办列表所有 CUSTOM 表单流程的详情页业务表单区只能渲染壳（联邦通道本身
  工作正常：FormRouterPage 直渲染、formParams props 传参生效——组件查找用的就是
  流程定义的 viewPath）。NORMAL（form-create）表单流程不受影响。
- **处置建议**：向 pe-mes255 后台方索要 Env*/Bas* 表单组件源码补入 admin 前端；或
  在后台把流程定义的 formCustomViewPath 改为已存在的组件路径做联调验证。

## U-2：lowcode 4 设计器页 dev 模式空白——avue 预构建双 vue 实例（2026-09-14）

- **现状**：formDesign/reportDesign/graphReportDesign/moduleDesign 四页接口层已全通
  （token 桥接 + pe-mes255 前缀修复后 getUserPermissionByToken / desform / lowdesform
  全部 200，原 500 不再复现）；federatedBoot 已把 lowcode 全局注册（globCom/lowDesagn/
  avue/hasPermi 指令/i18n）补装到宿主 app（组件数 335→686）。但页面仍空白。
- **根因**：`@smallwei/avue@3.7.0` 只有 UMD 构建（lib/avue.min.js，无 ESM）——dev 下
  只能走 optimizeDeps 预构建；预构建产物把 lowcode 自己的 vue 内联进 deps chunk
  （与门面协商到的宿主 vue 形成双实例）→ avue 组件（avue-tree/avue-crud）渲染时报
  `resolveComponent can only be used in render() or setup()` /
  `Cannot destructure property 'node' of 'undefined'`。
- **已排除的路径**：① exclude avue → CJS/UMD 作为源码服务直接语法错误（无 ESM
  可用）；② include 加 xe-utils（vxe 依赖 interop）→ include 语义对非扫描依赖不生效；
  ③ i18n 用一次性空 app 安装（避免覆盖宿主 $t）——已实现于
  `demo-lowcode/src/unifed-exposes/federatedBoot.ts`。
- **prod 预期可行**：build 走 rollup + commonjs 转换，avue.min.js 的 vue 导入可被插件
  改写到共享门面（无预构建问题）→ 待三应用重建 prod 后在 8662 实测验证。
- **dev 若必须打通的候选方向**（均需额外投入，暂缓）：给 avue 出一份本地 ESM 构建
  （用 esbuild 对 avue.min.js 做 cjs→esm 转换后入 src/vendor）；或 dev 下对 lowcode
  页面退回 iframe 通道。
