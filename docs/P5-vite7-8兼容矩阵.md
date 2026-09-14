# P5：fixtures Vite 7/8 兼容矩阵（2026-09-14 完成）

> 结论先行：**Vite 7.3.6 与 8.3.0 下 fixtures 三件套 dev+prod e2e 全部通过**，无需代码改动。
> 兼容矩阵至此覆盖 Vite 5.1.4 / 5.2.12 / 6.4.3 / 7.3.6 / 8.3.0。

## 测试方法

- fixtures：`fixtures/{host-vue,remote-a,remote-b}`（端口 5100/5101/5102，prod 经 NGINX 8999）。
- 升级方式：三套 fixture 内 `pnpm add -D vite@^7 @vitejs/plugin-vue@^6`（7 轮）；`vite@^8`（8 轮）。
  e2e 全量跑 `e2e/`（playwright `test:dev` + `test:prod`，含 HMR / shared singleton / 键重命名 /
  promise remote / MFU 错误码 / 容错恢复全功能用例）。
- 测毕 `git checkout -- fixtures/ && pnpm install` 恢复 6.4.3 基线（fixtures 不留升级残留）。

## 结果矩阵

| Vite 版本 | @vitejs/plugin-vue | dev e2e | prod e2e | 备注 |
|-----------|--------------------|---------|----------|------|
| 5.1.4 | 4.x | ✅（历史轮） | ✅（历史轮） | testbed bpm 前基线 |
| 5.2.12 | 4.x | ✅（历史轮） | ✅（历史轮） | testbed lowcode 前基线 |
| 6.4.3 | ^5.2.0 | ✅ 10/10 | ✅ 8/8 | fixtures 默认版本 |
| **7.3.6** | ^6.x | ✅ 10/10 | ✅ 8/8 | 本轮实测，零改动通过 |
| **8.3.0** | ^6.x | ✅ 10/10 | ✅ 8/8 | 本轮实测，零改动通过 |

（testbed 三应用分别使用 Vite 6.4.3/5.1.4/5.2.12，见 `docs/demo-app 环境事实`——真实工程同样覆盖。）

## 插件侧依赖 Vite 的注意点（7/8 下均验证无碍）

- `configResolved` / `resolveId` / `transform` / `transformIndexHtml(pre)` / `configureServer`
  等钩子签名在 7/8 无破坏性变化；
- dev 协作引擎依赖的 `server.middlewares`、`pluginContainer.resolveId` 行为一致；
- build 引擎（rollup 原生输出 + `emitFile chunk`）在 7/8 下产物结构不变。

## 遗留

- Vite 8 原生 rolldown 分支（`rolldown-vite`）不在本矩阵范围，待上游合并主线后再跑一轮。
- fixtures 只覆盖 vue 生态；react fixture 若将来补齐需同步扩 7/8 矩阵。
