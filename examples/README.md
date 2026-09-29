# fulgurjs-federation 示例总入口

选择你的框架，复制对应宿主与远程两个目录，`npm install` 后即可看到完整的模块联邦演示。四个工程互相独立：不依赖本仓库源码、monorepo workspace 或父目录 node_modules，插件依赖为 npm registry 精确正式包。

## Vue（宿主 5214 / 远程 5213）

完整操作步骤见 **[vue/README.md](./vue/README.md)**。

```bash
cd examples/vue/remote && npm install && npm run dev   # 终端 1：vue-remote，http://localhost:5213
cd examples/vue/host   && npm install && npm run dev   # 终端 2：vue-host，http://localhost:5214
```

## React（宿主 5204 / 远程 5203）

完整操作步骤见 **[react/README.md](./react/README.md)**。

```bash
cd examples/react/remote && npm install && npm run dev   # 终端 1：react-remote，http://localhost:5203
cd examples/react/host   && npm install && npm run dev   # 终端 2：react-host，http://localhost:5204
```

## 每对示例演示什么

- 远程可点击计数组件（本地状态在远程组件内，宿主页面直接操作）
- 普通 TS 模块跨应用调用（宿主展示真实返回值）
- 远程首页 + 带真实路由参数的详情页（深链刷新可恢复）
- 宿主导航、路由级懒加载（首页不批量预取未访问的远程页面）
- 插件默认加载/错误占位与恢复操作（**重试加载** 同页恢复；**刷新页面重试** 整页恢复）
- 生产构建 + 最小 Nginx 部署（含 SPA fallback）

## 目录

```text
examples/
├── README.md / README.en.md   # 本入口（中/英）
├── vue/
│   ├── README.md              # Vue 一对示例的组合说明
│   ├── host/                  # Vue 宿主（vue-host，5214）
│   └── remote/                # Vue 远程（vue-remote，5213）
└── react/
    ├── README.md              # React 一对示例的组合说明
    ├── host/                  # React 宿主（react-host，5204）
    └── remote/                # React 远程（react-remote，5203）
```

> `examples/` 面向使用者拷贝运行；仓库根的 `fixtures/` 是插件内部回归夹具（源码 link 到插件工作区），请勿当作使用模板。

> 提示：复制后可在项目根目录运行 `npx fulgurjs explain`（纯本地、无网络）核对联邦配置摘要。
