# fulgurjs-federation 模板（examples/templates/）

五个可独立复制、`pnpm install` 后直接运行的联邦接入模板。全部使用 **npm registry 正式包** `@fulgurjs/federation@5.8.0`（精确版本 + pnpm 锁文件），不依赖本仓库源码、workspace 或父目录。

## 获取模板的两种方式

```bash
# 方式一（推荐）：CLI 创建——不需要 clone 本仓库
npx @fulgurjs/federation create vue-vue --dir my-federation
#   交互式：npx @fulgurjs/federation create
#   模板清单：npx @fulgurjs/federation create --list

# 方式二：从仓库复制（clone 或下载 ZIP 后）
cp -r examples/templates/vue-vue /wherever/you/want && cd /wherever/you/want/vue-vue
```

`create` 复制完整模板并默认执行 `pnpm install --frozen-lockfile`；目标目录非空默认拒绝（`--force` 只增量复制，不删除已有文件）；安装失败非零退出并显示原因。它不做应用名称/端口改写——需要改端口时按下方清单手工同步。

## 选择模板

| 模板 | 组合 | 演示能力 | 复制范围 |
|---|---|---|---|
| [`vue-vue/`](vue-vue) | Vue 宿主 × Vue 远程 | 远程组件/TS 模块、路由懒加载、错误占位与重试、生产部署 | 整个 `vue-vue/` 目录 |
| [`react-react/`](react-react) | React 宿主 × React 远程 | 同上（React 版：remoteComponent / useLoadRemote / ErrorBoundary） | 整个 `react-react/` 目录 |
| [`vue-host-react-remote/`](vue-host-react-remote) | Vue 宿主 × React 子应用 | 跨框架完整子应用桥接（挂载/卸载/appProps 快照） | 整个 `vue-host-react-remote/` 目录 |
| [`react-host-vue-remote/`](react-host-vue-remote) | React 宿主 × Vue 子应用 | 同上（反方向） | 整个 `react-host-vue-remote/` 目录 |
| [`showcase/`](showcase) | Vue/React 双宿主 × Vue/React 双远程 | **完整演示**：双向跨框架桥接、URL 同步（深链刷新/前进后退）、多远程并存、同框架子应用对照 | 整个 `showcase/` 目录 |

每个模板目录是一个完整 pnpm workspace（根 `package.json` + `pnpm-workspace.yaml` + `pnpm-lock.yaml`）。**必须复制整个模板目录**，不能只复制其中的子应用。

## 最短运行路径

环境要求：Node ≥ 20（实测 24.x）、pnpm ≥ 9。**推荐 pnpm ≥ 12**（锁文件由 pnpm 12 生成；9/10/11 亦可安装）。平台口径：macOS 与 Linux（CI）实测；启动器含 Windows 兜底路径但**未经验证**。

> **pnpm 12 用户注意**：各模板 `pnpm-workspace.yaml` 已带 `allowBuilds: {esbuild: true, vue-demi: true}`（pnpm 12 的构建脚本批准形态；pnpm 9–11 忽略该键——esbuild ≥0.16 的二进制经 optionalDependencies 平台包分发，postinstall 仅做校验，不影响安装与运行）。若用 pnpm 10/11 且提示未批准构建脚本，可改回 `onlyBuiltDependencies: [esbuild, vue-demi]` 或按提示 `pnpm approve-builds`。**不要**让 pnpm 把 `allowBuilds: <pkg>: set this to true or false` 的占位提示留在 yaml 里——把值改成 `true` 即可通过（pnpm 12 会在遇到未决构建脚本时自动写入该提示行）。

```bash
# 以 vue-vue 为例；其余模板把目录名换掉即可
pnpm install            # 安装（锁文件冻结：pnpm install --frozen-lockfile）
pnpm dev                # 统一启动器：远程(5213) + 宿主(5214) 按顺序启动
# 打开 http://localhost:5214 —— 远程按钮、TS 模块调用、路由懒加载、错误恢复演示
```

