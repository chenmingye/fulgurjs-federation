# Vue 联邦示例：宿主 + 远程（可直接复制运行）

本目录是一对完整、可独立安装运行的 Vue 3 模块联邦演示：

| 目录 | 角色 | 端口 | 说明 |
| --- | --- | --- | --- |
| [`remote/`](./remote/) | **Vue 远程**（被消费方） | 5213 | 暴露可点击按钮组件、普通 TS 工具模块、联邦首页与参数详情页 |
| [`host/`](./host/) | **Vue 宿主**（消费方） | 5214 | 消费 vue-remote 的组件/模块/页面，提供导航与懒加载 |

- 包管理器统一为 **npm**；插件依赖为 **registry 精确正式包**（`@fulgurjs/federation`，见各 `package.json`），不依赖本仓库源码、monorepo workspace 或父目录 node_modules。
- 把 `host/` 与 `remote/` 复制到**两个互不共享父目录的目录**后，各自 `npm install` 仍可运行。

## 最快开始（从干净拷贝）

```bash
# 终端 1 —— 先启动远程
cd vue/remote
npm install
npm run dev            # http://localhost:5213

# 终端 2 —— 再启动宿主
cd vue/host
npm install
npm run dev            # http://localhost:5214
```

打开 <http://localhost:5214/>：

- 「首页」里有来自 vue-remote 的**可点击计数按钮**（进入页面才按需加载）。
- 「远程首页 / 远程详情」是 vue-remote 暴露的**联邦页面**，渲染在宿主路由出口内；详情页演示真实路由参数（`/remote/detail/7?tab=basic`）。
- 「TS 模块调用」演示宿主调用 vue-remote 暴露的普通 TS 模块（`loadRemote` + 显式调用导出）。
- 停掉远程 dev server 再刷新宿主页面 → 插件默认错误占位出现，提供**「重试加载」**（同页恢复）与**「刷新页面重试」**（整页恢复）两个操作；重启远程后点击即可恢复业务。

## 演示的功能点

| 功能 | 位置 |
| --- | --- |
| 远程可点击组件（计数、本地状态在远程组件内） | `remote/src/exposes/ClickButton.vue`，宿主首页消费 |
| 普通 TS 模块调用 | `remote/src/exposes/utils.ts`，`host/src/pages/UtilsDemo.vue` |
| 联邦页面（远程首页 / 带参数详情页） | `remote/src/exposes/pages/`，页面表见 `host/fulgurjs.config.ts` |
| 宿主导航 + 懒加载（不批量预取） | `host/src/App.vue` + `host/src/main.ts`（路由级按需加载） |
| 默认加载/错误/恢复占位 | 插件内置（`remoteComponent` / `createHostPages`），示例不自建错误组件 |

## 生产构建与最小 Nginx 部署

```bash
cd vue/remote && npm run build -- --base=/vue-remote/   # 产物 remote/dist/（子路径 base 与部署位置对应）
cd vue/host   && npm run build   # 产物 host/dist/
```

部署形态：宿主部署在站点根 `/`，远程部署在子路径 `/vue-remote/`（与 `host/fulgurjs.config.ts` 的 `prod: '/vue-remote'` 对应）。远程构建产物内部的 chunk 引用是相对路径，天然适配子路径。最小 Nginx 配置（SPA fallback + 联邦入口正确 Content-Type）：

```nginx
server {
  listen 8080;

  # 宿主（站点根）
  root /srv/vue-demo/host;
  index index.html;

  # 远程静态资源（子路径）
  location /vue-remote/ {
    alias /srv/vue-demo/remote/;
    try_files $uri $uri/ =404;
  }

  # 宿主 SPA fallback：深链刷新（如 /remote/detail/7）回退到 index.html
  location / {
    try_files $uri /index.html;
  }
}
```

部署后访问 `http://<host>:8080/`，深链 `http://<host>:8080/remote/detail/7?tab=basic` 直接刷新也能到达同一页面（Nginx fallback → 宿主 index.html → 插件路由解析）。

## HMR 边界（dev）

- 远程 `.vue` 组件修改（模板/样式/兼容的 script）会经远程 dev server 自动热更新到**正在显示的宿主页面**，组件本地状态保留，无整页刷新。
- 远程普通 TS 模块修改同样自动传播到引用它的组件边界。
- 不兼容的导出结构变化按 Vite/Vue 标准触发整页刷新（full-reload）——这是框架标准行为，不是「任意改动都保活」。

## examples 与 fixtures 的区别

`examples/` 面向**使用者**：拷贝、安装 registry 正式包、独立运行。
仓库根的 `fixtures/` 是**插件内部回归夹具**（源码 `link:` 到插件工作区），不要当作使用模板。
