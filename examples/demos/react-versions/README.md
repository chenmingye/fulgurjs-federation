# React 18 / 19 隔离与共享协商恢复

五个独立应用，React、react-dom 的物理版本与共享声明精确对应。正式依赖由 npm registry 安装，代码与锁文件一起交付。

| 应用 | 端口 | 依赖 / 作用域 | 用途 |
|---|---|---|---|
| host | 5440 | React 19.3.0 / default | 宿主自己的 root、Hooks、Context 与状态 |
| remote18 | 5441 | React 18.3.1 / react18 | 与 React 19 同页隔离运行 |
| remote18-strict | 5442 | React 18.3.1 / default | 不兼容时拒绝；Vue 宿主对齐后正常挂载 |
| remote19 | 5443 | React 19.3.0 / default | 对齐版本后的恢复配方 |
| vue-host | 5445 | Vue 3.5.43 + React/renderer 18.3.1 / default | 覆盖 Vue 宿主嵌 React 18 的实际挂载 |

## 安装与打开

在仓库根目录运行：

```bash
for app in host remote18 remote18-strict remote19 vue-host; do
  (cd "examples/demos/react-versions/$app" && npm ci)
done
node examples/scripts/start-demo.mjs --scenario react-versions
# 打开 http://localhost:5440/ 和 http://localhost:5445/
# 完成后只停这一场景：
node examples/scripts/stop-demo.mjs --scenario react-versions
```

宿主页的「异步选择的策略（1.0.0）」来自真正异步的 resolveShare，选择原注册表之外的低版本条目。本地 provider 是 2.0.0，文本为「本地策略（不应被选中）」；出现本地文本即说明第一次静态消费没有遵守 hook。

React 18 子应用始终显示在独立作用域中。点击「加载不兼容的 React 18」在 default 中触发 MFU-003；点击「加载版本已对齐的 React 19」切换到实际安装 React 19 的远程并恢复挂载。此流程验证同页重新加载配置已修正的远程，**不承诺浏览器已经求值的同一 URL 模块在重新部署后自动变更**。宿主与隔离子应用原有计数保留，页面不刷新。

## 自动验收

```bash
cd examples/demos/react-versions
npm ci
npx playwright install chromium
npm run test:dev
npm run test:prod
```

验收脚本自启应用/隔离生产站点，遇到占用端口直接退出，不复用未知服务；完成或失败后关闭自身进程。生产站点仅用本次构建的 dist。dev 先真实打开远程完成依赖预构建，再用新的宿主页验收，避免冷启动 HMR reload 重置业务状态。

验证内容：

- 异步 hook 确实覆盖首次静态导入，未使用本地 provider。
- React 18 与 19 的真实实例对象不同；各自动态 loadShare 与静态导入身份一致。
- renderer 与 React 大版本匹配，自有 Context、Hooks 与独立计数正常。
- 严格拒绝发生在子应用挂载前；宿主仍可交互。
- 对齐版本后的同页恢复，宿主与隔离子应用的已有状态保留。
- Vue 宿主与 React 18 的物理依赖及共享声明均对齐后，实际挂载与交互通过。
- 正常流程零 console error、零 pageerror；负向流程只允许带 MFU-003 的预期诊断。

结果与三态截图：`examples/.run/react-versions/{vite}/{dev,prod}/`（不入库）。CI 的 `bridge-versions` 作业用 Vite 6/8 分别执行 dev 与生产验收；CI 将源码候选构建装入锁定应用，与发布后的 registry 包验收分别记录。

## API 与源码

- `federation`、`runtimePlugins`、`shared.requiredVersion/strictVersion/shareScope`：各应用的 `vite.config.ts`。
- `resolveShare`、原表之外的 ShareEntry：`host/src/share-plugin.ts`。
- `createReactBridgeApp`、`createVueBridgeApp`：两宿主入口。
- `defineBridgeApp`、`loadShare`、`unwrapDefault`：各远程 `src/bridge.tsx`。

React 与 renderer 整组隔离；不同 root 通过普通 props/稳定回调传数据，不跨版本传 ReactElement 或 Context。没有 HTML 的自定义入口须先动态协商，再动态导入消费方。
