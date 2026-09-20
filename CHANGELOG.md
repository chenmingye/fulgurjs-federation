# Changelog

## 0.5.8（2026-09-20）

### 修复

- **dts 具名枚举的 as 别名**：`export { a as b }` 导出名取别名 b（0.5.7 误取原名）。

## 0.5.7（2026-09-20）

### 修复

- **dts 生成：环境模块改显式具名重导出**——`declare module` 里的 `export *` 不转发具名导出（TS 实测限制，远程 TS 模块类型直连为空）。生成时枚举源文件顶层具名导出，输出 `export { names } from`（正则面枚举 const/let/var/function/class/interface/type/export{}，含 as 别名）；无可枚举名退回 export * 保副作用导入。

## 0.5.6（2026-09-20）

### 修复

- **dts 生成：非 .vue 源码的 re-export 去掉 `.ts` 扩展名**——TS 默认禁止 `.ts` 后缀导入（需 allowImportingTsExtensions），带后缀的 `export * from "x.ts"` 在用户 skipLibCheck 下静默解析失败 → 远程 TS 模块（如共享状态文件）类型直连为空。.vue 保留扩展名（SFC 解析必需）。

## 0.5.5（2026-09-20）

### 修复

- **client.d.ts 改 script 形态**：0.5.3/0.5.4 的声明文件顶层含 export interface → 整个文件成为 module，其中的 `declare module` 退化为 augmentation 被静默忽略（TS 环境声明必须住非 module 文件）——全部类型内联进 declare module 块，垫片加载即全局生效。对外类型仍经 `virtual:fulgurjs-runtime` 导出（`import type { LoadRemoteOptions } from "virtual:fulgurjs-runtime"`）。

## 0.5.4（2026-09-20）

### 修复

- **类型垫片改 import 式**：0.5.3 生成的 `fulgurjs-runtime.d.ts` 用 `/// <reference types>` 指令指向包内声明，实测该指令解析不了 npm 包子路径（TS 5.6/vue-tsc 实证），垫片不生效——改用副作用 import 加载 `@fulgurjs/federation/client`（client.d.ts 本体不变），include 目录即生效。

## 0.5.3（2026-09-20）

### 修复（TS 体验）

- **`virtual:fulgurjs-runtime` 类型声明随包发布**：包内新增 `client.d.ts`（exports `./client`），运行时全部导出（loadRemote/loadShare/preloadRemote/registerRemote*/getRuntime/version 等 17 项）带完整签名；此前用户按 README §2 导入运行时 API，TS 报 `Cannot find module 'virtual:fulgurjs-runtime'`。dev 启动时插件还自动在 `src/fulgurjs-types/fulgurjs-runtime.d.ts` 生成引用垫片——include 该目录（远程模块类型直连本就要求）即零配置生效。+4 单测（守声明面与 runtime.js 导出面漂移，162/162）。

## 0.5.2（2026-09-20）

### 修复

- **dev 下 `preloadRemote` 注入的 expose 链接全部 404（npm 深度验证轮发现）**：dev manifest 的 `exposes[].file` 曾写 dts 类型直连的虚拟路径 `/@fulgurjs-src/...`（dts 实际只消费 `fsRoot`+`src`），而 `preloadRemote` 读同一字段注入 `<link rel=modulepreload>`——dev 下每个 expose 预载 404、预载完全无效。现改为真实可请求的模块 URL（与 dev 容器 `get` 的裸 URL 同款，含 base 前缀）；prod 不受影响（file 本就是产物路径）。+1 回归单测（158/158）。

## 0.5.1（2026-09-19）

### 修复

- **宿主页面「虚拟运行时导入 + 远程动态导入」混用漏改写（真实 npm 用户验证轮发现）**：post 阶段防双重生成守卫原先按「代码含 `virtual:fulgurjs-runtime` 字样」一刀切跳过，导致同一文件里合法导入 `loadRemote`（README §2 标准用法）后再写 `import('remote-a/X')`（README §1 标准用法）时远程导入漏改写，dev 下 vite:import-analysis 直接 500。现改为按插件生成物特征精确判定（代理化导入 `virtual:fulgurjs-runtime-proxy` / 改写助手 `__fulgurjs_loadRemote`·`__fulgurjs_loadShare` / 构建入口注入标识 `/* fulgurjs:init */`），用户混用照常工作；补 4 组单测（157/157）。

### 变更（发布面）

- **README 双端导航统一**：README 内 8 处文档相对链接（manual.html×4 / 迁移指南 / webpack MF 对照 / 沙箱边界审计 / DESIGN）改为 GitHub 绝对 URL——npm 页面与 GitHub 点击行为一致（npm 不解析包内相对链接，此前在 npm 上全部 404）。

## 0.5.0（2026-09-19）

### 变更（品牌全面对齐，breaking）

