# 测试方法

> 从 [CONTRIBUTING.md](../../CONTRIBUTING.md) 与 CI 配置提炼的测试操作手册。行为改动必须补测试并跑通；通过数量以本次运行记录为准，不用历史数量代替。

## 已有工程接入方案验收

接入依据是当前[首次接入指南](../zh/guide/first-integration.md)，不是历史验收副本、旧报告或模板 main。模板采用 defineApplication/start 是有效的新建工程方案；API 能力演示和故障夹具可以有自己的组织方式，不能把它们当成已有工程必须照搬的结构。

已有工程的验收同时检查行为与代码方案。执行者交付一张简明映射表，列出：原业务入口/初始化位置、独立与桥接调用方、exposes 实际目标、注册源、Provider 的实际注入依赖、props 定义与生成声明路径。每个新增接入文件写明必要职责；缺少证据或违反以下条件时，不能仅以“构建成功/页面能显示”判为接入合格。

1. **先确定路径**：普通组件直接 expose；完整应用默认保留原独立启动，桥接复用业务创建。只有项目主动选择统一启动时才改 main 为 application.start，不能从模板反推该要求。
2. **确需提取才提取**：原函数会 mount 时可仅拆出共享创建阶段，在业务目录保留一份；列出独立与桥接两个真实调用方和未挂载返回值。不要为缩短文件搬整份 main、另起第二份注册清单或创建转发 helper；不以行数作为验收标准。
3. **环境按实际缺口补**：检查消费方已有注册和原组件的局部 import，复用业务注册源；指出缺少的注入键并直接引用单个已有 Provider。Provider 的副作用也要验收，不默认创建包装文件，不删除真实业务适配。
4. **类型来自提供方**：提供方准确声明 props；消费方使用生成声明推导，不重复 DTO，不手改生成文件，不以 Record<string, unknown>/any 掩盖已知字段。正向与错字段/错类型负向测试都使用实际同步声明。嵌套 params 必须验证内部缺必填、错字段名、错字段类型；仅整个 params 传字符串失败不算字段验收。先带 expect-error 通过，再去掉指令确认原始诊断，步骤见[嵌套参数示例](../zh/guide/components-and-modules.md#嵌套-params-也必须检查内部字段)。
   类型包范围还要检查：仅保留入口声明的真实依赖，擦除实现专用声明及其 externals；同时覆盖重导出、推导返回值、import type、import equals、声明副作用、reference path 与循环依赖。不能用“一入口一文件”截断真实合同。分别记录冷生成耗时和分发文件数/字节，不能把输出缩小直接宣称为等比例编译提速。
5. **类型可读性与字段正确性分别取证**：字段级正负例通过只证明约束正确，不等于 IDE 可读。业务参数优先从远程组件入口直接 import type 提供方公开的具名合同，ref<业务类型>() 即可；通用 props 提取才使用 `FgVueRemoteProps` 等工具。不要要求每个业务消费文件编写 VisibleFields/NonNullable/多层映射；提供方命名合同与字段 JSDoc 在同步声明中保留。交付时分别报告：模板组件标签悬停（业务职责与剩余框架展开如实说明，不把“查看入口改善”写成“泛型已消除”）、params 类型名与状态/模板绑定值悬停（适用数据合同必须直接显示字段清单，包含继承字段；只出现业务名不算完成）、字段悬停（说明来自提供方 JSDoc）、补全候选、定义跳转到达命名合同。证据用真实编辑器（或其同源 Vue 语言服务）在修改前后同位置对比；终端 0 错误、生成 d.ts 截图或手写模拟 tooltip 不能替代。
6. **两种启动分别实测**：独立 URL、部署 base、刷新及功能开关；宿主深链、菜单、前进/后退、重进与每个新 router 的动态菜单/钩子。独立登录页能显示不等于独立账号登录已对接成功，报告分别写明。
7. **异步与显示都验收**：真实接口延迟后离页/重进、定时器清理、迟到回填与编辑器销毁；原 URL 页面与远程 props 两种入口都检查真实数据、只读与布局，不能用页面壳代替真实业务结果。

后续任务书引用此节作为接入质量条件，并在执行开始时核对当前文件；旧任务中的目录或装配要求若与当前指南冲突，先记录差异，按当前规则修正计划，不机械执行旧做法。私有业务地址、账号与具体补丁仍保留在本机私有资料，不能写进本公共手册。

## 普通远程组件的内部控件验收（必做）

执行前阅读[原注册源复用与逐层验收](../zh/guide/components-and-modules.md#已有项目复用原组件注册源)。组件依赖范围包括 schema/componentMap 选出的控件及其内部标签，不止 expose 最外层文件。验收记录至少包含：

| 检查项 | 合格证据 | 不能替代的证据 |
|---|---|---|
| 实际 app 与唯一注册源 | 原入口/消费方 app 创建位置、共享映射和 setup 接线；子组件名及自定义实现保留 | shared.vue 单例、提供方 main 已注册 |
| 控件解析 | 字典选择框、选人输入/按钮、上传器的实际 DOM/角色；已知 Vue 标签无残留 | 有数据、输入框计数、接口200、CSS200 |
| 条件分支 | 可编辑模式打开选项/选人弹窗并取消；只读模式禁用控件；隐藏分支出现后再检查 | 默认初始页截图、未打开过弹窗 |
| 生命周期 | 独立URL/远程props、离页重进、桥接重建 app 后控件仍正常 | 仅首次加载通过、容器级一次性注册 |
| 故障识别 | 开发解析警告与生产真实DOM分别检查；区分组件缺失和CSS问题 | 生产控制台无警告、无MFU占位 |

任一已知组件成为原始标签，或下拉选项直接并列成文字，属于渲染失败，不能记录PASS。必要的合法Web Components白名单按真实实现解释，不通过全局忽略带连字符标签掩盖Vue组件缺失。未完成的交互如实登记，不以只读截图冒充可编辑验证。

## 组件类型显示回归

执行前按[提供方到实际 IDE 的完整顺序](../zh/guide/components-and-modules.md#从提供方到实际-ide-的完整接入与验收顺序)检查。生产 types 的 provider 阶段只验证，不发布新站点资源；必须另行核对提供方构建/部署后的 HTTP index/revision，再同步消费方。静态已登记入口的空 props 回退不得算展示改善。任务要求字段直接可读时，仅有不透明别名或新增JSDoc也不算完成。没有实际IDE截图的项记为未验证/真实阻塞，不能PASS，不能用历史方案的较低兜底替代当前验收。

组件标签悬停、params/字段悬停、补全与跳转分别留证。具体 SFC 的命名接口必须继承原始完整签名；真实 SFC 生成后经 ambient 同步的必填 props、事件、expose 和 slots 用例均检查，不能只断言字符串变短。泛型或额外包装未被安全识别时保留原表示，不为展示删除能力。普通 TS quickInfo 回归不替代真实 Vue 模板 IDE 截图。

## 测试分层

| 层 | 位置 | 覆盖 |
|---|---|---|
| 单测 | `packages/plugin/tests/` | 配置规范化、shared 归一化、manifest 契约、dts 生成、host-pages 纯解析内核、port 词边界、doctor 抽取逻辑等 |
| dev e2e | `e2e/`（playwright，`--project=dev`） | HMR、shared singleton、键重命名、promise remote、MFU 错误码、容错恢复全功能用例（fixtures 三件套，dev 口径） |
| fault e2e | `e2e/`（`--project=fault`） | 故障注入：远程不可用/错误入口/超时/版本冲突/非法桥接契约/setup 与卸载异常 |
| prod e2e | `e2e/`（`test:prod`，需 NGINX） | no-cache/回退/CORS 真实部署口径（脚本自启隔离测试实例） |
| 产物断言 | `packages/plugin/tests/build-*.test.ts` | 构建产物形态：manifest、CSS 收集（Vite 8/Rolldown 下共享静态依赖 chunk 的 CSS 进 expose manifest）、门面 chunk 隔离 |
| examples 门禁 | `npm run test:examples` | 模板与 scenarios.json 一致性、锁文件、启动脚本与规范源逐字节一致 |

## 本地跑法

先安装并构建插件，fixtures 才能经 `link:` 使用可用的 `dist`。在仓库根目录：

```bash
pnpm --dir packages/plugin install
pnpm --dir packages/plugin build
for app in fixtures/host-vue fixtures/remote-a fixtures/remote-b fixtures/remote-auto fixtures/host-auto fixtures/remote-react fixtures/host-react e2e; do
  pnpm --dir "$app" install
done
pnpm --dir e2e exec playwright install chromium
pnpm test:unit
pnpm test:dev
pnpm test:prod   # 需 NGINX；脚本会清理它自己启动的隔离测试实例
```

实际 CI 矩阵见 `.github/workflows/ci.yml`。

## fixtures

`fixtures/{host-vue,remote-a,remote-b,remote-auto,host-auto,remote-react,host-react}` 是最小联邦夹具（端口 5100–5102 一族；prod 经 NGINX 8999）。用途：

- dev/prod e2e 的宿主与远程；
- 版本矩阵升级实测（Vite 7/8 轮次，见 [P5 兼容矩阵](compatibility-testing.md)）：fixture 内 `pnpm add -D vite@^7` 升级 → e2e 全量 → `git checkout -- fixtures/ && pnpm install` 恢复基线（不留升级残留）。

注意：fixtures 默认只覆盖 vue 生态；react fixture 补齐时需同步扩矩阵。

## 门禁（build 内置）

`npm run build`（插件目录）包含三类门禁，任一失败构建失败：

1. **gzip 体积**：`dist/runtime.js` gzip ≤ 10496B；路由同步入口各 ≤ 4096B；
2. **错误码三方一致性**：`scripts/check-manual-codes.mjs` 校验源码码表（`src/runtime/errors.ts` MFU 段 / `src/context.ts` CC 段）↔ 登记表 `CODE_REGISTRY`（`src/diagnostics.ts`）↔ [API 手册错误码总表](../zh/reference/errors.md)——文档防漂移的唯一防线，**不要绕过**；
3. **错误文案三段式断言**：ERROR 级文案 `cause`/`fix` 非空（单测）。

## examples 一致性门禁

`npm run test:examples` 校验：

- 五个模板（`examples/templates/`）的场景登记与 `examples/scenarios.json` 一致（目录、包管理器、workspace 安装目录、端口）；
- 各模板 `scripts/dev.mjs` 与规范源 `examples/scripts/dev-runner.mjs` 逐字节一致；
- 模板带有效锁文件、使用 npm registry 正式包，在不含 node_modules/dist 的独立目录中验证冻结安装和构建。

新增或移动示例工程时同步 scenarios.json 后必须跑通该门禁。

## Vite 版本矩阵（CI 常驻）

- Vite 6 / 7 / 8 的 e2e 作业随 CI 常驻（Vite 8.3.2：dev 73/73 + prod 33/33）；
- React 代表性验证：React 18 + React Router 6（dev 34/34 + prod 20/20）；React 19 + RR7 随基线矩阵；
- 兼容性验证方法见 [兼容性验证](compatibility-testing.md)。

## 调试建议

- 配置类问题先跑 `npx @fulgurjs/federation doctor`（部署面）与 `npx @fulgurjs/federation explain`（有效配置），多数问题能直接定位；
- 报错按错误码查[错误码总表](../zh/reference/errors.md)；
- dev 下改了插件源码要重启 dev server（缓存自动清，但仍需重启进程）。

## 提供方跨重启类型缓存验收

必须用独立Node/dev进程证明命中，不把同进程内存、Vite预构建或消费方unchanged当提供方缓存命中。记录冷生成、输入校验恢复、HTTP类型代次与生成器调用次数；首次建账成本如实说明。缓存要覆盖继承配置、root/include成员、目录外/链接依赖、JSDoc类型引用、锁/工具/插件变化以及同大小同mtime的内容修改；损坏/丢失/不可写、失败不复用、编译中变动重检与关闭取消均需验证。多个实例不共享可变编译目录，成功快照原子发布；生产build和CLI不得用dev缓存冒充严格生成通过。

## 冷生成与Vite启动性能

现代Vue路径须证明复用实际编译输入记录，不先深扫工程与工具测试依赖；build/CLI及dev implementation模式的静态闭包源错误仍拒绝产出；默认dev contract模式须明确区分合同和实现检查，emit只覆盖公开声明图。记录缓存的源码/配置/锁/工具/链接与全局声明新增失效，包含生成中修改/撤回。对同一真实工程分开记录dts关闭基线、默认冷/暖的Vite ready、首HTTP、类型就绪及编译器调用；声明合同必须与严格生成等价；仅import type书写差异可通过真实正反消费用例验证，不能接受丢失字段/事件/实例能力。不得以后台运行为慢生成辩解，也不得将首次类型就绪当作dev监听时间。

## dev编译会话与元数据注释

同一服务内测初次→改props→改被导入类型→错误→移动行号→恢复，必须以真实编译诊断与声明字段断言，不把进程复用等同于诊断正确；加配置切换、新优先解析路径、外部声明变更及关闭/取消/超时恢复。每轮完整静态诊断门禁保留，不能只验证直接修改的SFC。不同服务隔离，CLI/build不共享会话。同步声明只改插件首行来源/revision应命中已有产物，改业务JSDoc或字段必须失效；分发摘要仍全量校验。性能分开记录初次、保存真实props改动后的端点就绪、类型错误反馈和恢复，不以无变化重启时间冒充源变更耗时。


## 类型准备优先级与读取视图

用真实Vite钩子排序证明类型准备先于其他pre配置工作，core对共享和分包的配置顺序不变；root/exposes改变取消旧任务。build、preview、dts:false不启动。配置未接管的60秒租约、middleware关闭、同插件对象重启，以及编译前预载进程的接管/退出均须验证，不只断言创建过任务。

当轮读取视图只能发布已完成真实输入校验的结果。覆盖新优先文件、生成中变化、校验不可用时自动关闭复用重跑，以及失败记录监听外部修复；失败不得写成功缓存。原生路径读取需要标准回退、Windows长路径、中文路径、换链接与断链回归。库声明的JSDoc解析优化须以真实消费者验证字段文档、optional/readonly和JS的JSDoc错误，不能仅检查生成文件中是否复制了外部库注释。

真实工程的模块边界调整分别归因：SDK算法、项目类型引用、路由装配、其他Vite插件耗时不能混为一个SDK收益。至少三组交错对照，记录T0/监听/类型发布/消费同步，正式包重新验证；声明与正确性相同后才能比较性能。不得仅靠关预构建、预生成、丢失文档或缩诊断范围达标。


## 通用公开合同生成验收

必须用独立TS/TSX、Vue工程证明不依赖私有业务改造。大型实现图至少400模块：公开合同不读未引用实现，原路径仍检查真实实现错误；对比字段文档、readonly/optional、泛型、重载、默认值、事件与实例API。显式合同由官方工具生成；孤立声明失败不得接受any输出。Vue运行时props、解构默认、expose/model/slots、泛型、特殊编译选项的拒绝、全局增强保留及显式implementation模式均需验证。源码字节与Vite运行时代码不得改变。

默认dev合同成功/故意模板错误与implementation拒绝要分别实测；日志、清单check及消费metadata明确范围。配置非法值、模式缓存隔离、外部类型修复、编译中变动、关闭取消仍须通过。build/CLI必须对真实实现错误失败，不读dev成功快照。首次、缓存重启、输入变化分别计时；复杂回退仍慢时如实记录，不能假称所有工程恒定小于5秒。


补充通用场景：无props页面、字面量defineOptions、事件数组、暴露函数的void/never/重载/流窄化、SDK桥接默认/显式/参数推导props（Vue与React）。ambient引入400模块页面仍应阻断实现扩张。使用真实vue-tsc 1.x/2.x别名包验证外部类型变化、跨重启缓存；不得仅改版本字符串。父进程准备后修改源码必须读新合同。投影只移除模板/普通样式用途及相应unused诊断，真实tsconfig和严格CLI仍须拒绝实现错误。

### 开发合同读取边界

必须证明不支持的推导入口在展开400模块实现图前失败；投影诊断不得触发第二轮完整源码。独立ambient环境不得加载未引用的自动组件/变量/普通声明模块，真实全局DTO、模块增强及显式GlobalComponents引用仍精确。预算超限须拒绝整批产物；时间/内存/系统终止不得自动提高预算重跑。验证终端入口/文件/原因/修法、无新成功manifest、修复后自动恢复、模式切换缓存隔离；build/CLI的实现错误仍拒绝。真实项目记录读入数量和冷/暖时间，不将读取d.ts索引说成扫描全部业务实现，也不承诺任意公开类型图都只读一个文件。
