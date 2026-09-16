# D.2 设计方案：`defineFulgurPages()` 路由表校验（带参路由 expose 键冲突告警）

> 状态：**待用户评审，未实现**。评审通过后按本方案实施。
> 关联：`docs/插件改进项评估-2026-09-16.md` D.2；文末附 D.4（副本收敛）方向建议供一并拍板。
> 起草：2026-09-17。

---

## 1. 背景与问题（事故复盘）

宿主侧路由表（testbed：`demo-host/src/qiankun/fulgurPages.ts`）把后台菜单路由解析为
远程 exposes 模块。带参路由在缺省推导时会**剥离 `:参数` 段**：

```
/flowable/bpm/manager/model            → pages/bpm/manager/model            （列表页）
/flowable/bpm/manager/model/:type/:id  → pages/bpm/manager/model            ← 与列表页收敛相同！
```

真实事故（阶段 1，已人工纠偏）：`:type/:id` 本应按 `params.type` 区分 update/copy/definition
三种行为，剥参推导后与列表页 expose 键相同——**"复制流程"静默误走"更新"语义，属数据风险**。
当时靠两道人工手段规避：条目上手写 `spec: 'pages/bpm/manager/model/update'` 显式覆盖 +
代码注释说明。但这类错误**没有任何自动化检测**：下一个开发者新增带参路由、或删掉那条
显式 spec，冲突立即复活且静默（页面能打开、接口能通，行为是错的）。

## 2. 目标与非目标

**目标**
- G1 带参路由剥参推导与其它条目 spec 收敛冲突时，**dev 启动/build 前显式报错**（三段式文案）；
- G2 顺带覆盖路由表的结构性错误：spec 重复、路由遮蔽、name 重复、（dev）spec 在远程
  exposes 清单中不存在；
- G3 向后兼容：现有 `FulgurPageRoute[]` 数据结构不变，迁移 = 给数组字面量包一层函数；
- G4 校验为纯同步纯函数，dev（浏览器模块求值）与 build（node）行为一致。

**非目标**
- 不重新设计宿主路由系统（`remoteOfRoute` 等宿主私有逻辑不动）；
- 不做"自动改写 spec"（语义有歧义，只报错不代改——H3 显式原则）;
- 不做运行时 URL 级探测（见 §8 备选否决）。

## 3. 现状梳理（设计落点）

现有消费链（`fulgurPages.ts`）：

```
FULGUR_PAGES: FulgurPageRoute[]
  ├─ { route, name?, spec?, title? }
  ├─ remoteOfRoute(route)          → '/lowcode/' 前缀 = mes-lowcode，否则 mes-bpm（宿主私有）
  ├─ exposeKeyOfRoute(route)       → 'pages/' + 去前缀 + 去 :参（宿主私有推导规则）
  └─ resolveFulgurPageFromPath()   → spec = `${remote}/${page.spec ?? exposeKeyOfRoute(route)}`
                                    （spec 缺省时走推导——冲突就发生在这里）
```

关键事实：**推导规则是宿主私有约定**（`pages/` 前缀、剥哪个前缀段都是 mes 项目的约定），
插件不能硬编码。因此校验器必须把"推导规则"作为参数交给插件，插件只负责规则校验本身。

## 4. 总体设计：两层校验

```
┌ Tier 1（核心，纯同步，dev+build 恒开）──────────────────────┐
│ defineFulgurPages(pages, { deriveSpec })                    │
│ 纯函数：结构规则 R1/R2/R4/R5 校验，违反 ERROR 级直接 throw，  │
│ WARN 级聚合 console.warn。零依赖，node/浏览器两边可用。        │
└─────────────────────────────────────────────────────────────┘
┌ Tier 2（存在性校验，dev-only，插件数据支撑）──────────────────┐
│ defineFulgurPages(pages, { schema })                        │
│ schema = virtual:fulgur-remote-schema（宿主插件实例在 dev     │
│ server 启动时由各 remote 的 dev manifest 生成，复用 dts.ts    │
│ 的拉取管线）。校验每条有效 spec 的 exposes 键真实存在。        │
│ build 期远程 manifest 不一定在盘上 → 插件生成空 schema 并      │
│ console.info 跳过（诚实降级，不猜）。                          │
└─────────────────────────────────────────────────────────────┘
```

## 5. API 设计

新增包子路径导出 `@fulgur/federation/pages`（`package.json` exports 增加一项；
类型与实现放 `src/pages.ts`，构建管线与现有 tsup 配置一致）。

