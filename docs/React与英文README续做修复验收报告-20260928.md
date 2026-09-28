# React 支持与英文 README 续做修复验收报告（5.1.1，2026-09-28）

> 续做主任务书：`docs/React与英文README续做修复验收任务书-20260928.md`（下称"本文"）；原始功能范围：`docs/React完整支持与英文README实施任务书.md`。
> 最终正式版本：**@fulgurjs/federation@5.1.1**（registry latest），发布提交 **d7102ef + ac48c57（文档/测试收尾）**，tag `v5.1.1`。
> 本报告所有结论基于 registry 正式包 5.1.1 的实测；5.1.0 的历史结果仅作对照，不作为最终结论依据。

## 一、结论

**四类核心缺陷（D01—D04）全部以"先失败回归→修复→通过"闭环；Vite 8 CI 根因闭环且 e2e (8.3.0) 真实通过；正式包 5.1.1 完成 React/Vue fixtures 双环境与 MES dev + 8662 生产验收。** 已知限制 1 项单列（Vite 5.1.x 双 client 覆盖层上游缺陷，详见 §6.4），不冒充通过。

## 二、修复清单（任务书 D01—D08）

| 编号 | 缺陷 | 修复 | 回归 |
|---|---|---|---|
| D01 | React 同实例不随 sessionKey 切换（复核复现 `calls:["A"] rendered:"2:A"`） | `react-adapter.ts`：`RemoteRoot`/`useLoadRemote` 渲染期读取当前登录代次，`RemoteLoader` effect 依赖加入 `sessionKey`——变化即同实例重走加载生命周期；统一 hook 状态契约（首次/spec/选项/会话变化/reload 全部 `data=undefined,error=undefined,loading=true`）；过期尝试不写状态 | `tests/react-session.test.ts` 8 用例：修复前 6 失败→修复后 8/8（A→B 重载、登出回公开态、慢 A 不覆盖 B、同会话去重、模块级 hostPages 缓存、reload 卸载/失败）；浏览器端 `D01 同实例会话切换`（fixtures/host-react SessionLive 常驻探针：anon 空→alice→SPA 保持→bob，onSession 1→2） |
| D02 | tsconfig paths 误判（注释 paths 即触发精确轨抑制 ambient） | `dts.ts` `hostPathsCovers` 重写：`stripJsonc` 语义化 JSONC 解析（无 eval）、extends 链继承、**排除 tsconfig.node.json**、仅 wildcard 键 `<remote>/*` 命中、目标核对（未指向精确目录时跳过 ambient 并输出诊断）；无法解析时按未配置处理（宁可多生成可用声明） | `tests/dts-paths-covers.test.ts` 9 用例（注释/无关 node/exact-only/extends/JSONC/指向别处+诊断/端到端 ambient 生成）；真实 fixture（仅 tsconfig.typecheck.json）实测精确轨生效日志 |
| D03 | 降级后残留失效精确轨转发文件（TS2307） | `writeAnyModules` 同步 `rm -rf <outDir>/<remote>.d/`（仅插件自有命名输出）；paths 指向缺失目标时 TS 跳过映射回退 ambient，不要求用户手删 | `tests/dts-degrade.test.ts`：同一工程精确→降级→恢复三步（真实 generateDevTypes + 真实 TypeScript 程序编译）：步骤 2 断言转发已清理+消费编译通过（修复前 TS2307 复现），步骤 3 断言错误 props 被拒；另 `dts:false` 只停不删用例 |
| D04 | prod 重试 helper 按调用次数 cache-bust（第二次成功加载被改写 retry URL → 模块重复求值） | `virtual.ts` `genProdRetryHelper` 重写为失败驱动 per-URL 状态机（`{u,n}`：成功原 URL 返回；失败 `n++` 后下一次用 `fulgurjs_retry=N`，已带 query 用 `&`）；`index.ts` 产物改写为 `__fgR(url)` 直调（首版 5.1.1 曾误嵌回 `import(__fgR(url))` → `import(Promise)` = "[object Promise]" 全 prod 挂，CI 捕获后修正） | `tests/prod-retry-helper.test.ts` 7 用例：黑盒（真实 data: URL 动态 import 身份保持/跨 URL 隔离）+ 白盒（请求 URL 序列：成功零 bust、失败 good→retry1→retry2→稳定、&拼接、别名同 chunk 同实例）+ 集成（包装后产物代码真实加载守卫调用形态） |
| D05 | Vite 8 CI 失败（UNLOADABLE_DEPENDENCY: fulgurjs-stub:react） | 根因：Vite 8 rolldown 优化器对 `esbuildOptions.plugins` 只执行 resolve 不执行 load。修复：同时注入 `optimizeDeps.rolldownOptions.plugins`（resolveId 识别裸键与兼容层 namespace 前缀两种虚拟 id、load 产出同款 re-export 桩、门面 URL external、`isEntry` 放行预构建入口）；Vite ≤ 7 不变。本地 Vite 8.3.1 复现一致→修复后 UNLOADABLE 消失、prebundle/facade 200、浏览器跨源全链 ✓ | CI `e2e (8.3.0)`：修复前 X（run 36427116727 等）→ **修复后 ✓（run 36452674591 起连续两轮）** |
| D06 | 测试虚假覆盖/重复统计 | ① Playwright 项目改文件名精确匹配（`(^|\/)dev\.spec\.ts$` 等），`--list` 核对：dev16/fault2/prod9/react-dev12/react-fault5/prod-react6 互斥（此前 Vue 项目重复执行 React 用例）；② R15 改独立负向矩阵（遗漏必填/错误类型/错误回调签名/函数参数，各断言预期诊断标记）+ any 降级走真实生成器+真实 tsc（e2e 脚本内嵌 vitest 门禁）；③ 错误监听前置到 beforeEach；④ R12 双向断言真实导出（sum/ANSWER=42、formatMoney+formatDate）与计算值；⑤ R01 断言范围随探针修正 | e2e 全绿（S6 正式包轮 35+15）；CI 三矩阵连续绿 |
| D07 | 英文 README 为摘要 | `README.en.md` 全量重写（~330 行）：完整 API 台账（runtime 全函数签名含 initSharing/registerShare/registerPlugins/RuntimePlugin 钩子 beforeLoadRemote/afterLoadRemote/onRemoteError/resolveShare、SharedHint 全字段含 packageName、React 适配四 API 精确语义、setup/onSession、AppContext、双轨 dev types、懒加载测量口径、41 码表、边界）——独立可读不依赖中文；npm 包 files 含 README.en.md（build 复制） | 构建 `check-manual-codes`（41 码三方一致）+ tarball 内容核对（README.en.md 在包内） |
| D08 | 可选 peer/版本下界 | pack-smoke 固化断言：vue/react/react-dom 三 peer 均声明且 optional、react 范围 `>=18.0.0 <20`；纯 React consumer（无 vue）与纯 Vue fixtures（无 react）构建/dev 隔离验证；**React 18.0.0 精确下界**：隔离工程（registry 5.1.1 + react@18.0.0）dev 全链（StrictMode+Hooks+协商单例）与 Nginx prod（5298）实测 ✓ | pack-smoke PASS 输出 `peers OK`；react180 工程 dev（5223/5224）+ prod 实测 |

