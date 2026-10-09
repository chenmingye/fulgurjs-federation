# 当前发布说明

## 6.5.1

修复 6.5.0 远程类型链的两个提供方生成缺陷（公共 API 与运行时不变）：

- **vue-tsc 误判**：入口是 `.ts` 但闭包传递依赖 `.vue` 的工程（如 showcase 的 `./bridge` 暴露）此前被判定为纯 TS 工程，走 TypeScript API 生成导致 `TS2307 Cannot find module '*.vue'`——现按源码树实际扫描判定（TS 的目录枚举不含 `.vue` 扩展名）。
- **externals 拆包名**：声明闭包引用 scoped 包（`@fulgurjs/federation` 等）时外部依赖登记被拆成错误的名字（如 `@fulgurjs`）；现按 scoped 包名规则取前两段，宿主的外部类型依赖核对不再误报。

## 6.5.0

远程类型自动生成与易用性重构：用户正常使用简短远程入口（`@fulgurjs/federation/vue` / `/react` / `/runtime`）即可获得准确、自动生效的类型提示与检查，不再需要理解双轨模式、手写跨项目 tsconfig paths，或依赖远程源码在宿主机器上。

**新机制（默认开启，`dts: false` 关闭）**

- 提供方从公开 exposes 生成**可分发声明闭包**（TS/TSX 用 TypeScript 编译器、含 `.vue` 用 vue-tsc）：默认/具名/类型导出、泛型、函数重载、重导出、SFC 真实 props/events 均按官方工具链产出；源码 alias 重写为声明内引用，绝不外发跨工程源码路径或本机绝对路径。声明资源随 dev 端点（`/@fulgurjs-types/`）与 prod 构建（`fulgurjs-types/`）发布，manifest 附带 `types` 定位与内容摘要；闭包编译错误时不产出残缺资源（TYP-001）。
- 宿主 dev 后台自动同步：有界重试、远程恢复/源码变化按摘要代次自动更新、逐文件 sha256 校验、路径边界与大小上限、完整下载后原子替换；产物（ambient 模块声明 + 类型注册表 + 生成器账本）写入 `src/fulgurjs/types/`（无 src 布局回退 `.fulgurjs/types`），常规 tsconfig 零配置发现；目录未被覆盖时给出 TYP-006 最小修法，插件绝不改写用户 tsconfig。
- 类型注册表：`loadRemote` / `remoteComponent` / `createVueBridgeApp` / `createReactBridgeApp` 与普通 import 共用同一套入口类型——已同步字面量获得真实模块/组件/桥接类型（含 `appProps` 从提供方 `defineBridgeApp<P>` 声明推导），拼错入口在调用点编译报错；动态字符串变量放行并得到诚实的 `unknown`；未同步任何类型时全部放行（`unknown` 边界）。
- 新 CLI：`fulgurjs types`（提供方验证声明生成 + 宿主同步 + 发现/外部依赖检查，失败非零退出，供 CI 在 typecheck 前运行；`--check` 只核对本地缓存）。

**破坏性变更（配置删除与签名变化，按次版本发布）**

- 移除 `dts.mode`（source/shim 双轨）与 `devFsRoot` 配置及 dev manifest 的 `fsRoot` 字段——旧类型直连链（跨工程源码转发目录、宿主手工 paths、any 桩降级）整体移除；遇到旧配置显式报 CFG-013（含迁移指引），不静默忽略。
- `loadRemote` 默认返回类型由 `Record<string, any>` 改为注册表推导（未同步/动态 → `unknown`）：依赖旧宽松成员访问的代码需要显式泛型或同步远程类型；显式泛型 `loadRemote<T>(…)` 用法不变。
- 模板不再提交生成的类型产物（`src/fulgurjs/types/` 已入 `.gitignore`，由 dev/CLI 生成）；含 `.vue` 暴露的模板新增 `vue-tsc` devDependency，各应用新增 `types` / `typecheck` 脚本。

**修复与文档**

- 新错误码 TYP-001…007（生成失败/同步失败/校验拒绝/未提供类型/外部依赖缺失/发现失败/工具缺失），中英文错误码表同步。
- 中英文文档（指南/配置/API/CLI/类型/排错）统一为当前单一机制，移除双轨与 fsRoot 说明；README 增补远程类型能力与命令。
- 运行时零新增字节（全部类型层改造）；共享依赖协商、桥接挂载/卸载、会话、URL 同步与错误恢复语义不变。
