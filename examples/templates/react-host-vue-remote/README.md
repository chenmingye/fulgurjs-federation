# react-host-vue-remote：完整子应用桥接模板

`react-host/` 是宿主，`vue-remote/` 是子应用。复制整个模板目录，在根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm dev
# http://localhost:5304
```

宿主展示远程应用、上下文传递与会话切换；切换用户或登出会卸载旧代次。远程独立运行与被嵌入时使用不同路由接线。

- 单独启动：`pnpm dev:remote`、`pnpm dev:host`。
- 生产构建：`pnpm build`，按各子应用配置的 base 部署 dist；远程入口与宿主的 prod 地址必须一致。各子应用 README 提供配置与部署细节。
- 本模板展示挂载、卸载与会话，不开启宿主/子应用 URL 同步；需要深链、刷新和前进后退，使用 [showcase](../showcase/)。
- 无 JS 沙箱或自动 CSS 隔离，子应用全局样式和 body 副作用需要自行管理。

环境要求见[模板指南](../README.md)。所有依赖来自 registry，不需要本仓库源码或其他模板。

## 改端口（四处必须同步，漏一处启动器会被旧端口卡住）

- 改vue-remote（默认 5313）：① `vue-remote/package.json` 的 `dev` 与 `preview` 两个脚本的 `--port 5313`；② `react-host/fulgurjs.config.ts` 里 `remotes['bridge-vue-remote'].dev` 的 `http://localhost:5313`；③ 根 `scripts/dev.config.json` 里 vue-remote 的 `port`（**必改**：启动器预检/探活都读它）；④ 本 README 顶部端口表。
- 改react-host（默认 5304）：① `react-host/package.json` 的 `dev`/`preview` `--port 5304`；② `scripts/dev.config.json`；③ 本 README 端口表。
- 生产部署地址（`prod`，如 `/vue-remote`）是站点路径，与 dev 端口无关，改端口不要动它。改名（容器名）不建议：还需同步 spec 前缀与页面表。
