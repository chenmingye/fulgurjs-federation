# bridge-react-host — React 宿主 × Vue 桥接子应用示例

`@fulgurjs/federation` 跨框架桥接的 **React 18/19 宿主**侧示例：用 `createReactBridgeApp`（`@fulgurjs/federation/bridge/react`）把 `bridge-vue-remote/bridge` 作为受控组件挂载（入口跑在 StrictMode 下，双 effect 安全由契约保证）。

## 运行

```bash
# 1) 先启动 Vue 子应用（5313）
cd ../vue-remote && npm install && npm run dev

# 2) 再启动本宿主（5304）
npm install
npm run dev        # http://localhost:5304
npm run build      # 产出 /bridge-react-host/ 子路径产物
```

## 关键点（对应 README §8.2）

- **双框架安装合同**：本宿主同时安装 `react` + `react-dom` + `vue`，shared 三键全部 `singleton: true`。
- **入口选择**：`@fulgurjs/federation/bridge/react` 只携带 React 宿主适配器（零 Vue）。
- **工厂选项**：`fallback`（加载中占位）、`error`（节点或 `(error, retry) => ReactNode`）、`retries`、`timeout`、`getContext`（同步纯 getter）。
- **换账号/登出**：受控 `sessionKey` 置 `null` → 等卸载 → `clearAppContext()` → 登录新账号 → 更新受控 prop。
- 子应用首次根提交前发生错误 → MFU-016（phase: mount）占位；首次提交后子应用内部错误由子应用自己的错误边界负责（跨 root 不冒泡）。