```ts
// 宿主用法（testbed 迁移示例， fulgurPages.ts 改动约 5 行）：
import { defineFulgurPages } from '@fulgur/federation/pages';
import remoteSchema from 'virtual:fulgur-remote-schema'; // Tier 2，dev 由插件生成

export const FULGUR_PAGES = defineFulgurPages(
  [
    { route: '/flowable/bpm/manager/model', name: 'BpmModel', title: '流程模型' },
    {
      route: '/flowable/bpm/manager/model/:type/:id',
      name: 'BpmModelUpdate',
      spec: 'pages/bpm/manager/model/update', // 带参路由：显式 spec（不写会被 R1 拦下）
      title: '修改流程',
    },
    // ...其余 25 条，结构不变
  ],
  {
    // 推导规则：宿主私有约定作为参数传入（即现有 exposeKeyOfRoute，一行不用改）
    deriveSpec: (route) => exposeKeyOfRoute(route),
    // Tier 2 可选：远程 exposes 清单（dev 由插件虚拟模块提供；build 为空则跳过）
    schema: remoteSchema,
    // 严重级别可调（默认 error）：
    // strict: false → ERROR 级降级为 console.error（不推荐，默认 fail-fast）
  },
);
```

类型定义：

```ts
export interface FulgurPagesOptions {
  /** 带参路由的缺省 spec 推导规则（宿主私有约定；缺省 = 去首段 + 剥 :参段） */
  deriveSpec?: (route: string) => string;
  /** remote 名 → exposes 键清单（dev 由 virtual:fulgur-remote-schema 提供；可省略） */
  schema?: Record<string, { exposes: string[] }>;
  /** false = ERROR 级降级 console.error（默认 true = throw） */
  strict?: boolean;
}

export function defineFulgurPages<P extends FulgurPageRouteLike[]>(
  pages: P,
  options?: FulgurPagesOptions,
): P; // 原样返回入参（仅校验，不改写）
```

`FulgurPageRouteLike` 是结构最小约束（`route: string` 必填，其余字段宿主自由扩展），
**不约束宿主的 name/title 等业务字段**——校验器只读它需要的键。

## 6. 校验规则明细

有效 spec 定义：`page.spec ?? deriveSpec(page.route)`；比较前做归一化
（剥开头 `./`、剥首尾 `/`）。所有违例聚合为**一次**报错（不 fail-on-first）。

| 规则 | 级别 | 内容 |
|---|---|---|
| **R1 剥参收敛冲突** | **ERROR** | 无显式 spec 且 route 含 `:参` 的条目，其推导 spec 与**任一**其它条目的有效 spec 相同 → 报错。即本事故类。文案示例见下 |
| R2 有效 spec 重复 | WARN | 两条路由有效 spec 完全相同（可能是刻意的菜单别名，要求有意识） |
| R3 spec 不存在（Tier 2） | ERROR | schema 提供时：有效 spec 的 exposes 键不在对应 remote 清单中（等价于把运行时 MFU-006 提前到启动期）；schema 为空时整条跳过并 console.info 说明 |
| R4 静态路由被遮蔽 | ERROR | 同段数下，某静态路由被数组中**更靠前**的带参路由遮蔽（matchSegments 先到先得）——静态路由成死路由 |
| R5 name 重复 | WARN | `name` 字段重复（vue-router 命名跳转歧义） |

R1 文案（三段式，聚合报错中的一条）：

```
[fulgur] 路由表校验失败（1 项）：
1. [R1] 路由 "/flowable/bpm/manager/model/:type/:id" 剥参推导 spec
   "pages/bpm/manager/model" 与路由 "/flowable/bpm/manager/model"（列表页）收敛相同。
   根因：参数段剥离后 expose 键与列表页相同，该路由会静默加载列表页组件
   （真实事故：复制流程误走更新语义，数据风险）。
   修法：为该条目显式声明 spec: '...'（指向带参页面自己的 expose），或调整路由拆分。
```

## 7. 实现要点

1. **插件包**：新增 `src/pages.ts`（校验器，纯函数）+ `src/virtual-remote-schema.ts`
   （Tier 2 虚拟模块生成）。宿主插件实例 dev 启动时复用 `dts.ts` 的 manifest 拉取管线
   （`fetchManifest(remote.devEntry)`，3s 超时既有），聚合 `{ [remote]: { exposes: [...] } }`
   写入虚拟模块；某 remote 拉取失败时该 remote 条目置空数组并在虚拟模块内附带
   `unavailable: string[]`，校验器对 unavailable 的 remote 跳过 R3（诚实降级）。
2. **build 期**：远程 manifest 不在盘上 → 虚拟模块输出空 schema + `console.info('[fulgur] build 期跳过 spec 存在性校验')`。R1/R2/R4/R5 不受影响（纯结构规则）。
3. **报错出口**：helper 在宿主模块求值时 throw → dev 下 vite overlay 直接可见，build 下
   构建失败；`strict: false` 时降级 console.error。默认 throw 与 D.1 一致（H3 显式原则）。
