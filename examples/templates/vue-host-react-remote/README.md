# vue-host-react-remote：完整子应用桥接模板

> 本目录是 6.9.0 源码候选：已改用 defineApplication，尚未测试和发布。源码依赖已锁定 6.9.0；正式发布前不要拿旧 registry 包运行这份代码。验收先使用本次候选 tarball，发布后再按下列冻结安装命令验证正式包。


`vue-host/` 是宿主，`react-remote/` 是子应用。复制整个模板目录，在根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm dev
# http://localhost:5314
```

宿主展示远程应用、上下文传递与会话切换；切换用户或登出会卸载旧代次。远程独立运行与被嵌入时使用不同路由接线。

- 单独启动：`pnpm dev:remote`、`pnpm dev:host`。
- 生产构建：`pnpm build`，按各子应用配置的 base 部署 dist；远程入口与宿主的 prod 地址必须一致。各子应用 README 提供配置与部署细节。
- 本模板展示挂载、卸载与会话，不开启宿主/子应用 URL 同步；需要深链、刷新和前进后退，使用 [showcase](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/showcase)。
- 无 JS 沙箱或自动 CSS 隔离，子应用全局样式和 body 副作用需要自行管理。

环境要求见[模板指南](https://github.com/chenmingye/fulgurjs-federation/blob/master/examples/templates/README.md)。所有依赖来自 registry，不需要本仓库源码或其他模板。

## 改端口（四处必须同步，漏一处启动器会被旧端口卡住）

- 改react-remote（默认 5303）：① `react-remote/package.json` 的 `dev` 与 `preview` 两个脚本的 `--port 5303`；② `vue-host/fulgurjs.config.ts` 里 `remotes['bridge-react-remote'].dev` 的 `http://localhost:5303`；③ 根 `scripts/dev.config.json` 里 react-remote 的 `port`（**必改**：启动器预检/探活都读它）；④ 本 README 顶部端口表。
- 改vue-host（默认 5314）：① `vue-host/package.json` 的 `dev`/`preview` `--port 5314`；② `scripts/dev.config.json`；③ 本 README 端口表。
- 生产部署地址（`prod`，如 `/react-remote`）是站点路径，与 dev 端口无关，改端口不要动它。改名（容器名）不建议：还需同步 spec 前缀与页面表。

## 一键运行生产产物

```bash
pnpm build
pnpm prod
```

`prod` 只服务本次 dist，不启动远程开发服务器。它复用 scripts/dev.config.json 的宿主端口，从实际构建入口推导 base，并把远程静态产物挂在同源子路径。无需为本地复现手写 Nginx；部署真实服务器时仍按部署指南配置。多宿主模板分别启动各宿主地址，不把两个宿主的根资源混在一起。先停止 dev，端口占用会失败并停止本次已起服务；不会关闭已有占用进程。Ctrl+C 关闭本次生产服务。

## 插件代码阅读地图

| 文件 | 职责 |
|---|---|
| `react-remote/src/application.tsx` | 本应用唯一装配；main 只负责调用 start |
| `vue-host/src/application.ts` | 本应用唯一装配；main 只负责调用 start |
| `react-remote/fulgurjs.config.ts` | 本应用的远程地址、exposes、实际共享依赖 |
| `vue-host/fulgurjs.config.ts` | 本应用的远程地址、exposes、实际共享依赖 |
| `scripts/dev.mjs` / `scripts/prod.mjs` | 统一开发/生产启动器；业务接入不复制它们到应用源码 |

`application` 是新增的插件装配文件，`main` 是已有入口接线；页面组件、业务路由、权限和数据不是每个项目都必写的联邦配置。跨框架基础组合不逐页登记子应用菜单；逐页远程页面模板的页面表仅服务它所展示的逐页场景。`src/fulgurjs/types/` 是插件生成目录，按远程实际版本同步，不维护人工伪造的声明或旧缓存。
