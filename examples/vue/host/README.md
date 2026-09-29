# vue-host —— Vue 宿主（fulgurjs 联邦演示）

> **角色：Vue 宿主（消费方）。** 消费 [`../remote/`](../remote/)（vue-remote，端口 5213）暴露的组件、TS 模块与联邦页面；本应用自身不暴露任何模块。

## 从干净拷贝运行

前置：Node ≥ 20.19 与 npm（与本仓库示例验证版本一致即可）。

```bash
# 先启动远程（另一终端）：见 ../remote/README.md
cd vue-host          # 把本目录复制到任意位置后进入
npm install
npm run dev          # http://localhost:5214
```

成功画面：导航条含「首页 / 远程首页 / 远程详情 / TS 模块调用」；「远程首页」出现 vue-remote 的标题与可点击计数按钮。

## 目录与关键配置

| 文件 | 职责 |
| --- | --- |
| `fulgurjs.config.ts` | **联邦唯一声明**：remotes 地址（dev/prod）、页面表 `pages`、前缀归属 `remotePrefixes`。改远程地址只动这里 |
| `vite.config.ts` | 标准 Vite 配置，`federation(fulgurjsConfig)` 挂载插件 |
| `src/main.ts` | 路由 + `createHostPages({ pages, remotePrefixes })`；远程页面用 `hostPages.component('<远程名>/<expose 键>')` |
| `src/pages/HomePage.vue` | `remoteComponent('vue-remote/ClickButton')` 消费单个远程组件 |
| `src/pages/UtilsDemo.vue` | `loadRemote('vue-remote/utils')` 调用普通 TS 模块 |

## API 职责速查

- `remoteComponent(spec)`：单个远程组件；首次渲染才加载；失败时插件内置中文错误占位（错误码 + 修法 + **重试加载** + **刷新页面重试**）。
- `createHostPages({ pages, remotePrefixes })`：页面表驱动；`component(spec)` 返回异步页面组件（同 spec 复用）；加载/错误占位由插件提供。
- `loadRemote(spec)`：加载任意 expose（组件或纯 TS 模块），返回模块命名空间。

## 生产构建与部署

```bash
npm run build        # dist/
```

部署在站点根 `/`（Nginx SPA fallback 见 [组合说明](../README.md#生产构建与最小-nginx-部署)）。深链 `/remote/detail/7?tab=basic` 刷新后由 fallback 回退 index.html、插件路由解析恢复同一页面。

## 恢复操作（故障演练）

1. 停掉 vue-remote（Ctrl-C 远程终端）。
2. 刷新宿主页面并进入任一远程页面 → 插件默认错误占位（远程组件加载失败 + 错误码）。
3. 重启 vue-remote → 点占位上的「重试加载」同页恢复；若浏览器已缓存失败的模块（如远程静态子依赖曾失败），点「刷新页面重试」整页恢复（保留当前地址）。

## HMR

vue-remote 的组件/TS 模块修改会自动热更新到本宿主正在显示的页面（无需手动刷新）；不兼容改动按 Vite/Vue 标准触发 full-reload。
