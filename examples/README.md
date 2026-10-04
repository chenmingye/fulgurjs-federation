# 示例、模板与展示中心

所有公开示例统一放在本目录。先选一个模板运行；需要了解更多 API 时，再打开功能演示或展示门户。

## 选择要运行的工程

| 目的 | 目录 | 包管理器 |
|---|---|---|
| Vue 加载 Vue 组件、页面与 TS 模块 | [templates/vue-vue](templates/vue-vue/) | pnpm |
| React 加载 React 组件、页面与 TS 模块 | [templates/react-react](templates/react-react/) | pnpm |
| Vue 宿主嵌 React 子应用 | [templates/vue-host-react-remote](templates/vue-host-react-remote/) | pnpm |
| React 宿主嵌 Vue 子应用 | [templates/react-host-vue-remote](templates/react-host-vue-remote/) | pnpm |
| 双向桥接与 URL 同步 | [templates/showcase](templates/showcase/) | pnpm |
| 共享协商、错误恢复、同框架桥接、CLI、React 版本隔离 | [demos](demos/) | npm |
| Jeecg 自嵌套、跨框架与多层集成 | [integrations/jeecg](integrations/jeecg/) | 见集成说明 |

模板与门户共用同一份工程，基础示例不会再额外复制到另一个目录。场景位置、端口、启动顺序和包管理器统一登记在 [scenarios.json](scenarios.json)。

## 下载后直接运行

**不需要 clone 仓库的最短路径**：`npx @fulgurjs/federation create`——从 npm 正式包交互选择模板并创建完整工程（含冻结安装与后续命令）。

也可以下载整个仓库 ZIP 或 git clone。Node 版本使用各工程支持的版本（当前验证环境为 Node 24）；模板安装要求见 [模板指南](templates/README.md)。

以 Vue 模板为例，在仓库根执行：

```bash
cd examples/templates/vue-vue
pnpm install --frozen-lockfile
pnpm dev
# 打开 http://localhost:5214
```

复制到自己的项目时，复制整个 `vue-vue/`，包含根 package.json、pnpm-workspace.yaml、pnpm-lock.yaml 和 host/remote 两个子目录。无需复制插件源码、其他模板或仓库根 node_modules；每个工程都从 registry 安装正式插件包。

## 统一管理场景

以下命令在仓库根执行；无需先安装仓库根依赖：

```bash
node examples/scripts/check-catalog.mjs          # 核对场景、workspace 成员与锁文件
node examples/scripts/check-env.mjs              # 查看包管理器、安装和端口状态
node examples/portal/server.mjs                  # 展示门户：http://localhost:5390
node examples/scripts/start-demo.mjs --scenario vue-basic
node examples/scripts/build-demo.mjs --scenario vue-basic
node examples/scripts/stop-demo.mjs --scenario vue-basic
```

`--scenario` 可重复使用；`--all` 操作全部可运行场景。启动器按场景表选择 npm/pnpm，模板在自己的 workspace 根安装，远程先启动、宿主后启动。已占用端口会报告跳过，不证明占用者属于当前版本，验收时仍需核对页面与实际包版本。

停止器只处理 `examples/.run/demo-pids.json` 登记的进程。日志、PID、node_modules、dist 都不提交 GitHub。若只复制单个模板，直接执行该模板的 pnpm 命令即可，统一管理脚本不是模板运行依赖。

## 目录职责

```text
examples/
├── templates/      # 五个可独立复制的模板，也是基础展示工程
├── demos/          # 共享、错误、生命周期、页面与版本隔离演示
├── integrations/   # 大型公开项目集成
├── portal/         # 展示门户
├── scripts/        # 统一核对、启动、停止、构建
└── scenarios.json  # 唯一场景表
```

[API 覆盖矩阵](../docs/Demo展示中心API覆盖矩阵-20261002.md)说明各能力在哪里验证。`fixtures/` 是插件内部测试夹具；`testbed/runs/` 是私有业务验收副本，均不属于用户下载模板。

## 原目录迁移

| 原位置 | 当前位置 |
|---|---|
| `examples/vue`、`templates/vue-vue` | `examples/templates/vue-vue` |
| `examples/react`、`templates/react-react` | `examples/templates/react-react` |
| `examples/bridge` | 两个 `examples/templates/*-host-*-remote` 模板 |
| `demo/bridge-router`、`templates/showcase` | `examples/templates/showcase` |
| `demo/jeecg` | `examples/integrations/jeecg` |
| 其他 `demo/<场景>` | `examples/demos/<场景>` |
| `demo/portal`、`demo/scripts` | `examples/portal`、`examples/scripts` |

使用旧命令或收藏的源码路径时，按上表更新。插件 API 和端口没有因目录整理而变化。

## npm 包中的示例

npm 包仅附带 `examples/templates/` 的五个可复制模板。功能 Demo、Jeecg 集成和门户从 GitHub 仓库下载；安装插件不会附带大型业务演示源码。
