# react-host / react-remote（React 宿主与远程示例）

独立可运行的 React 联邦工程：从 npm registry 安装正式版 `@fulgurjs/federation`（无 link:/workspace:/绝对路径依赖）。

## 运行

```bash
# 终端 1：远程（5203）
cd react-remote && npm install && npm run dev

# 终端 2：宿主（5204）
cd react-host && npm install && npm run dev
# 打开 http://localhost:5204 —— 首页有远程按钮与 utils 模块，/remote-react/home 与 /remote-react/detail/42?tab=basic 是远程页面
```

## 配置形态（每个应用两份文件）

- `fulgurjs.config.ts`：纯数据（FederationOptions）——`vite.config.ts` 调 `federation(fulgurjsConfig)`，`react()` 照常放 plugins。
- React 应用统一从 `@fulgurjs/federation/react` 导入（`remoteComponent` / `useLoadRemote` / `RemoteErrorBoundary` / `createReactHostPages` 与通用运行时 API）。

## CLI

```bash
npx fulgurjs explain            # 解析联邦配置
npx fulgurjs check-pages        # 校验页面表与线上 manifest（远程 dev server 启动时）
```

与 `fixtures/`（仓库内 e2e 回归夹具，用 `link:` 依赖本地插件）的区别：examples 面向使用者复制，依赖来自 registry。