各模板端口（远程先于宿主启动）：

| 模板 | 远程 | 宿主 |
|---|---|---|
| vue-vue | 5213 | 5214 |
| react-react | 5203 | 5204 |
| vue-host-react-remote | react-remote 5303 | vue-host 5314 |
| react-host-vue-remote | vue-remote 5313 | react-host 5304 |
| showcase | vue-remote 5335 / react-remote 5333 | vue-host 5334 / react-host 5336 |

## 统一 dev 启动器（`pnpm dev`）的行为

五个模板共用同一份启动脚本（模板内 `scripts/dev.mjs`，规范源在仓库 `examples/scripts/dev-runner.mjs`，`npm run test:examples` 校验一致）。行为：

- **启动前端口预检**：任一端口被占用则拒绝启动（退出码 2），打印占用查看命令与处理方法；不会替你结束端口上的既有服务。
- **按序启动、逐个探活**：远程先启动，就绪后再启动宿主；日志带 `[应用名]` 前缀。
- **失败整组退出**：任一应用启动失败/超时/运行中退出，停止本次启动的全部进程（退出码 1）并打印该应用日志尾部；不留下半残组合。
- **Ctrl+C / SIGTERM 清理**：只清理本次启动的子进程（进程组级），不依赖 PID 文件，不按端口批量杀进程。
- 单独调试某个应用：`pnpm run dev:remote` / `pnpm run dev:host`（showcase 有四个 `dev:*` 入口），绕过启动器直接启动。
- 「dev server 已监听」表示端口就绪；页面可用以浏览器实际加载为准。

## 改端口的固定清单

模板不做端口/名称自动改写；需要改时同步以下三处（以 vue-vue 的远程 5213 为例）：

1. `remote/package.json` 的 `dev` 与 `preview` 脚本里的 `--port 5213`；
2. `host/fulgurjs.config.ts` 中 `remotes['vue-remote'].dev` 的 `http://localhost:5213`；
3. （可选）根 `scripts/dev.config.json` 里该应用的 `port`，保持启动器/文档/场景表一致。

宿主自身端口在 `host/package.json` 的 dev/preview 脚本。跨应用容器名（如 `vue-remote`）改名时，还需同步宿主代码中的 spec 前缀（`vue-remote/...`）与页面表——不建议改名。

## 生产构建与部署

`pnpm build` 后产物为标准 Vite dist，远程会多生成 `fulgurjs-remoteEntry.js` 与 `fulgurjs-manifest.json`，用 no-cache 规则部署，SPA fallback 配置见 [Vue 模板部署说明](vue-vue/README.md#生产构建与最小-nginx-部署)。部署后可用 `npx fulgurjs doctor --base <站点> --apps <部署子目录>` 体检（`--apps` 是部署子目录，不是容器名）。

## 模板覆盖的能力 → 去哪看

- **组件/模块加载、错误占位、重试恢复**：Vue/Vue 与 React/React 模板首页即演示。
- **跨框架完整子应用挂载/卸载、appProps 快照、会话切换**：两个桥接模板。
- **URL 同步（子应用内部路由 ↔ 宿主地址、刷新直达、前进后退、多层嵌套）**：showcase，宿主页 URL 变化随子应用导航联动。
- **shared 共享协商、React 18/19 隔离、页面接入（createHostPages）、错误注入与恢复、Jeecg 三层嵌套**：不在模板内重复造码，直接用[统一示例入口](../README.md) 中的对应场景（`examples/demos/shared`、`examples/demos/react-versions`、`examples/demos/pages-cli`、`examples/demos/errors`、`examples/integrations/jeecg`），同样可独立下载运行（见 [功能演示说明](../demos/README.md)）。

## 与展示门户的关系

这五个模板也是门户的基础场景工程。门户通过 `examples/scenarios.json` 直接启动本目录里的宿主与远程，不维护另一份基础源码。功能演示在 [demos/](../demos/)，大型集成在 [integrations/](../integrations/)。