## 三、发布链路（S5）

- 候选推进：`8f55164`（主修复，CI 捕获 D04 wrap 回归）→ `d7102ef`（wrap 修复+集成测试）→ `ac48c57`（vite5 门控）——**三个提交全部包含在 v5.1.1**；`76a02d0`、`7753dc0`（5.1.0 后收尾）亦包含
- CI 终态（run **36456319602**，sha ac48c57，push + workflow_dispatch 双触发）：test ✓ / vite5 ✓（34 过+1 门控跳过）/ e2e 6.4.3 ✓ / 7.3.6 ✓ / **8.3.0 ✓** / prod-e2e ✓ / tarball ✓
- 版本：5.1.1 未占用确认（E404）→ tag `v5.1.1` → GitHub Release → publish run **36456829115** ✓（Trusted Publishing + provenance，sigstore logIndex 2985040989）
- registry 核验：dist-tags latest=**5.1.1**；dist.integrity `sha512-DwilIK+DxNfqeK6GqSEaPyITKwgMgWz3ssWkfKsOjh3/...` 与 publish 日志一致；tarball `federation-5.1.1.tgz`

## 四、S6 正式包 React/Vue 验收（registry 5.1.1，fixtures 精确安装）

| 套件 | 结果 | 说明 |
|---|---|---|
| dev + fault（Vue 16+2、React 12+5） | **35/35** | R01—R12 + N01—N05 覆盖（含新 D01 浏览器用例） |
| prod + prod-react（9+6） | **15/15** | 隔离 NGINX（9001），R01—R10 生产形态 |
| React 19.3.0 | ✓ | fixtures 主矩阵即 19.3.0 |
| React 18.0.0 精确下界 | ✓ | react180 隔离工程（5223/5224 dev + 5298 Nginx prod）StrictMode+Hooks+单例 |
| examples registry 消费 | ✓ | react-host/react-remote 均 5.1.1，dev 联调（按钮/utils/首页/参数页） |

