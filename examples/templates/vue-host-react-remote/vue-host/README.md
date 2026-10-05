# bridge-vue-host — Vue 宿主 × React 桥接子应用示例

`@fulgurjs/federation` 跨框架桥接的 **Vue 3 宿主**侧示例：用 `createVueBridgeApp`（统一入口 `@fulgurjs/federation/vue`）把 `bridge-react-remote/bridge` 作为受控组件挂载。

## 运行

复制整个 `vue-host-react-remote/` 模板，在模板根执行：

```bash
pnpm install --frozen-lockfile
pnpm dev                         # 同时启动宿主和子应用
pnpm build                       # 构建完整组合
# 单独启动本应用：pnpm --dir vue-host dev
```

端口、复制范围与部署路径见[组合说明](../README.md)。

## 关键点（对应 README §8.2）

- **双框架安装合同**：本宿主同时安装 `vue` + `react` + `react-dom`，shared 三键全部 `singleton: true`。
- **入口选择**：统一入口 `@fulgurjs/federation/vue`——宿主代码全部来自 /vue，不会加载 React 适配代码（6.0.0 起 /bridge、/bridge/* 深层入口已移除）。
- **`sessionKey`**：受控登录代次（非业务 props）。置 `null` = 登出态（立即卸载、不再请求）；换账号走「null → `clearAppContext()` → 新代次」顺序，保证 A 的 context 字段零残留。
- **`getContext`**：同步纯 getter（`src/host-session.ts`），桥接层校验其快照的 `sessionKey` 后才代写 AppContext。
- **`appProps`**：挂载时浅拷贝快照；函数引用（`onReady`）保留原引用；换顶层引用不重挂，需要重置时用 `:key`。
- 错误占位默认内置中文诊断 +「重试加载 / 刷新页面重试」；可用 `errorComponent` 完全接管。
