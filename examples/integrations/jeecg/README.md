# Jeecg 自嵌套与跨框架嵌套（企业项目演示）

用 **JeecgBoot 官方开源前端（jeecgboot-vue3）** 演示联邦的真实企业级场景：官方前端自己套自己（A 套 B）、套 React 完整子应用、被 React 宿主套、以及受控三层嵌套（A → B → React-C）。不用 iframe，不用组件级混渲染冒充应用桥接。

**本目录下的 `app-a/`、`app-b/`、`react-c/`、`react-host/` 是全部四个工程的完整源码，随本仓库直接交付**——git clone 或 ZIP 下载后即可安装运行，无需再从上游生成。

## 来源与锁定

| 项 | 值 |
|---|---|
| 上游 | https://github.com/jeecgboot/JeecgBoot （MIT） |
| tag | `v3.9.5`（获取时最新 semver tag，2026-10-02 核实） |
| commit | `e3b9dc0aefe1943d9772b026f64ed671a7c82802`（fetch 脚本校验） |
| 前端目录 | `jeecgboot-vue3/`（vue 3.5 / vue-router 5 / pinia 3 / antd 4；演示实例 vite 锁 6.4.3，见下方说明） |
| 上游许可证 | MIT 原文随实例源码保留（上游文件未删改）；对上游的全部改动见 `patches/app-{a,b}.patch`（可审查的完整 diff） |
| 插件版本 | 四工程统一 `@fulgurjs/federation` 精确 `6.1.9`（npm registry 安装） |

## 快速开始（clone / ZIP 后直接跑）

环境：Node ≥ 20；`react-c`、`react-host` 用 **npm**（有 package-lock.json），`app-a`、`app-b` 用 **pnpm ≥ 9**（官方基线锁文件形态）。

```bash
# 终端 0：演示数据服务（必须先起）
node examples/integrations/jeecg/data-service/server.mjs        # http://localhost:5380

# 终端 1-4（或用 examples/scripts/start-demo.mjs --scenario jeecg）
cd examples/integrations/jeecg/react-c    && npm ci && npm run dev   # 5373
cd examples/integrations/jeecg/app-b      && pnpm install --frozen-lockfile && pnpm dev   # 5372（先于宿主）
cd examples/integrations/jeecg/app-a      && pnpm install --frozen-lockfile && pnpm dev   # 5371
cd examples/integrations/jeecg/react-host && npm ci && npm run dev   # 5374
```

打开 **http://localhost:5371** 登录后，左侧菜单「联邦演示（fulgurjs）」：

- **嵌入 Jeecg-B（自嵌套）**：A 布局内挂载 B 的完整布局（自己的菜单/页签/主题）；B 内菜单/页签/路由变化实时写入 A 的浏览器地址（`/fed/bridge/...`）；会话切换（alice→bob→登出）演示受控换代：卸载 → 清 context → 新代次重挂（挂载计数可见）；「卸载后重挂」按钮同理。
- **嵌入 React-C（跨框架）**：A 嵌 React 19 完整子应用；C 的 Link/筛选/分页写入 A 的地址（`/fed/react/orders?...`，中文 query 原样保留）。
- **三层嵌套**：进 B 的「嵌入 React-C（三层嵌套）」——地址变为 `/fed/bridge/fed/inner/orders`，即 C 的 `/orders` 经 B（`/fed/inner`）逐层同步到 A（`/fed/bridge`）；depth ≥ 2 时 B 拒绝继续嵌套（防递归）。
- **React 宿主**：http://localhost:5374 → `/jeecg-b`，B 的完整布局在 React 页内运行。

登录账号：`admin / 123456`（验证码任意；演示数据服务按 jeecg AES-CBC 契约解密比对），另有 `jeecg / 123456`。

## 生产构建与部署

```bash
# A/B 生产构建（工程锁定 Vite 6.4.3）
cd examples/integrations/jeecg/app-a && pnpm build    # base=/jeecg-a/（vite 6.4.3 生产路径）
cd examples/integrations/jeecg/app-b && pnpm build    # base=/jeecg-b/
cd examples/integrations/jeecg/react-c && npm run build
cd examples/integrations/jeecg/react-host && npm run build

# 四应用子路径静态部署 + SPA fallback + remoteEntry no-cache + API 反代（预览生产态）
node examples/scripts/serve-prod.mjs     # http://localhost:5391/jeecg-a/
```

## 实例拓扑

| 实例 | 端口 | 角色 | 说明 |
|---|---|---|---|
| app-a（JeecgBoot-Fed-A） | 5371 | 宿主（Vue） | 嵌 Jeecg-B、嵌 React-C |
| app-b（JeecgBoot-Fed-B） | 5372 | 子应用 / 中间层宿主 | 同基线独立实例：自有 Pinia/路由/主题；内部再嵌 React-C（三层链路中间层） |
| react-c | 5373 | 子应用（React 19） | 受控 memory data router（createReactBridgeRouter） |
| react-host | 5374 | 宿主（React 19） | 嵌 Jeecg-B（跨框架反向） |
| data-service | 5380 | 演示数据服务 | 登录/菜单/权限/账户/订单（**仅本地演示数据，非真实后端联调**） |

## 实例身份与数据隔离

