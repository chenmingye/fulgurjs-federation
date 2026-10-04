# bridge-react-remote — React 桥接子应用示例

`@fulgurjs/federation` 跨框架桥接的 **React 18/19 子应用**侧示例：以 `defineBridgeApp`（`@fulgurjs/federation/react`）导出 `mount/unmount` 契约，可被 **Vue 宿主**（配合 `examples/templates/vue-host-react-remote/vue-host-react-remote/vue-host`）整站挂载。

## 运行

复制整个 `vue-host-react-remote/` 模板，在模板根执行：

```bash
pnpm install --frozen-lockfile
pnpm dev                         # 同时启动宿主和子应用
pnpm build                       # 构建完整组合
# 单独启动本应用：pnpm --dir react-remote dev
```

端口、复制范围与部署路径见[组合说明](../README.md)。

## 关键点

- `src/bridge.tsx`：`defineBridgeApp((props) => <MemoryRouter>…</MemoryRouter>)`，作为 `./bridge` expose 的默认导出。
- `mount` 的 Promise 在**首次根提交完成后**才 resolve（契约内建提交探针）；首次渲染前报错会拒绝挂载并转 MFU-016。
- `react-dom/client` 在实际 mount 时才按需加载；共享子路径 `react-dom/client` 与 `react/jsx-runtime` 由宿主/子应用 shared 配方协商单实例。
- 子应用只安装并共享 `react` + `react-dom`（+ `react-router-dom` 为直接依赖），**不安装 Vue**。

配套阅读：根目录 README §8.2「跨框架桥接 API — /bridge」。
