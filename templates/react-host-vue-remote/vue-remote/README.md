# bridge-vue-remote — Vue 桥接子应用示例

`@fulgurjs/federation` 跨框架桥接的 **Vue 3 子应用**侧示例：以 `defineBridgeApp`（`@fulgurjs/federation/runtime`）导出 `mount/unmount` 契约，可被 **React 宿主**（配合 `examples/bridge/react-host`）整站挂载。

## 运行

```bash
npm install
npm run dev        # http://localhost:5313（独立运行态）
npm run build      # 产出 /bridge-vue-remote/ 子路径产物
```

## 关键点

- `src/bridge.ts`：`defineBridgeApp((props) => VueApp)` 工厂——自行装配 memory 路由（vue-router），作为 `./bridge` expose 的默认导出。
- 子应用只安装并共享 `vue`（+ `vue-router` 为直接依赖），**不安装 React**。
- `sessionKey`/`getContext` 等会话语义由宿主侧控制，见 `examples/bridge/react-host`。

配套阅读：根目录 README §8.2「跨框架桥接 API — /bridge」。
