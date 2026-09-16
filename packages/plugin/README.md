# @fulgur/federation

Vite 模块联邦插件：**dev 与 prod 双引擎、完整 Webpack MF 语义、零妥协**。

- **dev**：双 dev-server 协作——remote 端中间件直出容器入口与 manifest，shared 走绑定门面（TLA 集中、消费方同步求值）
- **prod**：构建期改写——expose 自动拆 chunk、稳定文件名 remoteEntry（CDN 长缓存友好）、manifest 供 preload
- **shared 语义**：singleton / requiredVersion / strictVersion / shareScope / eager / 版本协商与"已加载优先"，与 webpack MF 对齐
- **UMD / CJS-only 依赖开箱即用**：element-plus、avue 等 UMD/CJS 依赖直接预构建——dev 自动外部化 shared 键到协商门面，build 自动垫片 CJS require，双运行时免疫
- **容错**：重试 / 熔断 / 超时内置；`loadRemote(spec, { retries, fallbackModule })` 对齐 webpack MF 2.0 errorLoadRemote（失败显式发出错误事件，绝不静默）
- **错误体系**：MFU-001~008 错误码 + 三段式可执行修复建议
- **边界**：仅 Vue 3；不支持 SSR；Vite ≥ 5.1（实测至 8.x）；Node ≥ 18；浏览器 Chrome 108+

## 安装

```bash
pnpm add -D @fulgur/federation
```

## 快速开始

**Remote（提供方）**

```ts
// vite.config.ts
import { federation } from '@fulgur/federation'

export default {
  plugins: [
    federation({
      name: 'mes-lowcode',
      filename: 'fulgur-remoteEntry.js',
      exposes: { './InfoCard': './src/exposes/InfoCard.vue' },
      shared: { vue: { singleton: true, requiredVersion: '^3.4.0' } },
    }),
  ],
}
```

**Host（消费方）**

```ts
federation({
  name: 'host',
  remotes: {
    // 单地址：dev 自动拼 @fulgur-entry.js，prod 用 filename
    lowcode: 'http://localhost:4664/lowcode',
  },
  shared: { vue: { singleton: true } },
})
```

**消费**

```ts
import { loadRemote, registerRemote, preloadRemote } from 'virtual:fulgur-runtime'

const Mod = await loadRemote('lowcode/./InfoCard')
// 远程可能部署不稳定？显式 fallback + 单次重试覆盖
const Panel = await loadRemote('shop/Panel', {
  retries: 3,
  fallbackModule: () => import('./PanelFallback.vue'),
})
```

## ⚠️ 首次使用避坑指南（真实迁移项目踩坑实录）

1. **插件升级后务必「清缓存 + 重启 dev server」**：`rm -rf node_modules/.vite` 后重启。vite 对预构建产物下发一年 immutable 缓存，旧内容不会被自动失效。
2. **pnpm 项目装完 tarball 检查软链**：`pnpm add xxx.tgz` 偶发断链（整目录拷贝过的项目尤甚）。装完验证 `node_modules/@fulgur/federation` 真实可达，断链则重新 add。
3. **UMD/CJS-only 依赖放 `optimizeDeps.include`，不要 exclude**：插件已自动注入 shared 键外部化（dev 防双 vue + build 防 CJS 内联），正常预构建即可。移出预构建会让 CJS 文件被裸服务（dev 白屏）。
4. **不要给 shared 依赖加别名/手工改写**：`dayjs → dayjs/esm` 之类的别名会让构建期 CJS `require` 撞上双重 interop（典型症状 `xxx.default.extend is not a function`）。
5. **dev 冷启动先预热再判断**：首轮访问联邦页面会触发依赖再预构建（504 Outdated Optimize Dep 瞬态），访问一轮所有页面即稳定。
6. **显式降级用 `fallbackModule`**：远程不稳定时 `loadRemote(spec, { retries, fallbackModule })` 返回 fallback 模块；错误事件仍显式发出——不传则照旧抛错（本插件无静默兜底路径）。
7. **构建目标 es2022+**：协商门面的 top-level await 需要；插件未显式配置时会自动提升并告警。
8. **多版本组件库 CSS**：同挂 `:root` 变量后加载覆盖先加载，主流版本一致则无感。

完整文档（webpack 逐项对照、迁移指南、沙箱边界实测、验收清单）见[仓库](https://github.com/chenmingye/fulgur-federation)。

## 错误码

| 码 | 语义 |
|----|------|
| MFU-001 | remoteEntry 加载失败（附可达性·URL·CORS 三步排查建议） |
| MFU-002 | 远程自报名与注册名不一致 |
| MFU-003 | shared 版本不满足 strictVersion |
| MFU-004 | share 不可用（无提供方且无本地回退） |
| MFU-005 | 容器重复 init 冲突 |
| MFU-006 | 模块未暴露 |
| MFU-007 | preload 失败 |
| MFU-008 | remote 未注册 |

## License

MIT © chenmingye (Jason)
