# vue-remote — Vue 子应用

本模板对应未验收的 6.9.0 源码候选，状态与安装方法见[组合说明](../README.md)。复制整个组合目录，在组合根启动。

## 按顺序读源码

1. `fulgurjs.config.ts`：`./bridge` 直接 expose `src/application.ts`，公开模块名称不受文件名称约束。
2. `src/application.ts`：`defineApplication` 唯一装配；独立模式用浏览器路由，桥接模式用本地 memory 路由，两者显示同一套真实页面、计数与 props。
3. `src/main.ts`：只调用 application.start，不再复制初始化或新增转发文件。
4. `react-host/`：宿主的挂载、会话与回调，见[组合说明](../README.md)。

应用代码只从 `@fulgurjs/federation/vue` 导入插件 API；子应用不因跨框架嵌入而安装另一框架。这个基础组合不启用宿主 URL 同步；需要地址双向同步时使用 showcase 模板。

独立启动可以切换首页/关于页，桥接也使用相同页面；卸载与首次挂载由插件管理。Vue 返回未安装的 app/router，React 返回 BrowserRouter/MemoryRouter 内的同一组件树。

## 运行

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm prod
```

以上正式安装命令须在 6.9.0 发布后执行；候选验收先按组合根的候选说明使用本轮 tarball。
