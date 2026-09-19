# @fulgur/federation

> **fulgur** — 拉丁语「闪电 · 辉光」。
> 一个把 Vite 模块联邦做到开箱即用的插件：**一套配置，dev / prod 双引擎，语义对齐 Webpack Module Federation**。

![tests](https://img.shields.io/badge/tests-148%20%2B%20e2e-green) ![runtime](https://img.shields.io/badge/runtime%20gzip-%3C%205KB-blue) ![vite](https://img.shields.io/badge/vite-5%20%7C%206%20%7C%207%20%7C%208-purple)

---

## 为什么是它

| | webpack MF | 其他 vite MF 方案 | **@fulgur/federation** |
|---|---|---|---|
| dev 体验 | 需要独立构建 | 通常要手工 bootstrap | ✅ 双 dev-server 直连，零手工异步边界 |
| prod 产物 | ✅ | 常缺失或降级 | ✅ 构建期改写，稳定 remoteEntry 文件名 + manifest |
| 语义完整度 | 100% | 残缺（版本协商/单例/容错经常缺失） | ✅ 逐条对齐 webpack 语义并有 e2e 验收 |
| **UMD / CJS-only 依赖** | 需自行处理 | **普遍不可用** | ✅ 自动支持（预构建外部化 + 构建期 require 垫片） |
| 远程加载失败 | 裸错误，需手写重试 | 普遍缺失 | ✅ 重试/熔断/超时内置 + `fallbackModule` 显式降级 |
| 运行时体积 | ~40KB+ | 不等 | **gzip < 5KB** |
| 配置出错时 | 难排查 | 报错晦涩 | 三段式报错：`got / expected / example` |

**真实工程验证**：某企业级 mes 系统（admin 宿主 + bpm/lowcode 两个子应用，21+6 页）已全量迁移——27 页双环境（dev 双 server / prod NGINX）控制台零报错，逐页写操作闭环（新增/编辑/删除/发布/导入导出/审批流）与原 qiankun 版本逐项一致，首用者从零接线全程有文档可依（见[迁移指南](#文档)）。

## 特性

- **exposes / remotes / shared 全语义**：`name@url` 语法、键重命名、promise-based remote、semver 全语法 requiredVersion、版本协商（最高版本胜出）、singleton / strictVersion、已加载版本永不替换、多版本共存、shareKey 重定向、多 shareScope
- **UMD / CJS-only 依赖开箱即用**：element-plus、avue 等只有 UMD/CJS 产物的依赖直接进 `optimizeDeps.include` 即可——dev 期插件自动把预构建产物内的 shared 键改道协商门面；build 期自动把 CJS `require(<shared>)` 重定向到垫片，双运行时免疫
- **自动异步边界**：top-level await 自动注入（es2022+），无需 webpack 式手工 `import('./bootstrap')`
- **稳定产物**：remoteEntry 固定文件名利于 CDN 长缓存；`fulgur-manifest.json` 资源清单；expose 独立 chunk
- **容错（对齐 webpack MF 2.0 errorLoadRemote）**：加载重试 / 熔断 / 超时内置；`loadRemote(spec, { retries, fallbackModule })` 单次调用级覆盖——失败时返回 fallback 模块，错误事件仍显式发出（**绝不静默兜底**，不传则照旧抛错）
- **增强能力**：dts 类型直连（dev 补全直达 remote 源码）、`preloadRemote()` manifest 驱动精确预载、runtimePlugins 钩子
- **HMR 全链路**：remote 改动 → host 页面热更，L1 组件热替换 / L2 状态保留 / L3 错误覆盖与恢复
- **零报错纪律**：配置问题启动瞬间三段式报错；联邦失败显式抛错（错误码 + 可执行修复建议），**无任何静默兜底路径**
- **CLI（主包内置 bin）**：`fulgur init`——`fulgur.config.ts` 单配置驱动的迁移生成器（模板 = 真实工程验证形态：vite 配置/路由表/桥/联邦启动器/NGINX conf 全量编码，锚点补丁幂等可续跑）；`fulgur doctor`——部署面体检（remoteEntry/manifest/HTML 缓存头与形态、CORS、chunk 抽样可达、版本 skew 预演、`--dev` 端口探测）
- **跨应用全局配置协商（W4）**：`provideFulgurAppConfig({ locale, size, ... })` 一次写入运行时页面级单例，各远程副本经 `getFulgurAppConfig()` 消费注入（EP locale/size 类问题的机制化收编）
- **全链路错误码体系（30 码）**：CFG/DEV/BLD/MFU 四段 + 手册 §8 码表防漂移校验

## 安装

```bash
pnpm add -D @fulgur/federation
```

要求：Vite ≥ 5.1（实测至 8.x）、Node ≥ 18、Vue 3、浏览器 Chrome 108+（TLA 原生支持）。

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
import { loadRemote, registerRemote, preloadRemote } from 'virtual:fulgur-runtime'

const Chart = defineAsyncComponent(() => loadRemote('remote-a/Chart').then(m => m.default))

// 构建时地址未知的远程？运行时注册（对齐 webpack promise remote 语义）
registerRemote({ name: 'shop', entry: await (await fetch('/api/remote-url')).text() })
await preloadRemote('shop') // 按 manifest 精确预载 chunk + CSS

// 远程可能部署不稳定？显式 fallback 模块 + 单次调用重试覆盖
// （失败时错误事件仍会发出，但返回 fallback 组件而非抛错）
const Panel = await loadRemote('shop/Panel', {
  retries: 3,
  fallbackModule: () => import('./PanelFallback.vue'),
})
```

> ⚠️ 上面这种静态导入**只限宿主侧页面**。exposes 目标文件（被宿主跨源加载的远程页面）禁止静态导入
> `virtual:fulgur-runtime`——会实例化第二份运行时副本、破坏渲染上下文，插件 dev 下会直接报错；
> 远程页面请用 `(globalThis as any).__FULGUR_RUNTIME__` 或独立产物的 `getRuntime()`（带 `version` 字段），
> 详见 `docs/迁移指南.md` 三B-1。

**没有别的步骤了。** dev 下 remote 跑它自己的 `vite dev`（容器入口 `/@fulgur-entry.js` 由插件中间件直出）；build 下 expose 自动拆独立 chunk、shared 自动剥离——同一份配置两端通用。

## CLI：init 起步模板 + doctor 部署体检

```bash
# 1) 生成带注释的 fulgur.config.ts 起步模板（宿主/远程/页面路由表/部署形态，单文件可入库）
npx fulgur init                                # 已存在则拒绝，--force 覆盖
# 样例：examples/fulgur.config.example.ts（通用字段示例）

# 2) 校验配置并输出可直接粘贴的样板：各应用 federation() 块、NGINX no-cache 站点模板、接入核对清单
npx fulgur init --config fulgur.config.ts

# 3) 部署体检（CI 可嵌）：缓存头/资源形态/CORS/chunk 可达/版本 skew
npx fulgur doctor --base http://your-site --apps app-a,app-b
npx fulgur doctor --base http://localhost:5173 --apps app-a --dev
```

**插件保持项目无关**：init 不改写任何项目文件，不内置任何具体项目的模板或补丁；权限路由、
远程启动器等项目集成细节由各项目按 init 输出的通用核对清单自行落地。

## ⚠️ 首次使用避坑指南（真实迁移项目踩坑实录）

以下每一条都在真实企业工程（qiankun → 联邦迁移，3 万模块级）中实际踩到过：

### 1. 插件升级后，务必「清缓存 + 重启 dev server」

vite 对 `node_modules/.vite` 预构建产物下发**一年 immutable 缓存**，浏览器与 dev server 都会持有旧内容。插件 dist 更新后：

```bash
# 每个联邦应用都执行
rm -rf node_modules/.vite
# 然后重启所有 dev server；e2e/浏览器请换新 profile
```

### 2. pnpm 项目装完 tarball 检查链接是否可达

pnpm 工作区/子项目里 `pnpm add xxx.tgz` 偶发软链断链（尤其整目录拷贝过的项目）。装完验证：

```bash
ls node_modules/@fulgur/federation/dist/index.js
# 断链时重新执行 pnpm add -D <tarball>
```

### 3. UMD / CJS-only 依赖（element-plus、avue、dayjs…）放 `include`，不要 exclude

插件会自动向 `optimizeDeps` 注入 esbuild 插件：把预构建产物内的 shared 键（vue 等）外部化到运行时协商门面。所以这些依赖**应该正常预构建**——移出预构建反而会让 CJS 文件被裸服务（dev 直接白屏报错）。也不要为它们手工加 `dayjs → dayjs/esm` 之类的别名：那会让构建期 CJS 消费方撞上双重 interop（典型症状 `xxx.default.extend is not a function`）。

### 4. dev 冷启动后，联邦页面先「预热」再判断

首次访问会触发依赖再预构建（504 Outdated Optimize Dep / 临时 Failed to fetch）。这是 vite 机制而非故障：把所有页面访问一轮（或重启后重访问一次）即稳定。e2e 脚本请先预热再断言，且断言一律条件轮询，不要固定短等待。

### 5. 不要手工别名/改写 shared 依赖的导入

共享依赖的改写由插件统一处理（dev 门面协商 / build 垫片）。手工别名会把 CJS 消费方导向 ESM 副本，产生双重 interop。

### 6. 构建目标必须是 es2022+

插件未显式配置 `build.target` 时会自动提升；若你自行配置了 es2021 及以下会收到警告——协商门面的 top-level await 需要它。

### 7. loadRemote 的显式降级（fallbackModule）

远程部署不稳定时，可给单次调用声明 fallback 模块：失败时返回 fallback（错误事件/console 仍会发出，**不是静默兜底**）；不传则照旧抛错：

```ts
const Panel = await loadRemote('shop/Panel', {
  retries: 3, // 覆盖 remote.retries
  fallbackModule: () => import('./PanelFallback.vue'),
})
```

### 8. 后端缺端点 / 站点域名未注册

登录页预检类接口（如租户按域名解析 `get-by-website`）在部分后端不存在时，浏览器会记录 404/401 资源报错。新站点部署时按后端要求登记域名，或在代理/NGINX 层加**诚实空响应**垫片（不伪造业务数据）。

### 9. 多版本组件库 CSS 共存

多版本 element-plus 等组件库 CSS 同挂 `:root` 变量时，**后加载的覆盖先加载的**。当前主流版本变量一致则无感；升级组件库时留意变量默认值变化。

### 10. 项目里的「env 同步脚本」会回写 env 文件

若项目里有「同步后端地址/端口」的脚本（如 `sync-backend-env.mjs`），手改 `.env.*` 会被它覆盖——改脚本维护的源头，不要手补文件。

## 配置出错？报错看得懂

所有配置问题在 `vite` 启动瞬间即报，固定三段式，可直接照抄修正：

```
[fulgur] Invalid federation() config — remotes["remote-a"] has no address (need one of external / dev / prod)
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

调试出口：`window.__FULGUR_SCOPE__`（share 协商实时结果）、`window.__FULGUR_INFO__`（remote 状态/耗时/错误）。

## 边界（明确不支持）

- 仅 Vue 3 生态（React 适配不在当前范围）；不兼容 originjs 的 `virtual:__federation__` 旧写法
- 不支持 SSR（检测到即警告并禁用钩子）
- 无浏览器 DevTools 扩展（提供 `window.__FULGUR_SCOPE__ / __FULGUR_INFO__` 调试面）
- 无 JS 沙箱 / CSS 隔离——联邦是同 realm 共存架构，靠 shared 单例协商防止双运行时（详见 `docs/沙箱边界审计.md` 的三维度实测）

## 文档

- [`docs/manual.html`](./docs/manual.html) — 完整使用手册：webpack 逐项对齐总表、每个功能的配置代码 + dev/prod 实测截图、错误码排查、NGINX 部署样例
- [`docs/迁移指南.md`](./docs/迁移指南.md) — qiankun 微前端 → 联邦的真实迁移案例（七步法 + 验收清单）
- [`docs/webpack-mf-对照与缺口.md`](./docs/webpack-mf-对照与缺口.md) — webpack MF 逐项对照与明确不支持清单
- [`docs/沙箱边界审计.md`](./docs/沙箱边界审计.md) — CSS / 全局变量 / 公共依赖三维度互扰实测
- [`docs/页面功能验收清单.md`](./docs/页面功能验收清单.md) — 真实工程 27 页逐页逐功能三环境验收记录
- [`DESIGN.md`](./DESIGN.md) — 架构设计、对齐总表、测试与验收方案

## 开发与测试

```bash
pnpm install
pnpm test        # 单测（97）+ fixtures dev e2e（10）+ prod e2e（8）
pnpm test:unit   # 仅单测
pnpm test:dev    # 仅 dev e2e（Vite 6/7/8 矩阵见 CI）
pnpm test:prod   # 仅 prod e2e
bash e2e/h7-install-test.sh   # H7 装后实测：pack → 干净目录 → dev+prod 双引擎断言
```

CI（GitHub Actions）：单测 + fixtures e2e（Vite 6.4.3 / 7.3.6 / 8.3.0 矩阵）+ runtime gzip 5KB 红线守卫，每次推送自动运行。

## License

[MIT](./LICENSE) © chenmingye (Jason)
