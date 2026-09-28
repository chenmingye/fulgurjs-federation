# examples — 可复制的单项目配置样例

每个目录是一个**独立项目**的 `fulgurjs.config.ts`（4.2.0 单项目契约：默认导出直接可传给 `federation()`）：

- [`remote-a/fulgurjs.config.ts`](./remote-a/fulgurjs.config.ts) — 远程应用：exposes / setup / shared
- [`host/fulgurjs.config.ts`](./host/fulgurjs.config.ts) — 宿主应用：remotes 消费地址 + 可选 `hostPages` 页面核对数据（仅供 CLI）

React 完整可运行工程（5.1.0 起，npm registry 安装即跑，区别于上面两个「配置样例」目录）：

- [`react-remote/`](./react-remote) — React 远程（5203）：Button/utils/pages expose + shared react/react-dom singleton
- [`react-host/`](./react-host) — React 宿主（5204）：`@fulgurjs/federation/react` 导入 + 页面表 + React Router；运行说明见其 README

复制方式：把对应文件整份复制到**你自己的项目根目录**（两个项目不共享配置文件、不共享父目录配置），再在各自 `vite.config.ts` 的 plugins 里加一次 `federation(fulgurjsConfig)`：

```ts
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig({
  plugins: [
    // ...原有插件,
    federation(fulgurjsConfig),
  ],
})
```

验证：在复制后的项目根目录运行 `npx fulgurjs explain`（纯本地、无网络），应输出本应用的形态摘要与 `federation(fulgurjsConfig)` 接入块。
