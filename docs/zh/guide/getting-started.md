# 快速上手：安装、新建工程与已有项目接入

> 应用代码只从四个公开入口导入：Vite 配置用包根 `@fulgurjs/federation`；Vue 应用用 `@fulgurjs/federation/vue`；React 应用用 `@fulgurjs/federation/react`；框架无关模块用 `@fulgurjs/federation/runtime`。

## 安装

在每个参与联邦的 Vite 项目中安装（开发依赖即可——构建期插件 + 运行时代码都随包分发）：

```bash
pnpm add -D @fulgurjs/federation
# 使用 npm 的项目：npm install -D @fulgurjs/federation
```

环境要求：

- Node.js：插件本体要求 ≥ 18；但 Vite 7/8 要求 **20.19+**（或 22.12+），按所用 Vite 版本选 Node。
- 浏览器基线 Chrome 108+（需要 ESM、动态导入、顶层 await）。
- 构建目标 `es2022` 或更新（低于该目标报 `BLD-002`）。
- 普通 Vue 项目装 Vue 即可；普通 React 项目装 react + react-dom 即可。Vue/React 项目**不需要**安装对方框架或任何路由库；例外是**桥接宿主**（把另一框架的完整子应用嵌入本应用时，必须同时安装两个框架，见[子应用桥接](app-bridge.md#双框架安装合同桥接宿主必须)）。路由库仅在实际使用 URL 同步时由相应端按需引用（类型层面导入，运行时缺依赖只在真正调用路由同步 API 时报错）。

包管理器提示（pnpm 用户）：

- pnpm ≥ 11 默认开启 `minimumReleaseAge: 1440`（24 小时供应链冷却）：刚发布的版本在 24 小时内不会被解析，`pnpm add` 会装到上一个满足冷却期的版本。刚发版就要用最新版时，在 `pnpm-workspace.yaml` 加 `minimumReleaseAgeExclude: ['@fulgurjs/federation@<版本>']`（五模板即此做法），或临时 `pnpm config set minimum-release-age 0`。
- pnpm 12 遇到未批准的构建脚本（esbuild 等）会把 `allowBuilds: { esbuild: set this to true or false }` 占位提示写进 `pnpm-workspace.yaml` 并以非零码结束安装。把值改成 `true` 后重跑安装即可。

## 新建工程：`fulgurjs create`

没有存量项目时，用 CLI 从完整模板创建可独立运行的联邦工程：

```bash
# 交互选择模板（TTY）
npx @fulgurjs/federation create

# 非交互：模板名 + 目标目录（默认执行 pnpm install --frozen-lockfile）
npx @fulgurjs/federation create vue-vue --dir my-federation

# 跳过安装 / 复用非空目录
npx @fulgurjs/federation create react-react --dir my-react --no-install
npx @fulgurjs/federation create showcase --dir existing-dir --force
```

五个模板：

| 模板 | 组合 | 演示能力 |
|---|---|---|
| `vue-vue` | Vue 宿主 × Vue 远程 | 远程组件/TS 模块、路由懒加载、错误占位与重试、生产部署 |
| `react-react` | React 宿主 × React 远程 | remoteComponent / useLoadRemote / ErrorBoundary |
| `vue-host-react-remote` | Vue 宿主 × React 子应用 | 跨框架完整子应用桥接（挂载/卸载/appProps 快照） |
| `react-host-vue-remote` | React 宿主 × Vue 子应用 | 反方向桥接 |
| `showcase` | Vue/React 双宿主 × 双远程 | 双向桥接 + URL 同步（深链刷新/前进后退） |

行为要点：

- `create` 复制完整 pnpm workspace（根 package.json + pnpm-workspace.yaml + 锁文件 + 统一启动脚本），模板依赖钉 npm 正式版，从 registry 安装，不依赖插件仓库源码。
- 创建前按模板 `engines.node`（≥ 20.19.0）校验 Node，并预检 pnpm 是否可用；不满足在**写入任何文件之前**失败并给出升级方法。
- 目标目录非空默认拒绝覆盖；`--force` 复用目录时**只补缺失文件**，同名冲突逐项列出并保留你的版本，绝不改写/删除已有内容。
- 失败（目标路径是文件/复制中断/安装失败）均非零退出，已生成工程保留供排查；`--json` 时 stdout 仅输出结果 JSON，进度走 stderr。
- 不做应用名称/端口改写。改端口的四处同步清单见[示例与模板](examples.md#改端口的固定清单)。

启动：

```bash
cd my-federation
pnpm dev        # 统一启动器：远程先启动并探活，再启动宿主；任一失败整组退出
# 按模板 README 打开宿主地址（如 vue-vue 为 http://localhost:5214）
```

## 已有项目接入

已有项目不需要重搭工程，只做三件事：装插件 → 写 `fulgurjs.config.ts` → `vite.config.ts` 注册插件。可以先用 `fulgurjs init` 生成起步配置（推荐），也可以直接手写。CLI 统一用 `npx @fulgurjs/federation <命令>` 调用（工程尚未安装依赖时也有效；已安装后 `npx fulgurjs` 亦可）。

### 用 `fulgurjs init` 生成起步配置

在**应用根目录**运行：

```bash
# 自动从 package.json 判断框架（vue/react 依赖可明确时），生成双角色最小配置
npx @fulgurjs/federation init

# 判断不了（两框架并存或都没有）时显式指定
npx @fulgurjs/federation init --framework react --role consumer

# 角色可选：consumer（纯消费）/ provider（纯提供）/ dual（双角色，默认）
npx @fulgurjs/federation init --framework vue --role provider

# 输出到其他路径 / 覆盖已有模板
npx @fulgurjs/federation init --out config/fulgurjs.config.ts
npx @fulgurjs/federation init --force
```

- `init` 只生成**最小有效**配置起步模板：shared 只含框架本体（不硬塞 pinia/vue-router/业务页）；按角色决定是否含 `remotes`/`exposes` 示例；纯消费方附 `hostPages` 具名导出的注释示例（不用逐页接入就删掉）。
- 已存在的同名文件拒绝覆盖（`--force` 放开）。
- 生成后打印四步后续动作（编辑配置 → vite.config.ts 两行接入 → `explain` 核对 → 部署后 `doctor`）。

校验已有配置并输出接入块：

```bash
npx @fulgurjs/federation init --config ./fulgurjs.config.ts
```

### 手工接入（三个文件）

**① `fulgurjs.config.ts`（应用根，每项目一份）**——默认导出直接是 `federation()` 选项：

```ts
// 远程应用（提供方）示例；消费方把 exposes 换成 remotes，双角色两者都写
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'remote-a',                                     // 联邦容器名，同一页面内唯一
  exposes: { './shared/user-badge': './src/components/UserBadge.vue' },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

**② `vite.config.ts`**——联邦相关只有两行：

```ts
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig({
  // ...原有配置,
  plugins: [
    // ...原有插件,
    federation(fulgurjsConfig),
  ],
})
```

**③ 应用代码**——按框架选唯一入口：

```ts
// Vue 应用
import { loadRemote, remoteComponent, provideAppContext, getAppContext } from '@fulgurjs/federation/vue'
// React 应用
import { loadRemote, remoteComponent, useLoadRemote } from '@fulgurjs/federation/react'
// 框架无关模块（纯 TS 工具库、无框架代码）
import { loadRemote, loadShare } from '@fulgurjs/federation/runtime'
```

### 按角色的最小配置

| 角色 | 必写 | 说明 |
|---|---|---|
| 提供方（provider） | `name` + `exposes` | 被别人加载。组件必填 props 给默认值（否则 `BLD-003`） |
| 消费方（consumer） | `name` + `remotes` | 加载别人。dev/prod 地址二段式或单地址字符串 |
| 双角色（dual） | `name` + `exposes` + `remotes` | 双向联邦。`devSharedSelf` 缺省即 `true`（按角色推断），无需显式配置 |

远程需要启动期初始化（全局组件/样式/locale/登录态同步）的提供方，另加 `setup` 字段，见 [API 参考 · setup/onSession](../reference/api.md)。

### 纯 TS 项目（无 Vue/React）

框架无关模块从 `@fulgurjs/federation/runtime` 导入，`init --framework` 对这类项目无法判断时要求显式指定（它决定生成的注释示例用哪个框架入口；配置本身与框架无关）：

```ts
// utils 远程（提供方）
export function formatMoney(cents: number): string { return (cents / 100).toFixed(2) }
// fulgurjs.config.ts: exposes: { './money': './src/money.ts' }, shared 不需要

// 消费方（任意框架或纯 TS）
import { loadRemote } from '@fulgurjs/federation/runtime'
const { formatMoney } = await loadRemote<typeof import('remote-utils/money')>('remote-utils/money')
```

> `loadRemote` 的入口类型来自插件同步的远程声明（默认开启）：已同步字面量获得模块真实类型，拼错入口在调用点报错，动态变量走 `unknown` 边界；运行时模块 namespace 以远程实际导出为准。见[组件与模块加载 · 远程类型](components-and-modules.md#远程类型自动同步)。

## 从其他微前端方案迁入（概念映射）

从 qiankun 类方案迁入时的 API 级概念对应（通用技术结论）：

| 旧方案概念 | @fulgurjs/federation 对应 |
|---|---|
| 主应用 registerMicroApps | 宿主 `federation({ remotes })` |
| 子应用 entry（HTML） | remote entry（dev: `@fulgurjs-entry.js` 中间件 / prod: `fulgurjs-remoteEntry.js`） |
| 子应用生命周期 mount/unmount | 页面级 exposes（组件即入口，无生命周期样板）；启动期初始化 = 远程 `federation({ setup })`（setup/onSession）；整应用嵌入 = 桥接契约的 `mount`/`unmount`（`defineBridgeApp`，见[子应用桥接](app-bridge.md)） |
| window 隔离/沙箱 | 无沙箱：同 realm 直渲染（结论与边界见[沙箱边界审计](../../maintainers/沙箱边界审计.md)） |
| props 传递 | 组件 props（组件级）；`appProps`（桥接级，挂载快照语义）；AppContext（跨应用上下文） |
| 公共依赖 externals | `shared`（singleton 协商，"已加载优先"） |
| qiankun 运行时 + single-spa | `@fulgurjs/federation/runtime`（运行时内核 20KB 级，无 single-spa） |

与乾坤不同：这里**没有** `unmount` 强制清理 window 级资源的机制——组件级卸载的全局副作用要自己清理，清单见[远程页面接入 · 页面卸载清理清单](remote-pages.md#页面卸载清理清单)。

## 核对与下一步

```bash
npx @fulgurjs/federation explain          # 纯本地解释：角色/remotes/exposes/shared/加载链
npx @fulgurjs/federation doctor --base http://localhost:5174 --apps remote-a --dev   # dev 容器体检
```

- 加载普通组件/模块**不需要**页面表、桥接配置或登录初始化——按需再读[组件与模块加载](components-and-modules.md)。
- 宿主用「页面路由表 → 远程页面」逐页接入时才追加 `hostPages` 具名导出并跑 `fulgurjs check-pages`，见[远程页面接入](remote-pages.md)。
- 完整子应用嵌入读[子应用桥接](app-bridge.md)；业务菜单与业务 Router 归应用自己管理，桥接不逐页登记内部页面。
- 部署与缓存规则见[部署指南](deployment.md)。
