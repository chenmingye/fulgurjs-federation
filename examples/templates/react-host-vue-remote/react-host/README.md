# bridge-react-host — React 宿主 × Vue 桥接子应用示例

`@fulgurjs/federation` 跨框架桥接的 **React 18/19 宿主**侧示例：用 `createReactBridgeApp`（统一入口 `@fulgurjs/federation/react`）把 `bridge-vue-remote/bridge` 作为受控组件挂载（入口跑在 StrictMode 下，双 effect 安全由契约保证）。

## 运行

复制整个 `react-host-vue-remote/` 模板，在模板根执行：

```bash
pnpm install --frozen-lockfile
pnpm dev                         # 同时启动宿主和子应用
pnpm build                       # 构建完整组合
# 单独启动本应用：pnpm --dir react-host dev
```

端口、复制范围与部署路径见[组合说明](../README.md)。

## 关键点（对应 README §8.2）

- **双框架安装合同**：本宿主同时安装 `react` + `react-dom` + `vue`，shared 三键全部 `singleton: true`。
- **入口选择**：统一入口 `@fulgurjs/federation/react`——宿主代码全部来自 /react，不会加载 Vue 适配代码（6.0.0 起 /bridge、/bridge/* 深层入口已移除）。
- **工厂选项**：`fallback`（加载中占位）、`error`（节点或 `(error, retry) => ReactNode`）、`retries`、`timeout`、`getContext`（同步纯 getter）。
- **换账号/登出**：受控 `sessionKey` 置 `null` → 等卸载 → `clearAppContext()` → 登录新账号 → 更新受控 prop。
- 子应用首次根提交前发生错误 → MFU-016（phase: mount）占位；首次提交后子应用内部错误由子应用自己的错误边界负责（跨 root 不冒泡）。
