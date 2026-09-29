# vue-remote —— Vue 远程（fulgurjs 联邦演示）

> **角色：Vue 远程（被消费方）。** 向 [`../host/`](../host/)（vue-host，端口 5214）暴露可点击按钮组件、普通 TS 工具模块、联邦首页与参数详情页；也可独立运行调试。

## 从干净拷贝运行

```bash
cd vue-remote        # 把本目录复制到任意位置后进入
npm install
npm run dev          # http://localhost:5213
```

独立运行画面：`vue-remote 独立运行` 页面 + 一枚可点击计数按钮（这是远程自己的壳，`src/main.ts` + `src/App.vue`；联邦消费走 `fulgurjs-remoteEntry.js` 容器入口，与壳无关）。

## 暴露的模块（exposes）

| expose 键 | 源文件 | 说明 |
| --- | --- | --- |
| `./ClickButton` | `src/exposes/ClickButton.vue` | 可点击计数按钮（本地状态在组件内） |
| `./utils` | `src/exposes/utils.ts` | 普通 TS 模块：`sumNumbers` / `DEMO_ANSWER` / `formatPrice` |
| `./pages/HomePage` | `src/exposes/pages/HomePage.vue` | 联邦页面：远程首页 |
| `./pages/DetailPage` | `src/exposes/pages/DetailPage.vue` | 联邦页面：详情页（接收宿主路由的 `id` / `tab` props） |

宿主如何调用 `./utils`（宿主侧代码）：

```ts
import { loadRemote } from '@fulgurjs/federation/runtime'
const utils = await loadRemote<{ sumNumbers: (...n: number[]) => number }>('vue-remote/utils')
utils.sumNumbers(2, 3, 7) // 12
```

## 关键配置

- `fulgurjs.config.ts`：**联邦唯一声明**（name = `vue-remote`、exposes、shared）。改 expose 键名时宿主页面表/引用需同步。
- `vite.config.ts`：`federation(fulgurjsConfig)` 挂载插件；端口在 `package.json` 的 `dev` 脚本（5213）。

## 生产构建与部署

```bash
npm run build        # dist/（含 fulgurjs-remoteEntry.js 与 fulgurjs-manifest.json）
```

部署到 Nginx 子路径 `/vue-remote/`（与宿主 `fulgurjs.config.ts` 的 `prod: '/vue-remote'` 对应；产物内 chunk 引用为相对路径，天然适配子路径）。完整 Nginx 示例见[组合说明](../README.md#生产构建与最小-nginx-部署)。

## 故障演练（配合宿主）

停掉本 dev server → 宿主远程页面出现插件默认错误占位 → 重启本服务 → 宿主占位上「重试加载」同页恢复，或「刷新页面重试」整页恢复。
