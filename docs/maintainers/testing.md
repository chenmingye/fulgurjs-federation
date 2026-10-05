# 测试方法

> 从 [CONTRIBUTING.md](../../CONTRIBUTING.md) 与 CI 配置提炼的测试操作手册。行为改动必须补测试并跑通；通过数量以本次运行记录为准，不用历史数量代替。

## 测试分层

| 层 | 位置 | 覆盖 |
|---|---|---|
| 单测 | `packages/plugin/tests/` | 配置规范化、shared 归一化、manifest 契约、dts 生成、host-pages 纯解析内核、port 词边界、doctor 抽取逻辑等 |
| dev e2e | `e2e/`（playwright，`--project=dev`） | HMR、shared singleton、键重命名、promise remote、MFU 错误码、容错恢复全功能用例（fixtures 三件套，dev 口径） |
| fault e2e | `e2e/`（`--project=fault`） | 故障注入：远程不可用/错误入口/超时/版本冲突/非法桥接契约/setup 与卸载异常 |
| prod e2e | `e2e/`（`test:prod`，需 NGINX） | no-cache/回退/CORS 真实部署口径（脚本自启隔离测试实例） |
| 产物断言 | `packages/plugin/tests/build-*.test.ts` | 构建产物形态：manifest、CSS 收集（Vite 8/Rolldown 下共享静态依赖 chunk 的 CSS 进 expose manifest）、门面 chunk 隔离 |
| examples 门禁 | `npm run test:examples` | 模板与 scenarios.json 一致性、锁文件、启动脚本与规范源逐字节一致 |

## 本地跑法

先安装并构建插件，fixtures 才能经 `link:` 使用可用的 `dist`。在仓库根目录：

```bash
pnpm --dir packages/plugin install
pnpm --dir packages/plugin build
for app in fixtures/host-vue fixtures/remote-a fixtures/remote-b fixtures/remote-auto fixtures/host-auto fixtures/remote-react fixtures/host-react e2e; do
  pnpm --dir "$app" install
done
pnpm --dir e2e exec playwright install chromium
pnpm test:unit
pnpm test:dev
pnpm test:prod   # 需 NGINX；脚本会清理它自己启动的隔离测试实例
```

实际 CI 矩阵见 `.github/workflows/ci.yml`。

## fixtures

`fixtures/{host-vue,remote-a,remote-b,remote-auto,host-auto,remote-react,host-react}` 是最小联邦夹具（端口 5100–5102 一族；prod 经 NGINX 8999）。用途：

- dev/prod e2e 的宿主与远程；
- 版本矩阵升级实测（Vite 7/8 轮次，见 [P5 兼容矩阵](P5-vite7-8兼容矩阵.md)）：fixture 内 `pnpm add -D vite@^7` 升级 → e2e 全量 → `git checkout -- fixtures/ && pnpm install` 恢复基线（不留升级残留）。

注意：fixtures 默认只覆盖 vue 生态；react fixture 补齐时需同步扩矩阵。

## 门禁（build 内置）

`npm run build`（插件目录）包含三类门禁，任一失败构建失败：

1. **gzip 体积**：`dist/runtime.js` gzip ≤ 10496B；路由同步入口各 ≤ 4096B；
2. **错误码三方一致性**：`scripts/check-manual-codes.mjs` 校验源码码表（`src/runtime/errors.ts` MFU 段 / `src/context.ts` CC 段）↔ 登记表 `CODE_REGISTRY`（`src/diagnostics.ts`）↔ [API 手册错误码总表](../zh/reference/errors.md)——文档防漂移的唯一防线，**不要绕过**；
3. **错误文案三段式断言**：ERROR 级文案 `cause`/`fix` 非空（单测）。

## examples 一致性门禁

`npm run test:examples` 校验：

- 五个模板（`examples/templates/`）的场景登记与 `examples/scenarios.json` 一致（目录、包管理器、workspace 安装目录、端口）；
- 各模板 `scripts/dev.mjs` 与规范源 `examples/scripts/dev-runner.mjs` 逐字节一致；
- 模板带有效锁文件、使用 npm registry 正式包，在不含 node_modules/dist 的独立目录中验证冻结安装和构建。

新增或移动示例工程时同步 scenarios.json 后必须跑通该门禁。

## Vite 版本矩阵（CI 常驻）

- Vite 6 / 7 / 8 的 e2e 作业随 CI 常驻（Vite 8.3.2：dev 73/73 + prod 33/33）；
- React 代表性验证：React 18 + React Router 6（dev 34/34 + prod 20/20）；React 19 + RR7 随基线矩阵；
- 历史矩阵全表见 [P5-vite7-8兼容矩阵](P5-vite7-8兼容矩阵.md)。

## 调试建议

- 配置类问题先跑 `npx fulgurjs doctor`（部署面）与 `npx fulgurjs explain`（有效配置），多数问题能直接定位；
- 报错按错误码查[错误码总表](../zh/reference/errors.md)；
- dev 下改了插件源码要重启 dev server（缓存自动清，但仍需重启进程）。
