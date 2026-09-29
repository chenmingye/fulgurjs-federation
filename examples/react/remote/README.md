# react-remote —— React 远程（fulgurjs 联邦演示）

> **角色：React 远程（被消费方）。** 向 [`../host/`](../host/)（react-host，端口 5204）暴露可点击按钮组件、普通 TS 工具模块、联邦首页与参数详情页；也可独立运行调试。

## 从干净拷贝运行

```bash
cd react-remote      # 把本目录复制到任意位置后进入
npm install
npm run dev          # http://localhost:5203
```

独立运行画面：`react-remote 独立运行` 页面 + 一枚可点击计数按钮（远程自己的壳；联邦消费走 `fulgurjs-remoteEntry.js` 容器入口，与壳无关）。

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
npm run build        # dist/（含 fulgurjs-remoteEntry.js 与 fulgurjs-manifest.json）
```

部署到 Nginx 子路径 `/react-remote/`（与宿主 `prod: '/react-remote'` 对应）。完整 Nginx 示例见[组合说明](../README.md#生产构建与最小-nginx-部署)。

## 故障演练（配合宿主）

停掉本 dev server → 宿主远程页面出现插件默认错误占位 → 重启本服务 → 宿主占位上「重试加载」同页恢复，或「刷新页面重试」整页恢复。