## 五、S7 MES dev + 8662 生产（registry 5.1.1）

- 三应用精确安装（package.json -E 5.1.1 + lockfile 版本核对一致）
- **dev 矩阵 19/19**：BPM 13 页（todo 10 行/done 10/my 10/copy 空表/create 空表/model 26 行直访/form 4/category 3/user-group 1/listener 1/expression 7/instance 10/task 10，行数与控件逐页断言）+ lowcode 6 页；`fulgurjs:error` 0 次；首访依赖发现按 DEV-010 预热流程处理（已知暂态）
- 会话：桥接 sessionKey 按 token 指纹生成（bridge.ts），`clearAppContext` + `clearSessionState` 链路实测；完整 A→B UI 流在 React fixture 浏览器用例覆盖（D01）
- **串行生产构建**：bpm exit0 → lowcode exit0 → admin exit0 + postBuild exit0
- **8662**：备份 `*.bak-pre-5.1.1-20260928` → 部署 → 本地/线上 md5 三目录全 match → **生产 Playwright 矩阵 6/6 PASS**：dashboard / todo(10 行真实数据) / 模型参数页（真实 id `46661a36-…` 修改页）/ 生产深链强刷（修改流程页恢复正确）/ lowcode 表单设计（25 控件）/ 懒加载分域计量（flowable 754 / lowcode 77 / main 300 chunk 请求，全量网络响应分母）
- `check-pages --site http://localhost:8662 --require-verified`：**26 条页面 error 0 / 无法验证 0 全一致 ✓**（https 推导不可达系 8662 仅监听 http，如实记录）
- 8662 保持运行、8085/nginx 未动、备份保留；SVN 副本为 rsync 拷贝（无 .svn 元数据，物理上无法提交），`svn status` 0 项

## 六、已知限制与单列事项

1. **Vite 5.1.x 双 client 覆盖层（上游缺陷，非本轮回归）**：宿主与远程同为 5.1.x 时，第二个 vite client 的 ErrorOverlay 类因元素名被宿主注册而未注册，`new ErrorOverlay()` 抛 IllegalConstructor；vite ≥6 client 经注册表构造无此问题。基线 `8e41de5` 即失败（run 36404620886，同签名）。vite5 兼容 job 按真实版本探测门控跳过该 1 项（其余 34 项过），**报告为跳过而非通过**。模块加载/共享/会话等其余能力在 5.1.4 全部通过。
2. **e2e nginx 模板 remoteEntry 为 immutable 长缓存**：CI 每 job 全新浏览器上下文不受影响；本地持久 profile 重部署后需硬刷新（产品文档口径：真实部署 remoteEntry 必须 no-cache，8662 现网配置即 no-cache）。
3. **本轮不做**（原任务书边界）：SSR/RSC/Next.js/React Native/跨框架组件互渲染/React KeepAlive；无新增。

## 七、最终状态

| 项 | 状态 |
|---|---|
| registry | latest=5.1.1（integrity 核对一致，provenance 已签） |
| Git | master=ac48c57 已推送；工作区仅剩用户原有文档改动与本轮验证用 fixture registry 版本（未提交，属本地工作状态） |
| 8662 | **留站运行 5.1.1**，备份 `*.bak-pre-5.1.1-20260928` 三目录 + 历史备份全保留 |
| 8085 / 常驻 nginx | 未动、运行中 |
| MES dev server（8773/4529/4669） | 验收后已清理 |
| fixtures 隔离 NGINX / React prod 实例 | 已清理（prod-setup --stop / nginx.pid kill） |
| SVN | 零写入（无 .svn 元数据的本地拷贝 + 无任何 svn 写命令） |
| 证据 | `testbed/runs/20260928-react-en/checkpoint.md`（全程日志）+ `work/`（隔离工程与脚本）+ `evidence/`（截图）|