- 同一份官方基线生成两个**独立应用实例**（A/B 各自完整的 main/bootstrap、Pinia、router、主题），非共用根实例。
- 联邦名：`jeecg-a` / `jeecg-b` / `react-c`，容器与部署地址互不冲突；`shared` 只共享 vue/vue-router/pinia/dayjs（+宿主侧 react 生态，桥接使用合同），实例状态与身份可观测（各页身份徽标 + depth + user）。
- **浏览器历史唯一写入方**：各场景的宿主（A 或 react-host）。B/C 用受控 memory 路由经 `/bridge/router/*` 端口逐层协调，内层绝不直接写 `window.history`/`location`。
- 实例数据通道隔离：B 的 API 前缀 `/jeecgboot-b`（数据服务按前缀返回 B 结构菜单）；**宿主 dev proxy 必须把长前缀 `/jeecgboot-b` 放在 `/jeecgboot` 之前**（http-proxy 按键序匹配）。

## 从上游基线生成实例（可选的可复现路径）

正常使用**不需要**本节——四个工程源码已随仓库交付。仅当想在最新上游基础上重放改造时使用：

```bash
# ① 获取校验：浅克隆 v3.9.5 + commit 校验 + 安装上游依赖（pnpm）
bash examples/integrations/jeecg/fetch-upstream.sh

# ② 生成实例 → ③ 应用补丁/配置（patches/app-{a,b}.patch 为对上游的全部改动）
cd examples/integrations/jeecg
for inst in app-a app-b; do
  rm -rf $inst && cp -R upstream/JeecgBoot-v3.9.5/jeecgboot-vue3 $inst
  patch -p1 --directory=$inst < patches/${inst}.patch
done

# ④ 匹配锁文件安装（补丁含 package.json：@fulgurjs/federation 精确 5.5.2 + vite 8.1.4）
for inst in app-a app-b; do
  (cd $inst && pnpm install --registry=https://registry.npmmirror.com)
done

# ⑤ 检查 → ⑥ 启动：见「快速开始」
```

补丁内容（`patches/app-{a,b}.patch`，对上游的**全部**改动，可审查）：

| 改动 | 目的 |
|---|---|
| `.env*`：端口/标题/代理/`VITE_GLOB_API_URL`（B 用 `-b` 前缀） | 实例身份与数据通道 |
| `src/router/{index,router}.ts`（B）：createRouter 支持 historyOverride 并返回实例 | 桥接工厂注入 createMemoryHistory |
| `src/store/index.ts`（B）：新增 createAppStore() | 子应用实例独立 Pinia |
| `src/fulgurjs/bridge.ts`（B）/ `fulgurjs.config.ts` | defineBridgeApp 契约 + 联邦配置（B 另含嵌入 C 的视图 `src/views/fed/InnerReactDemo.vue`） |
| `src/views/fed/*.vue`（A） | 宿主桥接视图（会话切换/卸载重挂/URL 同步观测） |
| `mock/sys/menu.ts`：联邦演示菜单（A/B 结构不同，catch-all 子路由防内层导航重挂） | 演示入口 |
| `vite.config.ts` + `build/vite/plugin/index.ts`：接入 `federation(fulgurjsConfig)`；生产 base `/jeecg-a/`、`/jeecg-b/`；vite 锁 6.4.3 | 联邦构建 |

react-c / react-host 为全新独立工程（非上游改造），源码即全部。

## 演示数据服务契约（真实性声明）

- 已实现端点清单：`http://localhost:5380/_endpoints`（登录/用户/权限/菜单/账户列表/订单演示集等 13 项）。
- **未实现端点返回 HTTP 404 + 诊断**（不返回 200 空成功掩盖数据缺失），并记录在 `http://localhost:5380/_unmatched` 供验收核对。
- 不连接任何生产系统；`/jeecg-boot` 前缀仅为兼容官方前端的请求路径形态。

## 已知边界（如实声明）

- 无 JS 沙箱/CSS 隔离：B 的样式与全局副作用与宿主同域（fulgurjs 桥接边界即挂载容器）；B 作为子应用时桥接工厂将 vben 布局 `fixed` 关闭以避免 fixed 定位逃逸容器（`src/fulgurjs/bridge.ts` 内 setProjectConfig）。
- 官方前端的部分页面依赖真实后端数据（如在线表单、报表），演示只保证「联邦演示」菜单与仪表盘/账户列表可用；点击其他业务页面得到的是数据服务 404 诊断（这是如实暴露，不是故障）。
- **vite 版本说明（如实声明）**：插件 5.5.0 已修复 rolldown 漏标 async 导致的 vite8 生产**构建失败**（A/B 产物 1920/1924 chunks 全部语法合法，vite 8.1.4/8.3.2 双版本验证）；但 jeecg 规模 Vue 应用在 vite8（rolldown 1.1.5/1.2.12 实测）生产**页面**仍存在启动挂起（零报错、全部资源与模块初始化完成、应用引导未执行——组合缺陷，插件 5.5.x 未解，开发态不受影响，小形态应用 vite8 生产基本可用）。因此演示实例生产路径锁 **vite 6.4.3**（vite 5–7 为插件验证过的生产区间），开发态可用上游基线版本。