4. **与 D.1 的关系**：同为 dev 期误用拦截，但 D.1 挂在 transform 管线（远程侧源码扫描），
   D.2 是显式 API（宿主侧数据校验），互不依赖。

## 8. 备选方案否决记录

| 备选 | 否决理由 |
|---|---|
| 插件实例读取宿主路由文件做静态分析（vite.config 配 pages 文件路径） | 校验器要解析宿主 TS 模块（引入编译依赖/约定），且丢类型；「包一层函数」成本更低、类型更准 |
| 运行时 URL 探测（容器入口对宿主注册路由做参数冲突探测） | 运行时才报、易误报（D.2 评估时已否），启动期同步校验覆盖同一场景且零误报 |
| 只写文档检查清单（不写代码） | 事故证明人工约定不可靠——本次续作实测又花一轮才定位同类结构问题 |

## 9. 测试验证计划（实现后的验收口径）

**单测（packages/plugin，新增 tests/pages.test.ts，预计 +12~15 例）**
- R1：冲突命中（复刻事故形态 `model` + `model/:type/:id`）；显式 spec 后放行；
  无参路由互相不同 spec 不误报；
- R2/R4/R5：各构造正反例（R4 含「顺序调整即解除」用例）；
- R3：schema 命中/缺失/`unavailable` 跳过；spec 归一化（`./pages/x` vs `pages/x`）；
- 聚合报错：多条违例一次性全量输出、strict=false 降级不 throw；
- deriveSpec：默认推导 vs 宿主自定义推导；
- **防误报回归**：把 testbed 真实 27 页表（当前形态）作为用例跑一遍，必须零违例。

**fixtures e2e**：不改既有 18 例；新增一个「宿主路由表含冲突」的 fixture 用例属可选
（单测已覆盖规则本身），若做则断言 dev server 启动报错文本。

**testbed 真实项目双环境实测（H 线口径）**
1. 迁移 `fulgurPages.ts` 到 `defineFulgurPages`（含 schema 导入）→ dev 重启零报错、
   prod 构建零报错（build 期出现「跳过存在性校验」info 属预期）；
2. 27 页双环境矩阵全绿（回归确认迁移零行为变化）；
3. **冲突注入实验**：临时删掉 `:type/:id` 条目的显式 spec → dev 启动 overlay 出现 R1
   报错（截图）→ prod build 失败并输出同款文案（截图）→ 还原 → 双环境复绿。
   注入实验的截图与文本作为验收证据归档 docs/screenshots/。

## 10. 发布与迁移

- 纯新增 API：`@fulgur/federation/pages` 子路径导出；现有用户不迁移不受任何影响；
- README「避坑指南」与迁移指南三B 各补一条「带参路由必须显式 spec，defineFulgurPages
  会自动拦截」；
- 版本：随下一个 minor（v0.3.0，与 D.1/D.3 同批——三者合并为"误用拦截 + 契约官方化"主题）。

## 11. 工作量估计

| 项 | 估时 |
|---|---|
| 校验器 + 类型 + 虚拟模块生成 + 子路径导出 | 0.5 天 |
| 单测（含 27 页表防误报用例） | 0.5 天 |
| testbed 迁移 + 冲突注入实验 + 双环境回归 + 证据归档 | 0.5 天 |

---

## 附：D.4 方向建议（副本收敛，需拍板后再细化执行）

D.2 之外另一项待拍板的是 lowcode 产物依赖副本膨胀（70MB/1099 文件、EP 约 5 份副本、
单页解码 13.8MB、分页 i18n 失效的根因）。建议执行顺序：

1. **诊断（先做，0.5 天）**：rollup 阶段 dump 模块图，确认同一文件以何种不同模块 id
   进入多个 expose 子树（怀疑 expose facade 的按消费方改写引入了 id 差异）——修复方案
   取决于这个机制结论，不盲改；
2. **主方案候选 B**：把 element-plus 声明进 lowcode 的 `shared`（singleton）——插件的
   cjsRequireRewrite 机制（P0-2 已落地）会把 avue UMD 内的 `require("element-plus")`
   重定向到共享垫片，副本天然收敛为一份；代价是 EP 版本协商（admin 2.9.11 vs lowcode
   2.10.2，singleton 取最高 → admin 需对 2.10.2 做一轮回归）；
3. **备选 A**：插件 build 期跨 expose chunk 去重（通用但工程量大，依赖诊断结论）；
4. **验证口径**：lowcode dist 体积与单页解码量显著下降 + 「共 N 条」中文分页恢复 +
   27 页双环境矩阵全绿 + admin 自身页面回归。
