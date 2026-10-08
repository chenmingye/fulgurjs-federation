# P5：fixtures Vite 7/8 兼容矩阵

> 结论：**Vite 7.3.6 与 8.3.0 下 fixtures 三件套 dev+prod e2e 全部通过**，无需代码改动。
> 矩阵覆盖 Vite 5.1.4 / 5.2.12 / 6.4.3 / 7.3.6 / 8.3.0；Vite 8.3.0（Rolldown）下 expose 的静态依赖 chunk 持有 CSS 时 manifest 仍能收集到该 CSS（有针对性回归）。当前必跑版本以 CI 矩阵为准，本表是历史覆盖记录。

## 测试方法

- fixtures：`fixtures/{host-vue,remote-a,remote-b}`（端口 5100/5101/5102，prod 经 NGINX 8999）。
- 升级方式：三套 fixture 内 `pnpm add -D vite@^7 @vitejs/plugin-vue@^6`（7 轮）；`vite@^8`（8 轮）。
  e2e 全量跑 `e2e/`（playwright `test:dev` + `test:prod`，含 HMR / shared singleton / 键重命名 /
  promise remote / MFU 错误码 / 容错恢复全功能用例）。
- 测毕 `git checkout -- fixtures/ && pnpm install` 恢复 6.4.3 基线（fixtures 不留升级残留）。

## 结果矩阵

| Vite 版本 | @vitejs/plugin-vue | dev e2e | prod e2e | 备注 |
|-----------|--------------------|---------|----------|------|
| 5.1.4 | 4.x | 通过（当时基线） | 通过（当时基线） | 早期基线 |
| 5.2.12 | 4.x | 通过（当时基线） | 通过（当时基线） | 早期基线 |
| 6.4.3 | ^5.2.0 | 通过 10/10 | 通过 8/8 | fixtures 默认版本 |
| **7.3.6** | ^6.x | 通过 10/10 | 通过 8/8 | 实测通过，零改动 |
| **8.3.0** | ^6.x | 通过 10/10 | 通过 8/8 | 实测通过，零改动 |

## 插件侧依赖 Vite 的注意点（7/8 下均验证无碍）

- `configResolved` / `resolveId` / `transform` / `transformIndexHtml(pre)` / `configureServer`
  等钩子签名在 7/8 无破坏性变化；
- dev 协作引擎依赖的 `server.middlewares`、`pluginContainer.resolveId` 行为一致；
- build 引擎（rollup 原生输出 + `emitFile chunk`）在 7/8 下产物结构不变。
- `packages/plugin/tests/build-manifest-css.test.ts` 在 Vite 8.3.0/Rolldown 下验证了共享静态依赖 chunk 上的 CSS 会进入 expose manifest；这是针对 CSS 注入链的构建测试，不等同于完整的 Rolldown dev/prod e2e 矩阵。

## 当前状态

- Vite 8 原生 Rolldown 的完整 fixtures dev/prod e2e 矩阵随 CI 常驻矩阵覆盖（vite 8.3.2 dev 73/73 + prod 33/33）；Jeecg 企业级应用生产全场景通过（根因修复记录见 CHANGELOG）。
- fixtures 只覆盖 vue 生态；react fixture 若将来补齐需同步扩 7/8 矩阵。（已补 React 18/19 × vite8 代表性验证：R18+RR6 dev 34/34 + prod 20/20；R19+RR7 随基线矩阵。）
