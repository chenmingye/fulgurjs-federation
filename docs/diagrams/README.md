# 系统架构图 / Architecture figures

使用说明：[中文指南](../zh/guide/architecture.md) · [English guide](../en/guide/architecture.md)。

三张图分别解释总体架构、模块加载、完整应用生命周期。中英文共享 `render.mjs` 的几何布局，文字分别维护；SVG 和离线 HTML 均由此生成。PNG 是同一 SVG 的浅色、2 倍分辨率导出，供演示、复制和不支持 SVG 的阅读器使用。不要直接修改生成文件，也不要把 AI 生成的图当作实现依据。

The three figures explain the system overview, module loading and full-app lifecycle. Both languages share geometry in `render.mjs`, with separate labels. SVG/offline HTML are generated from that source; PNGs are light-theme 2× exports for presentations and viewers without SVG support. Edit the source rather than generated artifacts, and verify architecture claims against the implementation.

## 更新与检查 / Update and verify

在仓库根执行 / Run from the repository root:

```bash
# Node.js built-ins only; regenerate six SVGs and two offline HTML files.
node docs/diagrams/render.mjs

# Export six PNGs using the repository's existing e2e Playwright installation.
node docs/diagrams/export-png.mjs

# Fail if SVG/HTML artifacts differ from the source.
node docs/diagrams/render.mjs --check
```

PNG 导出需要先按 [e2e 安装说明](../maintainers/testing.md)准备 Playwright 和 Chromium；不向应用或插件添加依赖。PNG 的字体/像素可能随操作系统或 Chromium 版本变化，`--check` 只检查确定性的 SVG/HTML。SVG/HTML 不依赖网络、外部字体或 JavaScript 库；HTML 内置明暗切换、全屏和单图 SVG 下载。GitHub 展示 Markdown/SVG，HTML 需下载到本机打开。

PNG export requires the existing [e2e Playwright/Chromium setup](../maintainers/testing.md), without adding plugin/application dependencies. Fonts/pixels can vary by OS or Chromium version, so `--check` compares deterministic SVG/HTML only. SVG/HTML have no network, external-font or library dependencies. Offline HTML includes theme switching, fullscreen and individual SVG downloads. GitHub displays Markdown/SVG; download HTML to open it locally.

修改后的检查 / After a change:

1. 对照当前源码检查正常、跳过和失败分支，保持两种语言含义一致；同步两份指南的说明。Check normal, skipped and error branches against current source; update both guides consistently.
2. 重新生成全部产物，检查每张图的文字与连线，确认无截断、遮挡或误导性的穿框连线。Regenerate all artifacts; inspect every figure for clipping, overlaps and misleading paths through nodes.
3. 打开两份 HTML，检查明暗主题、窄窗口滚动、全屏及下载；检查文档相对链接。Open both HTML files and verify themes, narrow-window scrolling, fullscreen, downloads and relative documentation links.
4. 将图源、SVG、PNG、HTML 和说明一起提交。不要混入本机测试截图、原始 AI 报告、私有路径或业务信息。Commit source, SVG/PNG, HTML and explanatory docs together; exclude local test evidence, raw AI reports and private application data.
