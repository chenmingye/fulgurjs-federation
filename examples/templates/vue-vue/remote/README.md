# vue-remote —— Vue 远程（fulgurjs 联邦演示）

> **角色：Vue 远程（被消费方）。** 向 [`../host/`](../host)（vue-host，端口 5214）暴露可点击按钮组件、普通 TS 工具模块、联邦首页与参数详情页；也可独立运行调试。

## 从干净拷贝运行

复制整个 `vue-vue/` 模板，在模板根安装依赖后启动本应用：

```bash
pnpm install --frozen-lockfile
pnpm --dir remote dev
```

宿主需要先启动对应远程；也可以在模板根执行 `pnpm dev` 启动完整组合。环境和完整运行步骤见[组合说明](../README.md)。

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
pnpm run build        # dist/（含 fulgurjs-remoteEntry.js 与 fulgurjs-manifest.json）
```

部署到 Nginx 子路径 `/vue-remote/`（与宿主 `fulgurjs.config.ts` 的 `prod: '/vue-remote'` 对应；`vite.config.ts` 已配置 `base` 随 `build` 自动切换为 `/vue-remote/`（dev 不受影响）；不要去掉它，否则 modulepreload 链接会指向站点根导致 404）。完整 Nginx 示例见[组合说明](../README.md#生产构建与最小-nginx-部署)。

## 故障演练（配合宿主）

停掉本 dev server → 宿主远程页面出现插件默认错误占位 → 重启本服务 → 宿主占位上「重试加载」同页恢复，或「刷新页面重试」整页恢复。
