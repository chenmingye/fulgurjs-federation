# Vite 兼容性验证

支持范围见[兼容性说明](../zh/troubleshooting/compatibility.md)。实际必跑版本和任务以 [.github/workflows/ci.yml](../../.github/workflows/ci.yml) 为准。CI 成功表示对应提交的指定场景通过，不代表任意应用图都不会出错。

## 验证范围

- dev：Vue/React 的远程模块、组件、共享实例、桥接与 URL 同步。
- production：正式构建后的浏览器挂载、资源和 CSS 加载、深链刷新、共享身份与故障恢复。
- Vite 8：同步共享门面、循环依赖、provider 闭包与合法 manualChunks 配置；不能用构建通过代替页面行为。
- React：renderer 与 React 版本匹配；隔离作用域及运行时实例身份按合同验证。

## 执行方法

1. 按 CONTRIBUTING 和 CI 的安装顺序构建插件，安装 fixture/e2e。
2. 使用 CI 声明的版本组合，在隔离目录安装和执行对应 Playwright 项目。
3. 生产场景使用隔离静态服务与本轮构建产物，核对实际 remote 地址和 base。
4. 保留原始日志、命令、版本、退出码、行为断言与失败现场；只报告本次执行范围。
5. 只停止本轮进程，不覆盖其他人的 fixture 改动。

构建 CSS 链的针对性回归见 `packages/plugin/tests/build-manifest-css.test.ts`，它不替代完整浏览器验收。