- 全品牌从 `fulgur` 对齐为 **`fulgurjs`**（npm 上 fulgur 组织名被占用）：
  - CLI 命令：`fulgur` → **`fulgurjs`**（`npx fulgurjs init` / `npx fulgurjs doctor`）
  - 虚拟模块：`virtual:fulgur-runtime` → **`virtual:fulgurjs-runtime`**（代理模块同步更名）
  - 全局单例：`__FULGUR_RUNTIME__` → **`__FULGURJS_RUNTIME__`**（`__FULGURJS_APP_CONFIG__` / `__FULGURJS_SCOPE__` / `__FULGURJS_INFO__` 同步）
  - 产物文件名：`fulgur-remoteEntry.js` / `fulgur-manifest.json` → **`fulgurjs-remoteEntry.js`** / **`fulgurjs-manifest.json`**（NGINX 规则同步更名）
  - 配置文件：`fulgur.config.ts` → **`fulgurjs.config.ts`**；错误前缀 `[fulgur:*]` → `[fulgurjs:*]`；运行时事件 `fulgur:error` → `fulgurjs:error`
  - GitHub 仓库：**fulgurjs-federation**（旧地址自动重定向）
- 升级方式：0.4.x 用户全局替换 `fulgur` → `fulgurjs`（导入/全局名/NGINX 文件名/CLI 命令）即可。

## 0.4.2（2026-09-19）

### 修复（npm 发布面）

- **npm 包内 README 与仓库 README 是两个文件**——包内是 4.7kB 旧版（无 API 参考）。现在构建时自动以仓库根 README（含完整 API 参考）为准，npm 页面与 GitHub 展示一致。
- npm 包自带完整文档：docs/manual.html（使用手册）、迁移指南、webpack 对照、沙箱审计、兼容矩阵、CHANGELOG、DESIGN、examples 起步样例——包内 README 的相对链接在 npm 上不再 404。

## 0.4.1（2026-09-19）

「让插件自动处理，而不是让用户记住规则」——两条使用规则自动化，使用面大幅简化。

### 变更（规则自动化）

- **任何文件都可以直接 `import { ... } from 'virtual:fulgurjs-runtime'`**（原 DEV-008 规则自动化）：
  exposes 目标文件（远程页面）里的静态导入，dev 下由插件自动改写为惰性单例委托模块
  （求值期零副作用、调用期转发页面级运行时单例）。用户不再需要知道
  「宿主/远程页面取运行时的不同姿势」，0.4.0 的手工 globalThis 写法已无需使用。
- **插件升级后重启 dev server 即可**（原 DEV-009 规则自动化）：dev server 启动时插件自动
  检测版本变化并清除本应用 node_modules/.vite 预构建缓存，无需手工 rm -rf。

### 修复

- runtime 两个存量 TS 断言错误（as Error → as FulgurjsError）与 fallback 源码契约断言同步。

## 0.4.0（2026-09-18）

开箱即用批次（A→E）全部落地；W7 发布链按用户指示顺延（未发布 npm）。

### 新增
- **CLI（主包内置 bin `fulgurjs`）**
  - `fulgurjs init`：起步模板（带注释的 `fulgurjs.config.ts`：宿主/远程/页面路由表/部署形态，
    单文件可入库可复跑）+ 配置校验（CFG 三段式报错）+ 输出可直接粘贴的样板
    （各应用 federation() vite 块、NGINX no-cache 站点模板、通用接入核对清单）；
    **项目无关**——不内置任何具体项目的模板、锚点或文件改写
  - `fulgurjs doctor`：部署面体检——remoteEntry/manifest/index.html 的 200/no-cache/JS 形态、
    CORS、chunk 抽样可达（含 index.html 引用与一跳下钻、200-HTML 回退伪装识别）、
    版本协商 skew 预演、`--dev` 模式端口/容器入口探测；`--json` 供 CI
- **W4 跨应用全局配置协商**：runtime 新增 `provideFulgurjsAppConfig` / `getFulgurjsAppConfig`
  （页面级单例、浅合并、globalThis 镜像）——EP locale/size 类跨副本配置的机制化收编
- **W5 诊断补码**：CFG-007（remotes 对象形式误用 name@ 前缀）、CFG-008（shared 非法组合）、
  DEV-010（dev 冷启动预构建窗口提示）；BLD-003 必填 props 扫描器（按实测降级为手册核对项）
- **W8 验证基建**：持久 profile 重部署用例（复刻 immutable 缓存坑）、full-verify 失败自动归因、
  func-results 联动归档

### 修复
- **U-7 裸门面**：`genSharedFacade` 改枚举式再导出——rolldown 产物下 `export *`+TLA 展开致
  命名绑定全 undefined（provider 注册后 loadShare 拿到的命名空间只有 default）；
  生成物级核对 494 个导出名全部进入赋值回调；bare 导入 prod 实测通过

### 变更
- **插件去项目化（2026-09-19 定调）**：移除 init 中曾内置的具体项目集成模板/锚点/补丁
  （历史实现见 git 历史）；`fulgurjs init` 重写为纯通用脚手架，配置 schema 同步精简。
  插件为所有项目服务，不做任何单一项目的形状。
- runtime gzip 5212 B（红线 ≤5250 内）；单测 148/148；错误码 30 个全量文档对齐
