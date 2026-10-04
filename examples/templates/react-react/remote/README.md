# react-remote —— React 远程（fulgurjs 联邦演示）

> **角色：React 远程（被消费方）。** 向 [`../host/`](../host)（react-host，端口 5204）暴露可点击按钮组件、普通 TS 工具模块、联邦首页与参数详情页；也可独立运行调试。

## 从干净拷贝运行

复制整个 `react-react/` 模板，在模板根安装依赖后启动本应用：

```bash
pnpm install --frozen-lockfile
pnpm --dir remote dev
```

宿主需要先启动对应远程；也可以在模板根执行 `pnpm dev` 启动完整组合。环境和完整运行步骤见[组合说明](../README.md)。

## 暴露的模块（exposes）

| expose 键 | 源文件 | 说明 |
| --- | --- | --- |
| `./ClickButton` | `src/exposes/ClickButton.tsx` | 可点击计数按钮（useState 本地状态） |
| `./utils` | `src/exposes/utils.ts` | 普通 TS 模块：`sumNumbers` / `DEMO_ANSWER` / `formatPrice` |
| `./pages/HomePage` | `src/exposes/pages/HomePage.tsx` | 联邦页面：远程首页 |
| `./pages/DetailPage` | `src/exposes/pages/DetailPage.tsx` | 联邦页面：详情页（接收宿主路由的 `id` / `tab` props） |

宿主如何调用 `./utils`（宿主侧代码）：

```tsx
import { useLoadRemote } from '@fulgurjs/federation/react'
const { data } = useLoadRemote<{ sumNumbers: (...n: number[]) => number }>('react-remote/utils')
data?.sumNumbers(2, 3, 7) // 12
```

## 关键配置

- `fulgurjs.config.ts`：**联邦唯一声明**（name = `react-remote`、exposes、shared）。
- `vite.config.ts`：`federation(fulgurjsConfig)` 挂载插件；端口在 `package.json` 的 `dev` 脚本（5203）。

## 生产构建与部署

```bash
pnpm run build        # dist/（含 fulgurjs-remoteEntry.js 与 fulgurjs-manifest.json）
```

部署到 Nginx 子路径 `/react-remote/`（与宿主 `prod: '/react-remote'` 对应）。完整 Nginx 示例见[组合说明](../README.md#生产构建与最小-nginx-部署)。

## 故障演练（配合宿主）

停掉本 dev server → 宿主远程页面出现插件默认错误占位 → 重启本服务 → 宿主占位上「重试加载」同页恢复，或「刷新页面重试」整页恢复。
