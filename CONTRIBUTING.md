# 贡献指南

感谢参与。本仓库是个 Vite Module Federation 插件（`packages/plugin`），外部贡献请先开 issue 对齐方向，避免做完了方向不对。

## 环境

- 使用满足当前 Vite 版本要求的 Node（Vite 7/8 要求 20.19+ 或 22.12+；CI 用 24）
- 每个子项目是独立的 pnpm workspace（**根目录不是 workspace**），pnpm 11；CI 里插件侧走 npm

先安装并构建插件，fixtures 才能经 `link:` 使用可用的 `dist`。在仓库根目录运行：

```bash
pnpm --dir packages/plugin install
pnpm --dir packages/plugin build
for app in fixtures/host-vue fixtures/remote-a fixtures/remote-b fixtures/remote-auto fixtures/host-auto fixtures/remote-react fixtures/host-react e2e; do
  pnpm --dir "$app" install
done
pnpm --dir e2e exec playwright install chromium
pnpm test:unit
pnpm test:dev
pnpm test:prod  # 需 NGINX；脚本会清理它自己启动的隔离测试实例
```

实际 CI 矩阵见 `.github/workflows/ci.yml`；不要用历史通过数量代替本次运行。

## 改代码前必读：本项目的硬约束

这些不是建议，是 CI 与门禁会拦的红线：

1. **新增/修改错误码必须三处同步**：源码码表（`src/runtime/errors.ts` 的 MFU 段 / `src/context.ts` 的 CC 段）＋ 登记表 `CODE_REGISTRY`（`src/diagnostics.ts`）＋ [API 手册「错误码总表」](docs/API.md#error-codes)。`npm run build` 里的 `scripts/check-manual-codes.mjs` 会做三方一致性校验，任一侧漏了直接构建失败。**不要绕过它**——它是防止文档与代码漂移的唯一防线。
2. **错误文案必须是三段式**（现象 → 根因 → 修法），ERROR 级文案的 `cause` / `fix` 不允许为空（单测断言）。修法要具体到配置键 / 文件 / 命令。
3. **runtime 体积红线**：`dist/runtime.js` gzip ≤ 10496B，`npm run build` 有 gzip 门禁。往浏览器运行时里加逻辑前，先说清体积影响。
4. **文档同步**：README 是使用指南，`docs/API.md` 与 `docs/API.en.md` 是参数和执行规则手册。改了行为 / 配置项 / API / CLI 输出，必须同一轮同步受影响的使用指南、API 手册与相关 JSDoc；迁移指南涉及面向使用者的行为变化时同步。
5. **测试**：行为改动必须补测试并跑通。单测 + `--project=dev` + `--project=fault` 都要过；prod e2e 需 NGINX，本地按 `e2e/scripts/prod-setup.sh` 起。
6. **配置项新增**：按 API 手册的插件选项体例写（配置项名 / 类型 / 默认值 / 配置位置 + 开/关/自定义三态示例）。

## 提交与 PR

- 一个 PR 只做一件事；顺手重构与本主题无关的代码请拆成另一个 PR。
- 提交信息用 `类型(范围): 说明`（`feat` / `fix` / `docs` / `chore` / `refactor`），与现有历史保持一致。
- PR 描述里写清：改了什么、为什么、怎么验证的（贴命令与结果）。
- CI 必须全绿：`test`（单测 + 双口径 typecheck + build 门禁）、`e2e`（Vite 6/7/8）、生产、版本隔离和 tarball 等当前必跑作业。
- 破坏性变更（API 增删、默认值变更、错误码语义变更）请在描述里显式标出，并按语义化版本递增次版本号以上。

## 调试建议

- 配置类问题先跑 `npx fulgurjs doctor`（部署面体检）与 `npx fulgurjs explain`（查看有效配置），多数问题能直接定位。
- 报错按错误码查 [API 手册「错误码总表」](docs/API.md#error-codes)，或看 [`docs/迁移指南.md`](docs/迁移指南.md) 的首次使用避坑清单。
- dev 下改了插件源码要重启 dev server（缓存自动清，但仍需重启进程）。
