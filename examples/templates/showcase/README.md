# 双向桥接 URL 同步（examples/templates/showcase）

`@fulgurjs/federation` 5.9.1「桥接 URL 同步」（`/bridge/router/*`，README §8.3）的双向旗舰演示：
两个方向的宿主 × 子应用各一套——

- **vue-host（:5334）× react-remote（:5333）**：Vue Router 4 宿主 + `createReactBridgeRouter` React 子应用
- **react-host（:5336）× vue-remote（:5335）**：React Router 7 data router 宿主（含 `useBlocker` 原生守卫）+ `connectVueBridgeRouter` Vue 子应用

宿主 URL 表达子应用内部位置：刷新直达、收藏分享、前进后退、宿主菜单深链、宿主导航唯一写历史的全部语义在本页可逐条操作验证。

## 快速开始

```bash
cd examples/templates/showcase
pnpm install --frozen-lockfile
pnpm dev
# Vue 宿主：http://localhost:5334/br-react/orders
# React 宿主：http://localhost:5336/br-vue/orders
```

整个目录是一个独立 pnpm workspace；复制时包含四个应用及根配置和锁文件。`pnpm build` 构建全部应用；环境要求见[模板指南](../README.md)。

dev 冒烟自检（本机有全局代理时必须 `--noproxy '*'`）：

```bash
curl --noproxy '*' -s -o /dev/null -w '%{http_code}\n' http://localhost:5334/                      # 200
curl --noproxy '*' -s -o /dev/null -w '%{http_code}\n' http://localhost:5336/                      # 200
curl --noproxy '*' -s -o /dev/null -w '%{http_code}\n' http://localhost:5333/@fulgurjs-entry.js   # 200
curl --noproxy '*' -s -o /dev/null -w '%{http_code}\n' http://localhost:5335/@fulgurjs-entry.js   # 200
```

## 端口与工程表

| 工程 | 端口 | 角色 | 桥接前缀（basePath） | 关键路由库 |
|---|---|---|---|---|
| `react-remote` | 5333 | React 子应用（expose `./bridge`） | 被 `/br-react` 承载 | react-router-dom ^7（memory data router） |
| `vue-host` | 5334 | Vue 宿主（套 react-remote） | `/br-react` | vue-router ^4.5（history 模式） |
| `vue-remote` | 5335 | Vue 子应用（expose `./bridge`） | 被 `/br-vue` 承载 | vue-router ^4.5（createMemoryHistory） |
| `react-host` | 5336 | React 宿主（套 vue-remote） | `/br-vue` | react-router-dom ^7（createBrowserRouter） |

子应用页面集（两框架等价）：工单列表 `/orders`（筛选 `q=xxx&page=n` 写入 query，中文可输入）、工单详情 `/orders/:id`（路径参数）、设置页 `/settings`（本地状态表单，刻意不进 URL）、锁定页 `/locked`（宿主守卫放行后才可见）、根路径 `/` 以 replace 规范化到 `/orders`（不产生额外历史条目）。

宿主页面集：首页 `/`、关于 `/about`、桥接演示页 `/br-react`（或 `/br-vue`）+ 顶部菜单「工单列表 / 设置」直达子应用深链。**子应用挂载在单条 catch-all 路由**（`/br-react/:pathMatch(.*)*` / `br-vue/*`）下，子应用内部导航不重挂宿主组件。

## URL 同步演示操作清单（逐条操作 + 预期结果）

以下操作在两个宿主上等价（路径前缀分别替换为 `/br-react` / `/br-vue`）。页面上部「URL 同步观测台」实时展示：宿主当前 URL（location.href）、子应用逻辑位置、history.length、子应用 mount 次数、最近 10 条导航事件（带来源标注）。

1. **深链直达**：地址栏直接打开 `http://localhost:5334/br-react/orders`
   预期：子应用自动挂载并渲染工单列表；观测台「子应用逻辑位置」= `/orders`；事件日志出现「子应用 — mount #1」与「子应用初始化 — init 初始位置 → /orders（与宿主深链一致）」。
2. **根路径 replace 规范化**：打开 `http://localhost:5334/br-react`（或从首页点菜单「桥接演示页」）
   预期：地址自动变为 `/br-react/orders`；事件日志出现「子应用初始化 — init 根路径规范化 replace → /orders（无新增历史条目）」；history.length 只增长 1（宿主那次 push；子应用重定向是 replace）。
