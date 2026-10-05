# 示例与模板

> 本文是索引：模板/Demo 的选择、运行与端口。每个工程的完整说明（部署细节、能力清单）在各自 README，本文不复制正文。

## 五个可复制模板（`examples/templates/`）

全部使用 npm registry 正式包 `@fulgurjs/federation@6.0.0`（精确版本 + pnpm 锁文件），不依赖本仓库源码。每个模板目录是完整 pnpm workspace，**必须整目录复制/创建**。

| 模板 | 组合 | 演示能力 |
|---|---|---|
| [vue-vue](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/vue-vue) | Vue 宿主 × Vue 远程 | 远程组件/TS 模块、路由懒加载、错误占位与重试、生产部署 |
| [react-react](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/react-react) | React 宿主 × React 远程 | remoteComponent / useLoadRemote / ErrorBoundary |
| [vue-host-react-remote](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/vue-host-react-remote) | Vue 宿主 × React 子应用 | 跨框架完整子应用桥接 |
| [react-host-vue-remote](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/react-host-vue-remote) | React 宿主 × Vue 子应用 | 反方向桥接 |
| [showcase](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/showcase) | 双宿主 × 双远程 | 双向桥接 + URL 同步 + 多远程并存 |

### 获取与运行

```bash
# 方式一（推荐，不需要 clone 仓库）：CLI 创建
npx @fulgurjs/federation create vue-vue --dir my-federation

# 方式二：从仓库复制后运行
cd examples/templates/vue-vue
pnpm install --frozen-lockfile
pnpm dev          # 统一启动器：远程先启动并探活，再启动宿主
# 打开模板 README 标注的宿主地址（vue-vue 为 http://localhost:5214）
```

环境：Node ≥ 20（实测 24.x）、pnpm ≥ 9（推荐 ≥ 12，锁文件由 pnpm 12 生成）。启动器行为：启动前端口预检（占用即拒绝）、按序启动逐个探活、全生命周期监督失败整组退出、Ctrl+C 清理到孙进程。单独调试：`pnpm run dev:remote` / `pnpm run dev:host`（showcase 四个入口）。

### 默认端口表（远程先于宿主启动）

| 模板 | 远程 | 宿主 |
|---|---|---|
| vue-vue | 5213 | 5214 |
| react-react | 5203 | 5204 |
| vue-host-react-remote | react-remote 5303 | vue-host 5314 |
| react-host-vue-remote | vue-remote 5313 | react-host 5304 |
| showcase | vue-remote 5335 / react-remote 5333 | vue-host 5334 / react-host 5336 |

### 改端口的固定清单

`fulgurjs port <应用> <新端口>`（模板工程根目录运行）可一次预览/写入四处；手工改时**四处必须同步**（漏任何一处启动器会被旧端口卡住）：

1. 各应用 `package.json` 的 `dev` 与 `preview` 脚本 `--port`（两处都改）；
2. 宿主 `fulgurjs.config.ts` 里 `remotes` 的 dev 地址；
3. 根 `scripts/dev.config.json` 里该应用的 `port`（**必改**：启动器预检与探活读这里）；
4. 模板 README 顶部的端口表记录。

生产部署地址（`prod`）是站点路径，与 dev 端口无关，改端口不动它。命令细节见 [CLI 参考 · port](../reference/cli.md#fulgurjs-port)。

## 功能 Demo（`examples/demos/`）

模板之外的能力演示，同样可独立下载运行（npm 工程）。场景位置、端口、启动顺序统一登记在 [examples/scenarios.json](https://github.com/chenmingye/fulgurjs-federation/blob/master/examples/scenarios.json)：

| 场景 | 目录 | 覆盖能力 |
|---|---|---|
| 共享依赖与运行时 | [demos/shared](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/shared) | singleton/版本协商/strictVersion/别名/eager/fallback、动态注册、预载、运行时插件 hooks、AppContext 实例观测 |
| React 18/19 隔离与恢复 | [demos/react-versions](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/react-versions) | React 19 宿主嵌 React 18；独立作用域、异步共享裁决、严格版本拒绝与对齐后重载 |
| 页面清单、类型与 CLI | [demos/pages-cli](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/pages-cli) | definePages/createHostPages/remoteSchema/requireAppContext；init/explain/check-pages/doctor 全命令 |
| 错误恢复 | [demos/errors](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/errors) | 远程不可用/错误入口/超时/版本冲突/非法桥接契约/setup 与卸载异常——隔离故障注入，逐项演示错误码与恢复路径 |
| 同框架完整子应用桥接 | [demos/same-frame](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/same-frame) | Vue 套 Vue、React 套 React，对比「组件级联邦 vs 应用级桥接」 |
| Jeecg 集成 | [integrations/jeecg](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/integrations/jeecg) | JeecgBoot v3.9.5 A 套 B 自嵌套、Jeecg↔React 双向、受控三层嵌套 A→B→C |

仓库根统一管理命令（无需先装仓库根依赖）：

```bash
node examples/scripts/check-catalog.mjs          # 核对场景、workspace 成员与锁文件
node examples/scripts/check-env.mjs              # 查看包管理器、安装和端口状态
node examples/portal/server.mjs                  # 展示门户：http://localhost:5390
node examples/scripts/start-demo.mjs --scenario vue-basic   # --scenario 可重复；--all 全部
node examples/scripts/build-demo.mjs --scenario vue-basic
node examples/scripts/stop-demo.mjs --scenario vue-basic
```

## 学习路径建议

1. **先跑一个同框架模板**（vue-vue 或 react-react）：对照本目录 [组件与模块加载](components-and-modules.md) 看宿主首页的 remoteComponent 用法；
2. **共享协商/版本隔离**：跑 demos/shared 与 demos/react-versions，对照 [共享依赖](sharing.md)；
3. **跨框架嵌入**：跑桥接模板或 showcase，对照 [子应用桥接](app-bridge.md) 与 [URL 同步](url-sync.md)（showcase 里试深链刷新与前进后退）；
4. **逐页接入与 CLI**：跑 demos/pages-cli，对照 [远程页面接入](remote-pages.md) 与 [CLI 参考](../reference/cli.md)；
5. **错误处理**：跑 demos/errors，对照[错误码总表](../reference/errors.md)与[排错目录](../troubleshooting/README.md)。

npm 包仅附带 `examples/templates/` 五个模板；功能 Demo、Jeecg 集成与门户从 GitHub 仓库获取。
