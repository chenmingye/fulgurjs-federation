# @fulgur/federation

> **fulgur** — 拉丁语「闪电 · 辉光」。
> 一个把 Vite 模块联邦做到开箱即用的插件：**一套配置，dev / prod 双引擎，语义对齐 Webpack Module Federation**。

![tests](https://img.shields.io/badge/tests-76%20%2F%20e2e%2018-green) ![runtime](https://img.shields.io/badge/runtime%20gzip-%3C%205KB-blue) ![vite](https://img.shields.io/badge/vite-5%20%7C%206%20%7C%207%20%7C%208-purple)

---

## 为什么是它

| | webpack MF | 其他 vite MF 方案 | **@fulgur/federation** |
|---|---|---|---|
| dev 体验 | 需要独立构建 | 通常要手工 bootstrap | ✅ 双 dev-server 直连，零手工异步边界 |
| prod 产物 | ✅ | 常缺失或降级 | ✅ 构建期改写，稳定 remoteEntry 文件名 + manifest |
| 语义完整度 | 100% | 残缺（版本协商/单例/容错经常缺失） | ✅ 逐条对齐 webpack 语义并有 e2e 验收 |
| 运行时体积 | ~40KB+ | 不等 | **gzip < 5KB** |
| 配置出错时 | 难排查 | 报错晦涩 | 三段式报错：`got / expected / example` |

## 特性

- **exposes / remotes / shared 全语义**：`name@url` 语法、键重命名、promise-based remote、semver 全语法 requiredVersion、版本协商（最高版本胜出）、singleton / strictVersion、已加载版本永不替换、多版本共存、shareKey 重定向、多 shareScope
- **自动异步边界**：top-level await 自动注入（es2022+），无需 webpack 式手工 `import('./bootstrap')`
- **稳定产物**：remoteEntry 固定文件名利于 CDN 长缓存；`unifed-manifest.json` 资源清单；expose 独立 chunk
- **增强能力**：dts 类型直连（dev 补全直达 remote 源码）、`preloadRemote()` manifest 驱动精确预载、runtimePlugins 钩子
- **容错**：加载重试 / 熔断 / fallback 地址 / 统一错误码（MFU-001~008）/ UI 错误边界友好
- **HMR 全链路**：remote 改动 → host 页面热更，L1 组件热替换 / L2 状态保留 / L3 错误覆盖与恢复
- **不误伤**：不干预 optimizeDeps、不改变模块求值顺序、大工程（3 万模块级）实测可用

## 安装

```bash
pnpm add -D @fulgur/federation
```

## 快速开始

### Remote（提供方）

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgur/federation'

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'remote-a',
      exposes: {
        './Button': './src/components/Button.vue',
        './utils': './src/utils/index.ts',
      },
      shared: {
        vue: { singleton: true },
      },
    }),
  ],
})
```

### Host（消费方）

```ts
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'my-host',
      remotes: {
        // 一个地址，dev/prod 自动切换；也可拆开写 { dev, prod }
        'remote-a': 'http://localhost:5101',
      },
      shared: {
        vue: { singleton: true },
      },
    }),
  ],
})
```

### 消费远程模块

```ts
// 静态导入：直接写 remote 名/expose 名，类型补全直达源码
import Button from 'remote-a/Button'

// 动态导入 / 运行时 API
import { loadRemote, registerRemote, preloadRemote } from 'virtual:unifed-runtime'

const Chart = defineAsyncComponent(() => loadRemote('remote-a/Chart').then(m => m.default))

// 构建时地址未知的远程？运行时注册（对齐 webpack promise remote 语义）
registerRemote({ name: 'shop', entry: await (await fetch('/api/remote-url')).text() })
await preloadRemote('shop') // 按 manifest 精确预载 chunk + CSS
```

**没有别的步骤了。** dev 下 remote 跑它自己的 `vite dev`（容器入口 `/@unifed-entry.js` 由插件中间件直出）；build 下 expose 自动拆独立 chunk、shared 自动剥离——同一份配置两端通用。

## 配置出错？报错看得懂

所有配置问题在 `vite` 启动瞬间即报，固定三段式，可直接照抄修正：

```
[vite-plugin-unifed] Invalid federation() config — remotes["remote-a"] has no address (need one of external / dev / prod)
  got:      {"dev":""}
  expected: at least one address; with only one URL it is used for both dev and prod
  example:  remotes: { 'remote-a': 'http://localhost:5101' }
  // or split: { 'remote-a': { dev: 'http://localhost:5101', prod: '/remote-a' } }
```

运行时加载失败同样给排查指引（remote dev server 未启动 / 地址配错 / CORS / NGINX 回退），并携带统一错误码：

| 错误码 | 含义 |
|---|---|
| MFU-001 | remoteEntry 加载失败（附排查步骤） |
| MFU-002 | 容器自报名与配置名不一致 |
| MFU-003 | strictVersion 版本不满足 |
| MFU-004 | shared 不可用且无本地 fallback |
| MFU-005 | 容器重复 init 且 shareScope 不同 |
| MFU-006 | 模块未被该 remote expose |
| MFU-007 | 预载失败（不阻断业务） |
| MFU-008 | 引用了未注册的 remote |

调试出口：`window.__UNIFED_SCOPE__`（share 协商实时结果）、`window.__UNIFED_INFO__`（remote 状态/耗时/错误）。

## 兼容性

- Vite 5 / 6 / 7 / 8（含 rolldown-vite）
- Vue 3 生态优先（fixtures 与 e2e 全部 Vue3）；不兼容 originjs 的 `virtual:__federation__` 旧写法
- 浏览器：Chrome 108+（TLA 原生支持）
- 跨打包器互操作（webpack 宿主消费 vite remote，`remoteType: 'script'/'var'`）为后续里程碑

## 文档

- [`docs/manual.html`](./docs/manual.html) — 完整使用手册：webpack 逐项对齐总表、每个功能的配置代码 + dev/prod 实测截图、错误码排查、NGINX 部署样例
- [`DESIGN.md`](./DESIGN.md) — 架构设计、对齐总表、测试与验收方案

## 开发与测试

```bash
pnpm install
pnpm test        # 单测（Vitest）+ fixtures dev e2e + prod e2e（NGINX 8999）
pnpm test:unit   # 仅单测
pnpm test:dev    # 仅 dev e2e
pnpm test:prod   # 仅 prod e2e
```

## License

TBD
