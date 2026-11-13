# react-host —— React 宿主（fulgurjs 联邦演示）

> **角色：React 宿主（消费方）。** 消费 [`../remote/`](../remote)（react-remote，端口 5203）暴露的组件、TS 模块与联邦页面；本应用自身不暴露任何模块。

## 从干净拷贝运行

复制整个 `react-react/` 模板，在模板根安装依赖后启动本应用：

```bash
pnpm install --frozen-lockfile
pnpm --dir host dev
```

宿主需要先启动对应远程；也可以在模板根执行 `pnpm dev` 启动完整组合。环境和完整运行步骤见[组合说明](../README.md)。

## 目录与关键配置

| 文件 | 职责 |
| --- | --- |
| `fulgurjs.config.ts` | **联邦唯一声明**：remotes 地址（dev/prod）、具名页面合同 `hostPages`（包含 `pages`、`remotePrefixes`） |
| `vite.config.ts` | 标准 Vite 配置，`federation(fulgurjsConfig)` 挂载插件 |
| `src/fulgurjs/host/remotePages.tsx` | `createReactHostPages(hostPages)`（模块顶层一次）；`component(spec)` 取远程页面组件 |
| `src/App.tsx` | `remoteComponent('react-remote/ClickButton')` 消费单个远程组件 |
| `src/pages/UtilsDemo.tsx` | `useLoadRemote('react-remote/utils')` 调用普通 TS 模块 |
| `src/main.tsx` | react-router 路由；参数页把 `params`/`query` 透传给远程组件 |

## API 职责速查

- `remoteComponent(spec, opts?)`：单个远程组件；失败时插件内置中文错误占位（错误码 + 修法 + **重试加载** + **刷新页面重试**）。
- `useLoadRemote(spec)`：hook 形态的模块加载（`data/error/loading/reload`），适合普通 TS 模块。
- `createReactHostPages(...)` + `component(spec)`：页面表驱动的联邦页面。

## 生产构建与部署

```bash
pnpm run build        # dist/
```

部署在站点根 `/`（Nginx SPA fallback 见[组合说明](../README.md#生产构建与最小-nginx-部署)）；深链刷新由 fallback + 插件路由解析恢复。

## 恢复操作（故障演练）

停掉 react-remote → 刷新宿主进入远程页面 → 默认错误占位出现 → 重启 react-remote → 点「重试加载」同页恢复；静态子依赖曾失败等场景点「刷新页面重试」整页恢复。

## HMR（5.2.0 起）

react-remote 的组件修改（文本/样式/Hooks 结构不变）自动热更新到本宿主正在显示的页面并**保留组件本地状态**（插件保证全页单一 react-refresh 实例）；普通 TS 模块修改自动传播到引用它的组件边界；不兼容改动按框架标准重新挂载/整页刷新。

### 页面表与CLI共用的合同

`fulgurjs.config.ts` 必须具名导出 `hostPages = { pages, remotePrefixes }`。CLI 读取这个对象核对页面；只分别导出两个字段时，CLI 无法确认页面合同，`--require-verified` 会拒绝。运行时页面适配器直接消费同一个 `hostPages`，不再维护第二份页面表。

构建远程后，在宿主目录执行 `pnpm exec fulgurjs check-pages --manifest react-remote=../remote/dist/fulgurjs-manifest.json --require-verified`，必须实际核对两条远程页面。若远程缺少详情 expose，命令应非零退出；不能把“未找到 hostPages”当作通过。
