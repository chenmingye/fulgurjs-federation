# bridge-vue-remote — Vue 桥接子应用示例

`@fulgurjs/federation` 跨框架桥接的 **Vue 3 子应用**侧示例：以 `defineBridgeApp`（`@fulgurjs/federation/runtime`）导出 `mount/unmount` 契约，可被 **React 宿主**（配合 `examples/templates/react-host-vue-remote/react-host-vue-remote/react-host`）整站挂载。

## 运行

复制整个 `react-host-vue-remote/` 模板，在模板根执行：

```bash
pnpm install --frozen-lockfile
pnpm dev                         # 同时启动宿主和子应用
pnpm build                       # 构建完整组合
# 单独启动本应用：pnpm --dir vue-remote dev
```

端口、复制范围与部署路径见[组合说明](../README.md)。

## 关键点

- `src/bridge.ts`：`defineBridgeApp((props) => VueApp)` 工厂——自行装配 memory 路由（vue-router），作为 `./bridge` expose 的默认导出。
- 子应用只安装并共享 `vue`（+ `vue-router` 为直接依赖），**不安装 React**。
- `sessionKey`/`getContext` 等会话语义由宿主侧控制，见 `examples/templates/react-host-vue-remote/react-host-vue-remote/react-host`。

配套阅读：根目录 README §8.2「跨框架桥接 API — /bridge」。
