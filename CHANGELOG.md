# 当前发布说明

## 6.8.3

- 类型声明文件（.d.ts/.d.mts/.d.cts）不参与运行时导入改写，避免业务 glob 引入声明时损坏类型语法。补三类声明文件回归。
- 公开模板与功能演示依赖精确升级到正式基础包 6.8.2，锁文件同步；修正必填 props 与 BLD-003 的当前文档说明。
- 生产故障验收先安装拦截再加载入口，并断言实际请求失败及同页恢复。

## 6.8.2

- 修复全局组件与祖先 Provider 的零参数函数组件被误作异步加载器的问题：声明了 displayName、props 或 emits 的函数保留静态组件身份及库标记；真正的零参数 loader 保持惰性加载和失败恢复。
- 修正中英文 React URL 同步示例与 API 签名，传入 data router 实例；同步组件判定合同与回归验证。

## 6.8.1

- 五模板精确依赖基础版本 6.8.0；showcase Vue 子应用改为返回 `{ app, router }` 自动装配，包内模板与 GitHub 源码同步。更新指南入口与 AI 接手规则。
- 非法工厂返回字符串/数字时保持明确的 VueApp 合同错误，避免 `in` 运算产生 TypeError；补负向回归。

## 6.8.0

- Vue `defineBridgeApp` 工厂支持直接返回 `{ app, router }`（或 Promise），在声明 routing 的桥接入口自动校验通道、等待初始路由、安装、挂载和释放连接。业务插件与守卫在工厂返回前准备完成，无需手写接线与 dispose。公开类型 `VueBridgeAppSetup` 从 `/vue` 导入。
- 修复初始路由失败时连接未释放，以及旧异步工厂在同容器新代次挂起时完成可能覆盖新实例的问题；卸载/取消期间不再安装迟到 router。裸 app 同步工厂保持同步挂载语义。
- 同步中英文桥接与 URL 同步指南、API 和类型参考。

## 6.7.2

- 修正五模板说明中指向目录外的相对文档链接：整目录复制或 CLI 创建后，指南和 API 链接仍可访问；模板内部文件链接保持相对路径。
- 更新包内模板说明资产。模板仍依赖正式基础版本 6.7.0，功能实现与基础包一致，当前交付包为 6.7.2。

## 6.7.1

- 五模板统一依赖正式基础版本 6.7.0，锁文件仅更新联邦包；包内模板与 GitHub 源码同步。按两阶段发布规则，本交付包与 6.7.0 功能实现一致。
- showcase 增加 Vue 当前 app 与 React 工厂上下文的运行模式演示，同页 Vue 宿主保持独立形态；补 BridgeSession 公开类型参考。
- 验证五模板干净冻结安装、12 个应用构建、12 组 dev/生产真实交互，以及 showcase 四应用类型检查。

## 6.7.0

- **签名调整**：`hasBridgeMount(target)` 必须传当前 Vue app 或 Vue/React 桥接工厂上下文。删除页面级全局开关，避免任意子应用的挂载、失败或卸载影响宿主及其他应用。Vue 在 setup 中捕获 `getCurrentInstance()?.appContext.app`；工厂内使用 ctx。标记说明对象的运行形态，不表示容器当前是否挂载。
- React Provider 等待纳入组件加载 timeout，避免远程模块已加载但 Provider 挂起时无限等待。
- Provider loader 失败清除解析缓存，允许同页重试重新加载；成功仍复用，并发消费共享本次加载。补 React 祖先 Context/props 渲染、失败恢复和卸载重挂回归。
- `/vue`、`/react` 分别公开导出 `VueBridgeAppContext`、`ReactBridgeAppContext`，无需使用 Parameters 推导工厂上下文类型。

## 6.6.3

- 五模板升钉 6.6.2（registry 实际解析重建锁文件；逐模板干净副本冻结安装 5/5、全部 12 个子应用构建通过；showcase 干净副本 dev+生产浏览器交互复验：双宿主深链/push/replace/go(-1)，mount 恒 1）；包内模板资产同步（fulgurjs create 模板唯一来源）。运行时与 6.6.2 零差异。

## 6.6.2

- 修复 dev 门面缺陷：`virtual:fulgurjs-api-facade-vue`（开发态 expose 目标的内部代理门面，由消费方插件生成）同样漏掉 6.6.0 的新导出——dev 下子应用 import `installVueBridgeRouter` 等新 API 报 MFU-001（构建产物正常，仅 dev 受影响；showcase 干净副本实测发现）。dev 门面补齐新导出；新增 `./internal/bridge-session.js` 内部导出路径；api-facade-bindings 测试继续守护绑定真实性。

## 6.6.1

- 修复 6.6.0 的入口门面缺陷：`scripts/gen-runtime-entry.mjs` 手维护的再导出清单漏掉新增导出（`installVueBridgeRouter` / `createBridgeSession` / `hasBridgeMount`），导致 6.6.0 的 `/vue`、`/react` 运行时门面中这些 API 为 `undefined`（类型声明齐全，仅运行时缺失）。`bridge-session` 纳入 tsup 多入口构建，门面重新生成；新增「dist 门面真实 import ↔ d.ts 值导出面」一致性测试（client-types），门面漂移在 CI 即失败。

