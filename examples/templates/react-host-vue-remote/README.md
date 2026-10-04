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
