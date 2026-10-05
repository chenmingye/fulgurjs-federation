# @fulgurjs/federation 文档中心

> 本目录是文档总入口。中文文档在 [docs/zh/](zh/README.md)；英文文档中心在 [docs/en/](en/README.md)（与 zh/ 逐文件镜像）；另有旧版英文参考 [API.en.md](API.en.md) 与 [README.en.md](../README.en.md)。
> 对应插件版本 **6.0.0**（公共入口统一：`/vue`、`/react`、`/runtime`、包根）。配置默认值、公开入口与类型以仓库源码及发布包声明为准。

## 文档结构

```text
docs/
├── README.md                  # 本页：总入口与场景导航
├── zh/                        # 中文文档中心
│   ├── README.md              # 中文目录与推荐阅读路径
│   ├── guide/                 # 使用指南（按场景）
│   ├── reference/             # 参考（配置 / API / CLI / 错误码）
│   ├── troubleshooting/       # 排错（按症状 / 兼容范围）
│   └── migration.md           # 6.0.0 迁移指南
├── en/                        # English documentation center（与 zh/ 逐文件镜像）
│   ├── README.md              # English index and recommended reading paths
│   ├── guide/                 # Guides (by scenario)
│   ├── reference/             # Reference (config / API / CLI / error codes)
│   ├── troubleshooting/       # Troubleshooting (by symptom / compatibility)
│   └── migration.md           # 6.0.0 migration guide
└── maintainers/               # 维护者文档（架构 / 测试 / 发布 / 能力对照）
```

## 按场景找文档（中文）

| 你的场景 | 从这里开始 |
|---|---|
| 新建一个联邦工程 | [快速上手：安装与创建工程](zh/guide/getting-started.md) |
| 已有 Vue/React/纯 TS 项目接入（提供方/消费方/双角色） | [快速上手：已有项目接入](zh/guide/getting-started.md#已有项目接入) |
| 加载远程组件 / 普通模块（remoteComponent、loadRemote、useLoadRemote） | [组件与模块加载](zh/guide/components-and-modules.md) |
| 一批宿主路由对应远程页面（逐页接入） | [远程页面接入](zh/guide/remote-pages.md) |
| 整个子应用嵌入另一框架（Vue↔React 桥接） | [子应用桥接](zh/guide/app-bridge.md) |
| 子应用内部路由与宿主 URL 同步（深链/刷新/前进后退） | [URL 同步](zh/guide/url-sync.md) |
| 共享依赖（singleton / 版本裁决 / shareScope） | [共享依赖](zh/guide/sharing.md) |
| 生产部署（no-cache / SPA 回退 / CORS / 体检） | [部署指南](zh/guide/deployment.md) |
| 想先跑起来看效果（模板与 Demo） | [示例与模板](zh/guide/examples.md) |
| 出错了按现象排查 | [排错目录](zh/troubleshooting/README.md) |
| 从 5.x 升级到 6.0.0 | [6.0.0 迁移指南](zh/migration.md) |

## 参考资料

| 内容 | 文件 |
|---|---|
| 全部插件配置项与默认值（省略/显式值语义） | [配置参考](zh/reference/configuration.md) |
| 全部公共 API（用途/签名/默认值/生命周期/错误边界） | [API 参考](zh/reference/api.md) |
| CLI 全部命令（语法/参数/退出码/示例） | [CLI 参考](zh/reference/cli.md) |
| 48 个错误码总表（现象/原因/修法） | [错误码总表](zh/reference/errors.md) |

## 英文文档

- English documentation center（与 [docs/zh/](zh/README.md) 逐文件镜像，目录与主题一一对应）：[docs/en/README.md](en/README.md)
  - English guides: [Getting started](en/guide/getting-started.md) 起，共 8 篇（[en/guide/](en/README.md#directory)）
  - English reference: [Configuration](en/reference/configuration.md) / [API](en/reference/api.md) / [CLI](en/reference/cli.md) / [Error codes](en/reference/errors.md)
  - English troubleshooting: [by symptom](en/troubleshooting/README.md) / [compatibility](en/troubleshooting/compatibility.md)
  - English migration: [6.0.0 migration guide](en/migration.md)
- Legacy English API reference: [API.en.md](API.en.md)
- Legacy English guide (usage): [README.en.md](../README.en.md)

> 英文 API 手册如与中文 [API 参考](zh/reference/api.md)在 6.0.0 入口路径上存在差异，以中文版与仓库源码为准。

## 维护者文档

- 维护者导航与仓库约定：[maintainers/README.md](maintainers/README.md)
- 架构导读（DESIGN.md 摘要）：[maintainers/architecture.md](maintainers/architecture.md)
- 测试方法（单测 / e2e / fixtures / 门禁）：[maintainers/testing.md](maintainers/testing.md)
- 发布流程（Release → publish.yml → 核验）：[maintainers/releasing.md](maintainers/releasing.md)
- 能力对照与边界：[maintainers/webpack-mf-对照与缺口.md](maintainers/webpack-mf-对照与缺口.md)
- 沙箱边界审计：[maintainers/沙箱边界审计.md](maintainers/沙箱边界审计.md)
- Vite 7/8 兼容矩阵：[maintainers/P5-vite7-8兼容矩阵.md](maintainers/P5-vite7-8兼容矩阵.md)

## 旧文档去向

| 旧位置 | 现位置 |
|---|---|
| `docs/API.md`（中文 API 手册全文） | 内容按 6.0.0 新入口改写，拆入 [zh/reference/api.md](zh/reference/api.md)、[zh/reference/configuration.md](zh/reference/configuration.md)、[zh/reference/errors.md](zh/reference/errors.md) 与 guide 各篇 |
| `docs/迁移指南.md` | 迁移内容并入 [zh/migration.md](zh/migration.md) |
| `docs/webpack-mf-对照与缺口.md` | [maintainers/webpack-mf-对照与缺口.md](maintainers/webpack-mf-对照与缺口.md) |
| `docs/沙箱边界审计.md` | [maintainers/沙箱边界审计.md](maintainers/沙箱边界审计.md) |
| `docs/P5-vite7-8兼容矩阵.md` | [maintainers/P5-vite7-8兼容矩阵.md](maintainers/P5-vite7-8兼容矩阵.md) |

6.0.0 已删除旧入口 `/bridge`、`/bridge/vue`、`/bridge/react`、`/bridge/router/vue`、`/bridge/router/react`，相关功能并入 `/vue` 与 `/react`。旧写法对照与迁移代码示例见[迁移指南](zh/migration.md)。
