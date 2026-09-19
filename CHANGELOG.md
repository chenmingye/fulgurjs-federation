# Changelog

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
