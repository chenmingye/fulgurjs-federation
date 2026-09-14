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