3. **筛选写入 query（中文）**：在子应用工单列表输入「网络」→ 点「筛选（push ?q=&page=1）」
   预期：宿主地址栏变为 `/orders?page=1&q=%E7%BD%91%E7%BB%9C`（网络 的 URL 编码）；观测台子应用逻辑位置同步；事件日志新增「子应用 push/replace — push /orders?page=1&q=…」。
4. **分页**：清空筛选后点「下一页」
   预期：URL 变为 `/orders?page=2`；再输入中文筛选并点「筛选」，页码回到 1 并带 `q=`。
5. **详情（路径参数）**：点任一「查看详情」
   预期：URL 变为 `/orders/2?src=row` 形态；详情页回显工单 ID 与 query。
6. **返回列表 = 浏览器历史**：点「返回列表（go(-1)）」
   预期：回到第 3 步的 `/orders?page=1&q=网络`——筛选关键词与页码还在（组件状态从 query 还原）；mount 次数仍为 1；history.length 不变（POP 不新增条目）。
7. **路由切换不重挂**：任意在 工单列表 ↔ 详情 ↔ 设置 之间往返
   预期：观测台「子应用 mount 次数」恒为 1；子应用区域顶部的「本会话挂载次数」恒为 1。
8. **设置页本地状态跨路由保留**：设置页把昵称改为「李四」→ 菜单切去工单列表 → 再切回设置
   预期：昵称仍是「李四」（子应用 store 未重建）。
9. **宿主菜单深链**：点顶部菜单「设置」
   预期：宿主 `router.push`（React 宿主为 navigate）直达 `/br-vue/settings`，子应用内部同步跟随；事件日志「宿主菜单 — push /…」。
10. **子应用内 push/replace**：点「子应用 push /orders?q=演示&page=2」再点「子应用 replace /settings」
    预期：push 后 URL 带中文 query；replace 后 URL 变 `/settings`；随后点「子应用 go(-1)」应落在 replace 前的条目（locked），证明 replace 没有新增历史。
11. **子应用 go(-1)/go(1)**：点「子应用 go(-1)」「子应用 go(1)」
    预期：委托宿主浏览器历史前进后退；事件日志出现「子应用 go — go -1」与「浏览器前进后退 — …」两条。
12. **深链粘贴框**：向「深链粘贴框」粘贴完整 URL（默认值即带中文 query：`http://…/br-vue/orders?q=网络&page=2`，可改）→ 点「push 复现直达」
    预期：等价于「刷新直达」的 push 侧动作，URL 与子应用位置一次到位。
13. **宿主守卫——取消**：子应用点「锁定页（触发宿主守卫）」→ 守卫横幅点「取消」
    预期：URL / 历史 / 子应用位置全部保持不变（子应用自动回滚到工单列表）；事件日志「宿主守卫 — 取消 → …」。Vue 宿主为异步 `beforeEach`，React 宿主为 `useBlocker` 原生守卫横幅。
14. **宿主守卫——继续**：再点「锁定页」→ 守卫横幅点「继续」
    预期：URL 变为 `/locked`，子应用渲染锁定页；事件日志「宿主守卫 — 继续 → …」。
15. **刷新直达（终极验证）**：完成第 13/14 步任意深链后按 F5
    预期：整页刷新后子应用直接恢复到同一内部页面——URL 即子应用位置。

## API ↔ 源码对照表

