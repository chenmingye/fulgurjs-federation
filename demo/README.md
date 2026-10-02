# Demo 展示中心

`@fulgurjs/federation` 全量真实示例与展示中心。**所有工程均从 npm registry 安装正式包**（不用 workspace link），依赖版本在各自 `package.json` 锁定。

## 一键操作

```bash
# 环境核查（Node ≥18、端口占用、工程就绪度、registry latest）
node demo/scripts/check-env.mjs

# 启动展示中心门户（http://localhost:5390 ，页面上可单场景启动/停止）
node demo/portal/server.mjs

# 按场景启动（远程先起，宿主后起；自动 npm install）
node demo/scripts/start-demo.mjs --scenario bridge-router --scenario errors
node demo/scripts/start-demo.mjs --all

# 停止（只停本任务拉起的进程，按 demo/.run/demo-pids.json 登记）
node demo/scripts/stop-demo.mjs --all

# 一键构建
node demo/scripts/build-demo.mjs --all
```

## 栏目与场景（详见门户页）

| 栏目 | 场景 | 目录 | 端口 |
|---|---|---|---|
| 基础联邦 | Vue / React 基础联邦 | `examples/vue`、`examples/react` | 5213/5214、5203/5204 |
| 应用桥接 | Vue↔React 双向 | `examples/bridge` | 5303/5314、5313/5304 |
| 应用桥接 | 同框架完整子应用（Vue套Vue、React套React） | `demo/same-frame` | 5323-5326 |
| URL 同步 | 双向桥接 URL 同步 | `demo/bridge-router` | 5333-5336 |
| 共享依赖 | singleton/版本协商/hooks/实例身份 | `demo/shared` | 5343/5344/5345 |
| 页面接入 | 页面清单/类型/CLI | `demo/pages-cli` | 5363/5364 |
| 错误恢复 | 隔离故障注入与恢复 | `demo/errors` | 5352/5353 |
| 企业项目 | Jeecg 自嵌套/跨框架/三层 | `demo/jeecg` | 5371-5374 + 数据服务 5380 |
| 门户 | 展示中心 | `demo/portal` | 5390 |

## 约定

- 接入写法以 `examples/` 为唯一口径；`demo/` 场景工程复用同一套写法。
- 每个示例固定 `@fulgurjs/federation` 精确版本 + lockfile；复现使用 `npm ci`。
- 演示用数据服务（Jeecg）只服务本地演示，不冒充真实后端联调。
