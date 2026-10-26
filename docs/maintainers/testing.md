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
5. **类型可读性与字段正确性分别取证**：字段级正负例通过只证明约束正确，不等于 IDE 可读。业务参数优先从远程组件入口直接 import type 提供方公开的具名合同，ref<业务类型>() 即可；通用 props 提取才使用 `FgVueRemoteProps` 等工具。不要要求每个业务消费文件编写 VisibleFields/NonNullable/多层映射；提供方命名合同与字段 JSDoc 在同步声明中保留。交付时分别报告：模板组件标签悬停（业务职责与剩余框架展开如实说明，不把“查看入口改善”写成“泛型已消除”）、params 类型名与状态/属性悬停（适用数据合同必须直接显示字段清单，包含继承字段；只出现业务名不算完成）、字段悬停（说明来自提供方 JSDoc）、补全候选、定义跳转到达命名合同。证据用真实编辑器（或其同源 Vue 语言服务）在修改前后同位置对比；终端 0 错误、生成 d.ts 截图或手写模拟 tooltip 不能替代。
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