| 插件公开 API | 入口 | 本演示接线位置 |
|---|---|---|
| `createVueBridgeApp(spec, options)` | `@fulgurjs/federation/bridge/vue` | `vue-host/src/pages/BridgeReactPage.vue`（`<RemoteReactBridge :routing="routing" :app-props="appProps" />`） |
| `createVueBridgeNavigation(router)` | `@fulgurjs/federation/bridge/router/vue` | `vue-host/src/routing.ts`（模块级单例端口，main.ts 组装后 `initBridgeRouting(router)`） |
| `connectVueBridgeRouter(routing, router, { signal })` → `await conn.ready` 后 `app.use(router)` | `@fulgurjs/federation/bridge/router/vue` | `vue-remote/src/bridge.ts`（异步工厂：初始 push 落定后再 install，顺序不能反） |
| `createReactBridgeApp(spec, options)` | `@fulgurjs/federation/bridge/react` | `react-host/src/pages/BridgeVuePage.tsx`（`<RemoteVueBridge routing={routing} appProps={appProps} />`） |
| `createReactBridgeNavigation(router, { canNavigate?, basename? })`（仅 data router） | `@fulgurjs/federation/bridge/router/react` | `react-host/src/routing.ts`（`createBrowserRouter` 实例组装后初始化） |
| `createReactBridgeRouter(routing, routes, { signal })` → `{ element }` 直接作为工厂返回值 | `@fulgurjs/federation/bridge/router/react` | `react-remote/src/bridge.tsx`（`/` 经 loader `redirect('/orders')` 以 replace 规范化） |
| `defineBridgeApp(factory, { routing: true })`（协议声明，缺失即 MFU-031） | `@fulgurjs/federation/runtime`（Vue）/ `@fulgurjs/federation/react`（React） | `vue-remote/src/bridge.ts`、`react-remote/src/bridge.tsx`（工厂内校验 `ctx?.routing`，`ctx.signal` 传入接线自动 dispose） |
| `BridgeHostRouting`（`{ basePath, navigation }` 组件 prop，独立控制通道不进 appProps） | 类型面见 README §8.3 | `vue-host/src/routing.ts`、`react-host/src/routing.ts`（basePath 常量 `BRIDGE_BASE_PATH`） |
| `BridgeChildRoute` / `BridgeLocation`（通道与位置契约） | `/bridge/router/*` | 由插件随 mount 第三参数注入子应用；两端仓库源码 `packages/plugin/src/bridge-router-core.ts` |

## 配置要点（复刻到其他工程时必读）

- **宿主 catch-all**：子应用前缀必须挂单条 catch-all 路由（`/br-react/:pathMatch(.*)*` / `br-vue/*`）渲染同一宿主组件，否则子应用内部导航会重挂宿主组件（子应用 mount 次数 > 1）。
- **双框架安装合同**：桥接宿主 shared 必须 vue / react / react-dom 三键全 `singleton`（见两个宿主的 `fulgurjs.config.ts`）。
- **vue-remote 的 vue-router 双实例防护**：`resolve.dedupe: ['vue', 'vue-router']` + `optimizeDeps.exclude: ['vue-router']`（vue-router 纯 ESM，exclude 后其 vue 导入被插件 dev 改写到 shared 门面；同 `fixtures/remote-a`）。
- **react-remote 的 react-router-dom 必须正常进预构建**（同 e2e 实测的 `fixtures/remote-react`：不 exclude、不 alias）：其传递依赖 cookie 是 CJS-only 包，exclude 后浏览器报 `does not provide an export named 'parse'`；预构建内的 react 导入不会双实例——插件 dev 会向预构建注入 shared 键外部化 resolver（`fulgurjs:optimize-shared-external`）。
- **dev 类型生成**：宿主 dev 启动时插件生成 `src/fulgurjs/types/<remote>.d.ts`（零配置轨，ambient `any`）与 `src/fulgurjs/types/<remote>.d/`（精确轨，需在 tsconfig 配 `paths` 才启用）。跨框架精确轨（React 宿主 tsc 消费 Vue 远程源码）需排除精确轨目录，见 `react-host/tsconfig.json` 的 `exclude: ["src/fulgurjs/types/vue-remote.d"]`。
- **守卫与 go 的交互**：守卫按目标路径拦截（不区分触发方式），子应用 `go(-1)` 回到受守卫页面同样会弹确认；Vue 宿主守卫在任何新导航开始时自动作废旧待确认（`vue-host/src/guard.ts` 的 `invalidatePending`），避免确认横幅悬挂。

## 构建 / 类型检查

```bash
# 4 个工程均独立通过（在各自目录执行）
pnpm run typecheck   # React 工程 tsc --noEmit；Vue 工程 vue-tsc --noEmit
pnpm run build
```

## 改端口（整组同步，漏一处启动器会被旧端口卡住）

四个应用的端口出现在三处，改任何一个都要整组同步：

1. 各应用 `package.json` 的 `dev` 与 `preview` 两个脚本的 `--port`（每应用两处）；
2. 宿主 `fulgurjs.config.ts` 里 `remotes` 的 dev 地址（`vue-host` 指向 react-remote 的 5333；`react-host` 指向 vue-remote 的 5335）；
3. 根 `scripts/dev.config.json` 里该应用的 `port`（**必改**：启动器预检/探活都读它）。

生产部署地址（各应用 `prod`）是站点路径，与 dev 端口无关，改端口不要动它。改完自查：`grep -rn "533" --include="*.json" --include="*.ts" .` 不应再出现旧端口。
