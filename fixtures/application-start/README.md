# 统一装配源码演示（维护者验收用）

Vue 与 React 各自只有一份 `src/application` 装配：独立 main 调用 `start`，远程 expose 直接指向同一文件。首页/关于页与内嵌自己的子应用均使用真实路由；没有健康检查占位页。

本目录使用本地插件 `link:`，不是给用户复制的正式包模板。本轮只实现，未安装、构建或验收；由验收 AI 构建插件后分别安装两个工程。最终公开模板只能使用已发布的正式包。

| 工程 | dev 端口 | 生产 base | 插件相关手写文件 |
|---|---|---|---|
| vue | 5481 | /application-vue/ | fulgurjs.config.ts、src/application.ts；main 只接线 |
| react | 5482 | /application-react/ | fulgurjs.config.ts、src/application.tsx；main 只接线 |

Vue 的 counter.ts/Home.vue 是普通业务状态演示：两个 app 共享 Pinia **库**，各自创建 Pinia **实例**；`bindStoreToApp` 固定到实际实例，异步回调不依赖全局 activePinia。React 使用原生组件状态。

验收重点：独立首页、关于页刷新；进入 `/child` 后实际子路由；返回/重进；同时创建两个容器；取消等待中的 start；错误工厂/卸载失败封锁；旧 handle 不得卸载新代次；必填 props 类型提示；只导入组件 API 时不得强制安装可选 router。

类型检查通过 tsconfig 的本机 peer 路径使用本 fixture 实际安装的 Vite/Vue 类型，避免 link SDK 自带开发依赖形成第二套类型身份；这不是远程类型 paths，也不要求 registry 模板添加这些映射。workspace 只登记本工程并明确批准 esbuild 构建脚本，锁文件供冻结安装复现。
