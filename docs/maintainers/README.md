# 维护者导航

> 面向本仓库的维护者与贡献者。使用者文档在 [docs/zh/](../zh/README.md)；本目录收录架构、测试、发布与工程对照类文档。

## 文档索引

| 文档 | 内容 |
|---|---|
| [架构导读](architecture.md) | DESIGN.md 摘要与阅读顺序（配置面/运行时/dev 协作/构建引擎/边界） |
| [测试方法](testing.md) | 单测 / dev+prod e2e / fixtures / examples 门禁 / 三方一致性门禁 |
| [发布流程](releasing.md) | GitHub Release → publish.yml 自动发布；npm dist-tag/integrity/provenance 核验；文档与锁文件同步 |
| [webpack-mf-对照与缺口](webpack-mf-对照与缺口.md) | 与 webpack `ModuleFederationPlugin` 的能力对照、不提供面、使用限制区别 |
| [沙箱边界审计](沙箱边界审计.md) | CSS / 全局变量 / 公共依赖的同 realm 结论与心智模型 |
| [P5-vite7-8兼容矩阵](P5-vite7-8兼容矩阵.md) | fixtures Vite 5.1→8.3 全版本 dev/prod e2e 矩阵与测试方法 |

## 硬约束速查（CI 与门禁会拦的红线）

1. **新增/修改错误码必须三处同步**：源码码表（`src/runtime/errors.ts` 的 MFU 段 / `src/context.ts` 的 CC 段）＋ 登记表 `CODE_REGISTRY`（`src/diagnostics.ts`）＋ [错误码总表](../zh/reference/errors.md)——`npm run build` 里的 `scripts/check-manual-codes.mjs` 做一致性校验；
2. **错误文案必须三段式**（现象 → 根因 → 修法），ERROR 级 `cause`/`fix` 不允许为空（单测断言）；
3. **runtime 体积红线**：`dist/runtime.js` gzip ≤ 10496B（build 门禁）；
4. **文档同步**：改了行为/配置项/API/CLI 输出，同一轮同步[使用指南](../zh/README.md)、[API 参考](../zh/reference/api.md)与相关 JSDoc；
5. **测试**：行为改动必须补测试，单测 + `--project=dev` + `--project=fault` 都要过；
6. **配置项新增**：按[配置参考](../zh/reference/configuration.md)体例写（配置项名/类型/默认值/配置位置 + 开/关/自定义三态示例）。

完整贡献流程（环境、PR 约定、调试建议）见仓库根 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

## 文档维护约定

- 使用者文档一律放 `docs/zh/`（中文）与根 README/API.en.md（英文入口）；维护者文档放本目录；
- 私密信息红线：文档不得包含内部项目名、内网地址、验收报告内容——文档是随 npm 包与 GitHub 公开的；
- 示例与模板工程统一放 `examples/`（模板 `templates/`、演示 `demos/`、集成 `integrations/`、门户 `portal/`、脚本 `scripts/`），场景登记在 `examples/scenarios.json`；新增或移动工程后跑 `npm run test:examples`。
