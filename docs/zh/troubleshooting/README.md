# 按症状找问题

> 先对症状，再跳对应错误码与修法。所有错误码的完整三段式见[错误码总表](../reference/errors.md)；支持范围与版本边界见[兼容性](compatibility.md)。

## 远程加载失败

| 症状 | 先检查 | 深入 |
|---|---|---|
| dev 下首次加载报 manifest 拉取失败（`DEV-001`） | 远程 dev server 是否启动；`remotes[*].dev` 地址与端口 | dev 模式体检：`npx fulgurjs doctor --base http://localhost:<远程端口> --apps <子目录> --dev` |
| dev 提示端口无监听（`DEV-005`） | 远程是否改过端口而宿主未同步 | [改端口四处清单](../guide/examples.md#改端口的固定清单) |
| prod 下加载失败（`MFU-001`） | remoteEntry 是否 200、是否 JS 形态、CORS、no-cache | `npx fulgurjs doctor --base <站点> --apps <子目录,...>`；[部署指南](../guide/deployment.md) |
| 报自报名不一致（`MFU-002`） | remotes 键与容器自报名 | 字符串 `'自报名@url'` 写法显式重命名 |
| 报未知远程（`MFU-008`） | spec 前缀与 remotes 键拼写 | 动态远程先 `registerRemote` |
| 报模块未被 exposes（`MFU-006`） | `远程名/exposes 键` 是否对应 | `npx fulgurjs check-pages`（逐页接入宿主）批量核对 |
| 加载到了但没有任何导出（`MFU-009`） | expose 目标文件的导出 | 补导出 |
| 重试/熔断行为 | `timeout`/`retries`/`fallback`/`breaker` 配置 | [配置参考 · remotes](../reference/configuration.md#remotes-的四种形态) |
| 静态依赖曾失败，服务恢复后仍失败 | 浏览器缓存了依赖 URL 的失败记录 | 默认错误占位的「刷新页面重试」（保留当前地址整页刷新）；[已知边界](../reference/api.md#vue-版本fulgurjsfederationvue-1) |

## 白屏 / 页面渲染异常

| 症状 | 先检查 | 深入 |
|---|---|---|
| dev 白屏、`Cannot destructure property 'node'` 类报错 | UMD/CJS 依赖被移出预构建 | 放回 `optimizeDeps.include`（`DEV-004`） |
| 页面渲染回旧逻辑 / 门面 404（`DEV-009`） | `.vite` 缓存漂移（常发于插件升级后） | `rm -rf node_modules/.vite` + 重启 dev server + 换浏览器 profile |
| 首轮 30~60s 瞬时 504/"ce"/页面重载（`DEV-010`） | Vite 冷启动预构建窗口（瞬态非故障） | 先预热页面再做断言 |
| 双 Vue/双 React 崩溃（Invalid hook call / 'ce'） | shared 缺 `singleton: true`；或多版本未隔离 | [共享依赖](../guide/sharing.md)；React 18/19 分 scope（`MFU-010`） |
| 宿主/远程插件版本不一致（`DEV-006`） | 各应用 @fulgurjs/federation 版本 | 统一版本 |
| 远程页面独立直开白屏（`CC-002`） | 页面被绕过宿主直接访问 | 经宿主联邦加载 |
| JS 请求被兜成 HTML（doctor FAIL） | nginx 深链回退过宽 | 为静态资源加精确匹配；[部署指南 · SPA 回退](../guide/deployment.md#spa-回退绝不把-js-请求兜成-html) |
| 保活页每次进出都重挂 / 状态丢失 | keepAlive include 名与解析后组件名不一致（Vue 3.5 已修复） | 升级到 5.9.3+；核对 keepAliveNames 用法 |

## 共享版本冲突

| 症状 | 先检查 | 深入 |
|---|---|---|
| `MFU-003` strictVersion 抛错 | 协商版本 vs `requiredVersion` | 对齐依赖版本，或显式放宽（确认兼容） |
| `MFU-010` 单例版本不满足告警 | 最终选中版本与某消费方要求 | 统一版本；确认告警可接受；不能接受就分 shareScope |
| `MFU-004` 共享缺失且无 fallback | 提供方是否声明该 shared 键；加载顺序 | 自定义入口先 `await loadShare` 再导入消费者 |
| 双版本组件库 CSS 互相覆盖 | `:root` 变量后加载覆盖先加载 | 主流版本变量一致则无感；升级时留意；[沙箱边界审计](../../maintainers/沙箱边界审计.md) |
| React 18/19 同页需求 | singleton 不能让 18/19 兼容 | 分 shareScope 隔离整组依赖及消费者；[版本隔离示例](../guide/sharing.md#sharecope分组隔离react-1819-同页隔离) |
| doctor 报 shared 版本 skew WARN | 各应用 manifest.shared 同键版本对比 | 统一依赖版本；singleton 场景确认告警可接受 |

## URL 前缀 / 路由同步

| 症状 | 先检查 | 深入 |
|---|---|---|
| 详情导航把子应用卸载 | 宿主路由没有后缀匹配接住子路径 | 宿主路由声明 `/approval/:pathMatch(.*)*`（Vue）或 `/approval/*`（React）；[URL 同步](../guide/url-sync.md) |
| 刷新后子应用回到首页 | 子应用未声明 `{ routing: true }`（`MFU-031`） | 两端都配置：宿主传 `routing`，子应用声明协议并接线 |
| 拼出 `/erp/erp/...` 双前缀 | 部署 base 与 bridge basePath 分层混淆 | Vite base/Router base 承担部署前缀，`basePath` 只写业务路径 |
| 守卫拒绝后 URL 变了/子应用跳了 | 取消语义未生效 | 端口观察真实 NavigationFailure/blocker；`canNavigate` 只是提前拒绝 |
| `MFU-030` basePath 非法/前缀重叠 | basePath 空/根/带 query·hash·通配；同页重叠 | 静态绝对路径；同页实例前缀不重叠 |
| `MFU-032` 非法导航 | 子应用导航越界自身前缀 | 子应用只导航自己 basePath 内的位置 |
| `MFU-033` 同步失败/重定向环 | 守卫异常或子应用路由循环重定向 | 修守卫；排查子应用路由定义 |
| query/hash 参数丢失 | 适配器二次编解码 | 位置三段全等是内置契约；自定义导航端口不要二次 decode/encode |

## 缓存 / 部署后旧版本

| 症状 | 先检查 | 深入 |
|---|---|---|
| 重部署后旧 hash chunk 404、全站失败 | remoteEntry 被配了 immutable 长缓存 | 三文件（remoteEntry/manifest/index.html）改 `no-cache`；doctor 对 immutable FAIL |
| 偶发部分资源 404 | 发布窗口清了旧 chunk | 保留仍被旧页面引用的 chunk；`rsync -a --delete` 整目录一致部署 |
| 资源 200 但内容是 HTML | 回退吞 JS（状态码假象） | doctor 的 chunk 形态检查会拦；修 nginx 回退规则 |
| pnpm 装 tarball 后 `Cannot find module '@fulgurjs/federation'` | 软链断链 | 重新安装并验证目录可达 |

## 类型获取失败 / IDE 问题

| 症状 | 先检查 | 深入 |
|---|---|---|
| `remote-a/X` 导入无类型提示 | `dts` 是否被关闭；生成目录是否在 tsconfig include 内 | `dts` 默认开；生成物在 `src/fulgurjs/types/`（无 src 布局 `.fulgurjs/types`） |
| 远程源码不在本机，类型是 any | `devFsRoot: false` 或跨机器 | 这是诚实降级：可解析但无源码补全；恢复可达后重启宿主 dev 重新生成 |
| ts(2307) 找不到 `@fulgurjs/federation/*` | IDE TS 服务缓存旧包 | `Restart TS Server`（⌘⇧P）或重开窗口 |
| VSCode 打开 `src/fulgurjs/types/*.d.ts` 大片红波浪线 | Volar 以推断项目检查工程外文件 | 仅编辑器显示问题（命令行检查与构建 0 错误）；根治用 `dts: { mode: 'shim' }`；[IDE 说明](../reference/api.md#ide-提示srcfulgurjs-目录的红波浪线) |
| React 精确类型不生效 | 宿主 tsconfig 未配 paths | 按 `_paths.d.ts` 说明配置 `paths`；[React 的 dev 类型](../reference/api.md#react-的-dev-类型双轨) |

## 桥接 / 会话

| 症状 | 先检查 | 深入 |
|---|---|---|
| `MFU-015` 契约非法 | `./bridge` 是否用 `defineBridgeApp` 默认导出 | [子应用桥接](../guide/app-bridge.md#子应用侧definebridgeapp) |
| `MFU-016` 挂载/卸载失败 | `details.phase`；子应用原始错误 | mount 失败先清理再抛；unmount 抛错容器被持久封锁，整页刷新恢复 |
| `MFU-017` 会话不一致 | sessionKey 三态用法；同页多实例代次 | [会话触发表](../guide/app-bridge.md#会话sessionkey-与-appcontext) |
| `MFU-013` 缺 sessionKey | 远程声明了 onSession 但宿主没给登录代次 | 宿主 provide 非敏感 sessionKey（禁用 token） |
| 换 props 子应用不更新 | appProps 是挂载快照（by design） | 稳定回调 / 共享 store / 换 key 重挂；[快照语义](../guide/app-bridge.md#approps-快照语义重要) |
| 登出后子应用残留 | `sessionKey→null` 未传或缓存的私有页面未移除 | null 立即卸载；宿主 `clearAppContext()` 并移除缓存页 |
| 子应用卸载后定时器/监听重复 | 页面全局副作用未清理 | [卸载清理清单](../migration.md#页面卸载清理清单) |

## 通用排查工具

```bash
npx fulgurjs explain          # 配置期：角色/remotes/exposes/shared/加载链
npx fulgurjs check-pages      # 逐页接入宿主：页面表 ↔ 远程 exposes
npx fulgurjs doctor --base <URL> --apps <子目录,...>   # 部署面体检（CI 可用退出码 1）
```

浏览器侧：`window.__FULGURJS_INFO__`（各 remote 状态/耗时/setup 阶段）、`window.__FULGURJS_SCOPE__`（shared 协商）、`window.__FULGURJS_APP_CONFIG__`（AppContext 镜像）、`fulgurjs:error` 事件。
