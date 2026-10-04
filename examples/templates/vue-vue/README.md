# Vue 联邦示例：宿主 + 远程（可直接复制运行）

本目录是一对完整、可独立安装运行的 Vue 3 模块联邦演示：

| 目录 | 角色 | 端口 | 说明 |
| --- | --- | --- | --- |
| [`remote/`](./remote/) | **Vue 远程**（被消费方） | 5213 | 暴露可点击按钮组件、普通 TS 工具模块、联邦首页与参数详情页 |
| [`host/`](./host/) | **Vue 宿主**（消费方） | 5214 | 消费 vue-remote 的组件/模块/页面，提供导航与懒加载 |

- 包管理器为 **pnpm**；复制整个模板目录，包含 workspace 和锁文件。插件使用 registry 正式精确版本。

## 最快开始（从干净拷贝）

```bash
cd examples/templates/vue-vue  # 若已复制出去，进入复制后的模板根
pnpm install --frozen-lockfile
pnpm dev                       # 同时启动远程和宿主
# http://localhost:5214
```

环境要求与 pnpm 版本说明见[模板指南](../README.md)。单独启动用 `pnpm dev:remote`、`pnpm dev:host`，构建整个组合用 `pnpm build`。

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
pnpm --dir remote build -- --base=/vue-remote/   # 产物 remote/dist/（子路径 base 与部署位置对应）
pnpm --dir host build   # 产物 host/dist/
```

部署形态：宿主部署在站点根 `/`，远程部署在子路径 `/vue-remote/`（与 `host/fulgurjs.config.ts` 的 `prod: '/vue-remote'` 对应）。远程工程的 `vite.config.ts` 已配置 `base` 随 `build` 命令自动切换为 `/vue-remote/`（dev 不变）——Vite 的 preload helper 会把依赖链接转成根绝对路径，远程子路径部署必须带此 base。最小 Nginx 配置（SPA fallback + 联邦入口正确 Content-Type）：

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

## 改端口（四处必须同步，漏一处启动器会被旧端口卡住）

- 改remote（默认 5213）：① `remote/package.json` 的 `dev` 与 `preview` 两个脚本的 `--port 5213`；② `host/fulgurjs.config.ts` 里 `remotes['vue-remote'].dev` 的 `http://localhost:5213`；③ 根 `scripts/dev.config.json` 里 remote 的 `port`（**必改**：启动器预检/探活都读它）；④ 本 README 顶部端口表。
- 改host（默认 5214）：① `host/package.json` 的 `dev`/`preview` `--port 5214`；② `scripts/dev.config.json`；③ 本 README 端口表。
- 生产部署地址（`prod`，如 `/remote`）是站点路径，与 dev 端口无关，改端口不要动它。改名（容器名）不建议：还需同步 spec 前缀与页面表。
