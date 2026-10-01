# 跨框架桥接示例（/bridge）

双向「子应用级跨框架嵌入」的最小可运行组合（README §8.2）：

| 组合 | 宿主 | 子应用 | 端口 |
|---|---|---|---|
| Vue 宿主 × React 子应用 | [vue-host](./vue-host)（5314） | [react-remote](./react-remote)（5303） | 先起 5303 |
| React 宿主 × Vue 子应用 | [react-host](./react-host)（5304） | [vue-remote](./vue-remote)（5313） | 先起 5313 |

四个工程互相独立：`npm install` 即用 registry 正式包；宿主同时安装两套框架并全部 singleton（桥接使用合同），子应用只装自己的框架。

## 快速开始（Vue 宿主 × React 子应用）

```bash
cd react-remote && npm install && npm run dev    # 终端 1：http://localhost:5303
cd ../vue-host  && npm install && npm run dev    # 终端 2：http://localhost:5314
```

打开 5314：点击「切换到 Bob / 登出」体验受控会话（卸载→清 context→新代次重挂）；子应用内部按钮操作其 memory 路由与本地状态。

## 快速开始（React 宿主 × Vue 子应用）

```bash
cd vue-remote  && npm install && npm run dev     # 终端 1：http://localhost:5313
cd ../react-host && npm install && npm run dev   # 终端 2：http://localhost:5304
```

## 生产构建与部署

每个示例 `npm run build` 产出各自子路径（`/bridge-vue-host/` 等）。部署时保持「子应用子路径 + 宿主子路径」并列，宿主 fulgurjs 配置的 `prod` 指向子应用子路径（已是根相对写法）。NGINX 需对各 `fulgurjs-remoteEntry.js`/`fulgurjs-manifest.json`/`index.html` 设置 no-cache，其余静态资源可长缓存。

## 范围声明（v1）

- 只做子应用级挂载/卸载；组件级混渲染（Vue 里直接渲染 React 组件）不支持。
- 子应用用 memory 路由，不与宿主 URL 同步。
- 无 JS 沙箱与 CSS 隔离：远程全局样式/body 级副作用会影响宿主，需自行命名空间治理。
