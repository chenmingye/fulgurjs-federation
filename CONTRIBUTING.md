# 贡献指南

感谢参与。本仓库是个 Vite Module Federation 插件（`packages/plugin`），外部贡献请先开 issue 对齐方向，避免做完了方向不对。

## 环境

- Node ≥ 18（CI 用 24）
- 每个子项目是独立的 pnpm workspace（**根目录不是 workspace**），pnpm 11；CI 里插件侧走 npm

安装与全部命令见 [README「开发与测试」](README.md#开发与测试)。要点：**先装插件依赖并 build**，fixtures 才能经 `link:` 消费到可用的 `dist`。

## 改代码前必读：本项目的硬约束

这些不是建议，是 CI 与门禁会拦的红线：

1. **新增/修改错误码必须三处同步**：源码码表（`src/runtime/errors.ts` 的 MFU 段 / `src/context.ts` 的 CC 段）＋ 登记表 `CODE_REGISTRY`（`src/diagnostics.ts`）＋ README「错误码总表」。`npm run build` 里的 `scripts/check-manual-codes.mjs` 会做三方一致性校验，任一侧漏了直接构建失败。**不要绕过它**——它是防止文档与代码漂移的唯一防线。
2. **错误文案必须是三段式**（现象 → 根因 → 修法），ERROR 级文案的 `cause` / `fix` 不允许为空（单测断言）。修法要具体到配置键 / 文件 / 命令。
3. **runtime 体积红线**：`dist/runtime.js` gzip ≤ 6144B，`npm run build` 有 gzip 门禁。往浏览器运行时里加逻辑前，先说清体积影响。
4. **文档同步**：README 是唯一权威文档，不另维护手册。改了行为 / 配置项 / API / CLI 输出，必须同一轮同步 README 与相关 JSDoc；迁移指南涉及面向使用者的行为变化时同步。
5. **测试**：行为改动必须补测试并跑通。单测 + `--project=dev` + `--project=fault` 都要过；prod e2e 需 NGINX，本地按 `e2e/scripts/prod-setup.sh` 起。
6. **配置项新增**：按 README §9.1 的 Options Reference 体例写（配置项名 / 类型 / 默认值 / 配置位置 + 开/关/自定义三态示例）。

## 提交与 PR

- 一个 PR 只做一件事；顺手重构与本主题无关的代码请拆成另一个 PR。
- 提交信息用 `类型(范围): 说明`（`feat` / `fix` / `docs` / `chore` / `refactor`），与现有历史保持一致。
- PR 描述里写清：改了什么、为什么、怎么验证的（贴命令与结果）。
- CI 必须全绿：`test`（单测 + 双口径 typecheck + build 门禁）与 `e2e`（Vite 6/7/8 矩阵）两个作业。
- 破坏性变更（API 增删、默认值变更、错误码语义变更）请在描述里显式标出，并按语义化版本递增次版本号以上。

## 调试建议

- 配置类问题先跑 `npx fulgurjs doctor`（部署面体检）与 `npx fulgurjs check`（配置校验 + 样板输出），多数问题能直接定位。
- 报错按错误码查 README「错误码总表」，或看 [`docs/迁移指南.md`](docs/迁移指南.md) 的首次使用避坑清单。
- dev 下改了插件源码要重启 dev server（缓存自动清，但仍需重启进程）。