## 6.6.0

围绕「接入成本」新增四个公共能力（均为增量，既有写法继续可用）：

- **`installVueBridgeRouter(app, router, ctx)`**（/vue）：Vue 子应用 URL 同步路由接线一次完成（校验宿主通道 → connect → await ready → `app.use(router)`）。此前的 `connect → await ready → install` 顺序合同与 `if (!ctx?.routing) throw` 守卫在每个项目手写、顺序写反即深链失效；现由插件承担。宿主未提供路由通道统一抛新错误码 **`MFU-034`**（与 MFU-031 互为对偶）；`createReactBridgeRouter` 入口同样校验（替代 React 侧手写守卫）。
- **`hasBridgeMount()`**（/vue、/react）：页面级桥接形态信号——任一桥接契约工厂开始执行前由插件置位，子应用布局/标题策略不再需要自建 mode 标记模块。粘性语义与边界（静态 import 求值期、远程组件不依赖）见 API 参考。
- **`createBridgeSession(options?)`**（/vue）：宿主 sessionKey 生命周期托管（非敏感代次生成、sessionStorage 持久化、renew/clear、嵌套宿主 storageKey）。存储不可用退化为纯内存，不抛错。React 宿主自行管理（无实测需求，暂不提供）。
- **`setup.pageProviders`**（setup 模块可选具名导出）：提供方一处声明祖先 Provider 数组（组件或零参 loader），消费方 `remoteComponent`/`createHostPages`（Vue 与 React）渲染该远程组件时自动按 外→内 包裹——多个暴露页不再逐页手写 AppProvider 包装链。与 `globalComponents`（消费方注册表）互补、不可互相替代；手动 `loadRemote`/`useLoadRemote` 不自动应用。导出非数组 → MFU-011。

gzip 门禁随契约增量上调（CHANGELOG 口径）：runtime 10496→10752B（pageProviders 交付，实测 10597B）；react-adapter 4096→4224B（Provider 捕获/解析/包裹，实测 4130B）；bridge-router 4352→4736B（react 侧 chunk 首次携带 MFU-034 文案，实测 4590B / vue 侧 3676B）。

## 6.5.12

- 提供方首次编译时保留宿主已有的类型快照，避免暂时未就绪被误判为关闭类型、删除补全；未就绪仍不能算严格类型验收通过。

- 清理误提交的临时类型配置；模板复制与 npm 模板同步排除临时编译配置和日志，避免把本机路径带入下载模板。

## 6.5.11

- 修复 dev 下后置自动导入绕过共享协商的问题：自动导入参与最终改写，避免重复 Vue 运行时导致远程组件热更新失效；新增插件前后两种顺序的真实 Vite 回归。
- 类型生成忽略自身临时配置和下载的声明，停止自触发循环；关闭 dev server 时移除监听和定时器。
- Vue 声明生成使用每次独立的临时配置，避免同进程重启、并发生成时相互删除文件；完成或中止后自动清理。

## 6.5.10

- 五个模板升钉 6.5.9 并以 registry 实际解析重建锁文件（逐模板冻结安装 + 全部 12 个子应用构建验证）；包内模板资产同步（fulgurjs create 模板唯一来源）。运行时与 6.5.9 零差异。

## 6.5.9

- 桥接挂载容器默认占满宿主挂载区（width/height 100%）：子应用普遍按 height:100% 组织布局，无尺寸的裸容器会让高度链塌陷为 0，内容被滚动容器定位到视口外（真实业务"发起流程"页实测复现）。需要异形尺寸时在容器外层自行包一层约束；zh/en 文档同步。

## 6.5.8

- 类型缓存识别宿主声明转换格式变化，同远程 revision 也能自动刷新已修正的声明。
- 宿主声明移除嵌套 ambient 上下文中的重复 declare 修饰符，严格声明检查不再报 TS1038。

- 修复远程声明闭包遗漏自定义路径别名、公共 import 类型引用及 Vue SFC 脚本依赖的问题。
- Vue 声明编译器的全局配置错误和异常退出不能被当作无关业务错误忽略。
- 核验 Vue 桥接内联 appProps 检查，清理错误限制说明与绕过检查的推荐写法。
- Vue SFC 路径解析与 rootDir 纳入真实声明依赖，增加官方 vue-tsc 正反编译回归。

- 修正声明目录对文件扩展名排除规则的判断，保留显式 types 白名单并解析包内声明子路径。
- 声明 bundle 排除纯样式副作用导入，缺失代码依赖仍严格失败。
- 类型 bundle 保留手写本地 .d.ts 依赖，避免缺失声明资源。
- 五个可独立复制的模板同步正式包与生成类型，补齐同源类型合同的中英文说明。
