# fulgurjs-federation 模板（templates/）

五个可独立复制、`pnpm install` 后直接运行的联邦接入模板。全部使用 **npm registry 正式包** `@fulgurjs/federation@5.8.0`（精确版本 + pnpm 锁文件），不依赖本仓库源码、workspace 或父目录。

## 选择模板

| 模板 | 组合 | 演示能力 | 复制范围 |
|---|---|---|---|
| [`vue-vue/`](./vue-vue/) | Vue 宿主 × Vue 远程 | 远程组件/TS 模块、路由懒加载、错误占位与重试、生产部署 | 整个 `vue-vue/` 目录 |
| [`react-react/`](./react-react/) | React 宿主 × React 远程 | 同上（React 版：remoteComponent / useLoadRemote / ErrorBoundary） | 整个 `react-react/` 目录 |
| [`vue-host-react-remote/`](./vue-host-react-remote/) | Vue 宿主 × React 子应用 | 跨框架完整子应用桥接（挂载/卸载/appProps 快照） | 整个 `vue-host-react-remote/` 目录 |
| [`react-host-vue-remote/`](./react-host-vue-remote/) | React 宿主 × Vue 子应用 | 同上（反方向） | 整个 `react-host-vue-remote/` 目录 |
| [`showcase/`](./showcase/) | Vue/React 双宿主 × Vue/React 双远程 | **完整演示**：双向跨框架桥接、URL 同步（深链刷新/前进后退）、多远程并存、同框架子应用对照 | 整个 `showcase/` 目录 |

每个模板目录是一个完整 pnpm workspace（根 `package.json` + `pnpm-workspace.yaml` + `pnpm-lock.yaml`）。**必须复制整个模板目录**，不能只复制其中的子应用。

## 最短运行路径

环境要求：Node ≥ 20（实测 24.x）、pnpm ≥ 9。**推荐 pnpm ≥ 12**（锁文件由 pnpm 12 生成；9/10/11 亦可安装）。

> **pnpm 12 用户注意**：各模板 `pnpm-workspace.yaml` 已带 `allowBuilds: {esbuild: true, vue-demi: true}`（pnpm 12 的构建脚本批准形态；pnpm 9–11 忽略该键——esbuild ≥0.16 的二进制经 optionalDependencies 平台包分发，postinstall 仅做校验，不影响安装与运行）。若用 pnpm 10/11 且提示未批准构建脚本，可改回 `onlyBuiltDependencies: [esbuild, vue-demi]` 或按提示 `pnpm approve-builds`。**不要**让 pnpm 把 `allowBuilds: <pkg>: set this to true or false` 的占位提示留在 yaml 里——把值改成 `true` 即可通过（pnpm 12 会在遇到未决构建脚本时自动写入该提示行）。

```bash
# 以 vue-vue 为例；其余模板把目录名换掉即可
cp -r templates/vue-vue /wherever/you/want && cd /wherever/you/want/vue-vue
pnpm install            # 安装（锁文件冻结：pnpm install --frozen-lockfile）
pnpm dev                # 远程(5213) + 宿主(5214) 同时启动
# 打开 http://localhost:5214 —— 远程按钮、TS 模块调用、路由懒加载、错误恢复演示
```

各模板端口（先远程后宿主）：

| 模板 | 远程 | 宿主 |
|---|---|---|
| vue-vue | 5213 | 5214 |
| react-react | 5203 | 5204 |
| vue-host-react-remote | react-remote 5303 | vue-host 5314 |
| react-host-vue-remote | vue-remote 5313 | react-host 5304 |
| showcase | vue-remote 5335 / react-remote 5333 | vue-host 5334 / react-host 5336 |

生产构建与部署说明见各模板内子应用 README（`pnpm build` 后产物为标准 Vite dist，远程会多生成 `fulgurjs-remoteEntry.js` 与 `fulgurjs-manifest.json`，用 no-cache 规则部署，SPA fallback 配置见 examples 部署文档）。

## 模板覆盖的能力 → 去哪看

- **组件/模块加载、错误占位、重试恢复**：四个基础模板首页即演示。
- **跨框架完整子应用挂载/卸载、appProps 快照、会话切换**：两个桥接模板。
- **URL 同步（子应用内部路由 ↔ 宿主地址、刷新直达、前进后退、多层嵌套）**：showcase，宿主页 URL 变化随子应用导航联动。
- **shared 共享协商、React 18/19 隔离、页面接入（createHostPages）、错误注入与恢复、Jeecg 三层嵌套**：不在模板内重复造码，直接用仓库 [`demo/`](../demo/) 对应场景（`demo/shared`、`demo/react-versions`、`demo/pages-cli`、`demo/errors`、`demo/jeecg`），同样可独立下载运行（见 demo/README.md）。

## 与 examples/ 的关系

`examples/` 是 npm 安装版的最小可拷贝工程；`templates/` 是同一套已验收写法的 **pnpm workspace 版**，增加一键 dev/build 脚本与能力矩阵说明。二者源码同源，接入写法以 `examples/` 各 README 为准。
