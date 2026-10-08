# @fulgurjs/federation 设计决策

> 本文只保留仍然成立的设计决策与命名约定。当前架构导读见 [maintainers/architecture.md](docs/maintainers/architecture.md)；与 webpack Module Federation 的能力对照与边界见 [maintainers/webpack-mf-对照与缺口.md](docs/maintainers/webpack-mf-对照与缺口.md)；使用文档见[文档中心](docs/README.md)。早期"100% 对齐 webpack"的设计目标已被当前产品形态取代，不再作为兼容承诺。

## 品牌

- 品牌 **fulgurjs**，拉丁语「闪电 · 辉光」，取自作者名中「烨」字的意译。
- 系列规划：`@fulgurjs/federation`（模块联邦）→ `@fulgurjs/micro`、`@fulgurjs/dts` …
- 内外命名统一 `fulgurjs`（`virtual:fulgurjs-*` 虚拟模块、`window.__FULGURJS_*` 调试出口、`FgError` / MFU 错误码）。

## 已锁定的决策

| # | 决策项 | 结论 |
|---|--------|------|
| 1 | 包名 | `@fulgurjs/federation` |
| 2 | 技术栈范围 | 浏览器端 Vue 3 与 React 18/19；框架无关运行时 `/runtime` |
| 3 | 兼容旧写法 | 不兼容 originjs 的 `virtual:__federation__`；不保留历史入口兼容壳（旧入口随大版本删除，删除即报错并给修法） |
| 4 | Remote 地址 | 一个地址，dev/prod 自动切换（可显式覆盖） |
| 5 | Vite 版本范围 | Vite 5.1 / 6 / 7 / 8（含 rolldown-vite） |
| 6 | 隔离模型 | 同 realm 共存 + 依赖级隔离：不做 JS 沙箱与 CSS 自动隔离（结论见[沙箱边界审计](docs/maintainers/沙箱边界审计.md)） |
| 7 | 路由所有权 | URL 同步由宿主管理浏览器历史，桥接子应用使用受控 memory 路由；业务菜单与业务 Router 归应用自管 |
| 8 | 错误处理 | 显式错误态 + 可重试，不静默兜底；错误码三方一致由构建门禁强制 |
| 9 | 公开入口 | 包根（Vite 配置）+ `/vue` + `/react` + `/runtime` 四个，应用代码不导入 `/internal/*` |
| 10 | 文档口径 | 公开使用文档只描述当前推荐用法，不维护历史 API 教程（见 [CONTRIBUTING](CONTRIBUTING.md)） |
