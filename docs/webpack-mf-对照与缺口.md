# webpack Module Federation 逐项对照与缺口清单（P1-3）

> 基准：webpack 5 Module Federation（ModuleFederationPlugin）语义；日期 2026-09-15；版本 @fulgur/federation 0.2.0

## 一、已实现（与 webpack MF 对齐）

| 能力 | webpack MF | @fulgur/federation | 备注 |
|------|-----------|--------------------|------|
| exposes 远程模块 | ✅ | ✅ | 自动拆 chunk；dev 动态容器入口 |
| remotes 消费 | ✅ | ✅ | 单地址 dev/prod 自动切换；`name@url` 键重命名；promise remote（运行时 registerRemote） |
| shared 协商 | ✅ | ✅ | shareScope/版本排序/已加载优先 singleton；fallback 本地副本 |
| singleton / requiredVersion / strictVersion / eager | ✅ | ✅ | eager 以静态导入形式进初始 chunk |
| shareScope 多作用域 | ✅ | ✅ | |
| 容器协议 init/shareScopeMap/get | ✅ | ✅ | 对齐 webpack 容器接口 |
| 双向联邦/嵌套 | ✅ | ✅ | 跨源模块副本共享同一注册表（globalThis 单例） |
| 错误码体系 | ❌（裸错误） | ✅ MFU-001~008 + 三段式修复建议 | 超出 webpack |
| dev 双 server 协作（无打包 dev 容器） | ❌（webpack dev 也需构建） | ✅ | 超出 webpack |
| UMD/CJS-only 依赖 shared 化 | ⚠️（需自己处理） | ✅ 预构建外部化 + build require 垫片 | 超出 webpack |
| 稳定 remoteEntry 文件名 + manifest + preload | ⚠️ 部分 | ✅ | preloadRemote API |

## 二、明确不支持（缺口清单）

| 能力 | 状态 | 说明 |
|------|------|------|
| SSR | ❌ | 仅警告并禁用钩子；无 SSR 渲染计划 |
| React/其他框架适配 | ❌ | 首发仅 Vue 3（shared 门面按 Vue 3 语义生成） |
| 浏览器 DevTools 扩展 | ❌ | 提供 `window.__FULGUR_SCOPE__ / __FULGUR_INFO__` 调试面 |
| share 的 `import: false`（仅提供不消费） | ✅ import:false 已支持 | 与 webpack `eager`/share 语义对齐 |
| 运行时动态 remote 版本浮动（promise remote 的 shared 注入） | ⚠️ | promise remote 可注册，但其 shared 需自带 |
| Node.js 环境（SSR/构建外运行时） | ❌ | 仅浏览器 |

## 三、迁移指南速查（详见 docs/迁移指南.md）

- webpack `remotes: 'app2@http://.../remoteEntry.js'` → `remotes: { app2: 'http://.../dist' }`（去 manifest/entry 后缀，dev/prod 自动拼）
- `exposes` 相同；`shared` 相同字段；`eager` 相同
- `loadRemote('app2/./Button')` → `loadRemote('app2/./Button')`（runtime API 同名）
- iframe/qiankun 微前端 → exposes 页面 + 宿主路由表（见 testbed 迁移案例）
