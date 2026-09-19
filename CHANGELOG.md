# Changelog

## 0.4.2（2026-09-19）

### 修复（npm 发布面）

- **npm 包内 README 与仓库 README 是两个文件**——包内是 4.7kB 旧版（无 API 参考）。现在构建时自动以仓库根 README（含完整 API 参考）为准，npm 页面与 GitHub 展示一致。
- npm 包自带完整文档：docs/manual.html（使用手册）、迁移指南、webpack 对照、沙箱审计、兼容矩阵、CHANGELOG、DESIGN、examples 起步样例——包内 README 的相对链接在 npm 上不再 404。

## 0.4.1（2026-09-19）

「让插件自动处理，而不是让用户记住规则」——两条使用规则自动化，使用面大幅简化。

### 变更（规则自动化）

- **任何文件都可以直接 `import { ... } from 'virtual:fulgur-runtime'`**（原 DEV-008 规则自动化）：
  exposes 目标文件（远程页面）里的静态导入，dev 下由插件自动改写为惰性单例委托模块
  （求值期零副作用、调用期转发页面级运行时单例）。用户不再需要知道
  「宿主/远程页面取运行时的不同姿势」，0.4.0 的手工 globalThis 写法已无需使用。
- **插件升级后重启 dev server 即可**（原 DEV-009 规则自动化）：dev server 启动时插件自动
  检测版本变化并清除本应用 node_modules/.vite 预构建缓存，无需手工 rm -rf。

### 修复

- runtime 两个存量 TS 断言错误（as Error → as FulgurError）与 fallback 源码契约断言同步。

## 0.4.0（2026-09-18）

开箱即用批次（A→E）全部落地；W7 发布链按用户指示顺延（未发布 npm）。

### 新增
- **CLI（主包内置 bin `fulgur`）**
  - `fulgur init`：起步模板（带注释的 `fulgur.config.ts`：宿主/远程/页面路由表/部署形态，
    单文件可入库可复跑）+ 配置校验（CFG 三段式报错）+ 输出可直接粘贴的样板
    （各应用 federation() vite 块、NGINX no-cache 站点模板、通用接入核对清单）；
    **项目无关**——不内置任何具体项目的模板、锚点或文件改写
  - `fulgur doctor`：部署面体检——remoteEntry/manifest/index.html 的 200/no-cache/JS 形态、
    CORS、chunk 抽样可达（含 index.html 引用与一跳下钻、200-HTML 回退伪装识别）、
    版本协商 skew 预演、`--dev` 模式端口/容器入口探测；`--json` 供 CI
- **W4 跨应用全局配置协商**：runtime 新增 `provideFulgurAppConfig` / `getFulgurAppConfig`
  （页面级单例、浅合并、globalThis 镜像）——EP locale/size 类跨副本配置的机制化收编
- **W5 诊断补码**：CFG-007（remotes 对象形式误用 name@ 前缀）、CFG-008（shared 非法组合）、
  DEV-010（dev 冷启动预构建窗口提示）；BLD-003 必填 props 扫描器（按实测降级为手册核对项）
- **W8 验证基建**：持久 profile 重部署用例（复刻 immutable 缓存坑）、full-verify 失败自动归因、
  func-results 联动归档

### 修复
- **U-7 裸门面**：`genSharedFacade` 改枚举式再导出——rolldown 产物下 `export *`+TLA 展开致
  命名绑定全 undefined（provider 注册后 loadShare 拿到的命名空间只有 default）；
  生成物级核对 494 个导出名全部进入赋值回调；bare 导入 prod 实测通过

### 变更
- **插件去项目化（2026-09-19 定调）**：移除 init 中曾内置的具体项目集成模板/锚点/补丁
  （历史实现见 git 历史）；`fulgur init` 重写为纯通用脚手架，配置 schema 同步精简。
  插件为所有项目服务，不做任何单一项目的形状。
- runtime gzip 5212 B（红线 ≤5250 内）；单测 148/148；错误码 30 个全量文档对齐
