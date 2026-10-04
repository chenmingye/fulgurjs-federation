# 功能演示

这里的工程用于观察具体 API 行为；入门与可复制工程统一见 [示例入口](../README.md)和[模板](../templates/README.md)。

| 场景 | 演示内容 |
|---|---|
| [same-frame](same-frame/) | Vue 套 Vue、React 套 React 完整子应用 |
| [shared](shared/) | 单例、版本协商、作用域、hooks、运行时注册 |
| [react-versions](react-versions/) | React 18/19 隔离、异步裁决、严格拒绝与恢复 |
| [pages-cli](pages-cli/) | 页面清单、类型生成和 CLI |
| [errors](errors/) | 故障注入、诊断及恢复 |

各应用使用 registry 正式包、精确版本和自己的 npm 锁文件。进入具体应用执行 `npm ci`、`npm run dev`；组合启动可在仓库根运行 `node examples/scripts/start-demo.mjs --scenario <场景>`。完整操作和预期结果见各场景 README。

Vue/React 基础加载、双向跨框架桥接、URL 同步直接使用模板源码，不再在这里保存副本。Jeecg 集成在 [integrations/jeecg](../integrations/jeecg/)。
