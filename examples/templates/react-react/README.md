# React 联邦示例：宿主 + 远程（可直接复制运行）

本目录是一对完整、可独立安装运行的 React 19 模块联邦演示：

| 目录 | 角色 | 端口 | 说明 |
| --- | --- | --- | --- |
| [`remote/`](./remote/) | **React 远程**（被消费方） | 5203 | 暴露可点击按钮组件、普通 TS 工具模块、联邦首页与参数详情页 |
| [`host/`](./host/) | **React 宿主**（消费方） | 5204 | 消费 react-remote 的组件/模块/页面，提供导航与懒加载 |

- 包管理器为 **pnpm**；复制整个模板目录，包含 workspace 和锁文件。插件使用 registry 正式精确版本。

## 最快开始（从干净拷贝）

```bash
cd examples/templates/react-react  # 若已复制出去，进入复制后的模板根
pnpm install --frozen-lockfile
pnpm dev                       # 同时启动远程和宿主
# http://localhost:5204
```

环境要求与 pnpm 版本说明见[模板指南](../README.md)。单独启动用 `pnpm dev:remote`、`pnpm dev:host`，构建整个组合用 `pnpm build`。

打开 <http://localhost:5204/>：

- 「首页」里有来自 react-remote 的**可点击计数按钮**（进入页面才按需加载）。
- 「远程首页 / 远程详情」是 react-remote 暴露的**联邦页面**；详情页演示真实路由参数（`/remote/detail/7?tab=basic`）。
- 「TS 模块调用」演示 `useLoadRemote` 调用 react-remote 暴露的普通 TS 模块。
- 停掉远程 dev server 再刷新宿主页面 → 插件默认错误占位出现，提供**「重试加载」**（同页恢复）与**「刷新页面重试」**（整页恢复）两个操作；重启远程后点击即可恢复业务。

## 演示的功能点

| 功能 | 位置 |
| --- | --- |
| 远程可点击组件（Hooks 计数） | `remote/src/exposes/ClickButton.tsx`，宿主首页消费 |
| 普通 TS 模块调用（useLoadRemote） | `remote/src/exposes/utils.ts`，`host/src/pages/UtilsDemo.tsx` |
| 联邦页面（远程首页 / 带参数详情页） | `remote/src/exposes/pages/`，页面表见 `host/fulgurjs.config.ts` |
| 宿主导航 + 懒加载（不批量预取） | `host/src/main.tsx`（路由级按需加载） |
| 默认加载/错误/恢复占位 | 插件内置（`remoteComponent` / `createReactHostPages`），示例不自建错误组件 |

## 生产构建与最小 Nginx 部署

```bash
pnpm --dir remote build -- --base=/react-remote/   # 产物 remote/dist/（子路径 base 与部署位置对应）
pnpm --dir host build   # 产物 host/dist/
```

部署形态：宿主部署在站点根 `/`，远程部署在子路径 `/react-remote/`（与 `host/fulgurjs.config.ts` 的 `prod: '/react-remote'` 对应）。最小 Nginx 配置：

```nginx
server {
  listen 8081;

  root /srv/react-demo/host;
  index index.html;

  location /react-remote/ {
    alias /srv/react-demo/remote/;
    try_files $uri $uri/ =404;
  }

  # 宿主 SPA fallback：深链刷新回退到 index.html
  location / {
    try_files $uri /index.html;
  }
}
```

部署后访问 `http://<host>:8081/`，深链 `http://<host>:8081/remote/detail/7?tab=basic` 直接刷新也能到达同一页面。

## HMR 边界（dev）

- 远程组件修改（文本/样式/Hooks 结构不变的改动）自动热更新到**正在显示的宿主页面**，组件本地状态保留，无整页刷新（5.2.0 起跨源 Fast Refresh 由插件保证单一 react-refresh 实例）。
- 远程普通 TS 模块修改同样自动传播到引用它的组件边界。
- React Refresh 不兼容的导出/Hooks 结构变化、Vite 要求 full-reload 的改动会按框架标准重新挂载或整页刷新——不承诺任意改动保活。

## examples 与 fixtures 的区别

`examples/` 面向**使用者**：拷贝、安装 registry 正式包、独立运行。
仓库根的 `fixtures/` 是**插件内部回归夹具**（源码 `link:` 到插件工作区），不要当作使用模板。
