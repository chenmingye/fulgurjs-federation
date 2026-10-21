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

端口、复制范围、安装与验收要求与部署路径见[组合说明](../README.md)。

## 关键点

- **双框架安装合同**：本宿主同时安装 `vue` + `react` + `react-dom`，shared 三键全部 `singleton: true`。
- **入口选择**：统一入口 `@fulgurjs/federation/vue`——宿主侧的联邦适配 API 从 /vue 导入。
- **`session`**：绑定稳定的业务身份 getter。返回用户ID表示已登录，`null` 表示退出，`undefined` 表示身份恢复中。插件自动管理代次、恢复与卸载；同身份刷新 token 不重挂。
- **`getContext`**：同步纯 getter（`src/fulgurjs/host/context.ts`），不手工填写 `sessionKey`，由桥接层补入自动管理的代次。token 通过函数读取当前凭据，避免刷新后继续发送旧 token。
- **`appProps`**：挂载时浅拷贝快照；函数引用（`onReady`）保留原引用；换顶层引用不重挂，需要重置时用 `:key`。
- 错误占位默认内置中文诊断 +「重试加载 / 刷新页面重试」；可用 `errorComponent` 完全接管。

### 登录接线

Vue宿主在 `src/fulgurjs/host/context.ts` 提供现有业务身份和上下文；挂载配置使用 `session: sessionIdentity`。不在登录/登出流程调用 renew/clear，不手工传 sessionKey。页面提供“刷新 token”按钮，同身份刷新不应增加 onReady 次数；换到 Bob 重挂、登出卸载。真实工程使用已有账号系统，不复制演示登录数据。
