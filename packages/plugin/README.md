# @fulgur/federation

Vite 模块联邦插件：**dev 与 prod 双引擎、完整 Webpack MF 语义、零妥协**。

- **dev**：双 dev-server 协作——remote 端中间件直出容器入口与 manifest，shared 走绑定门面（TLA 集中、消费方同步求值）
- **prod**：构建期改写——expose 自动拆 chunk、稳定文件名 remoteEntry（CDN 长缓存友好）、manifest 供 preload
- **shared 语义**：singleton / requiredVersion / strictVersion / shareScope / eager / 版本协商与"已加载优先"，与 webpack MF 对齐
- **依赖兼容**：UMD-only / CJS-only 依赖（element-plus、avue 等）dev 预构建外部化 + build 期 require 垫片，双运行时免疫
- **错误体系**：MFU-001~008 错误码 + 可执行修复建议，故障显式报错、零静默兜底
- **边界**：仅 Vue 3；不支持 SSR；Vite ≥ 5.1（实测至 8.x）；Node ≥ 18

## 安装

```bash
npm i -D @fulgur/federation
```

## 快速开始

**远程（remote）**

```ts
// vite.config.ts
import { federation } from '@fulgur/federation'

export default {
  plugins: [
    federation({
      name: 'mes-lowcode',
      filename: 'unifed-remoteEntry.js',
      exposes: {
        './InfoCard': './src/unifed-exposes/InfoCard.vue',
      },
      shared: { vue: { singleton: true, requiredVersion: '^3.4.0' } },
    }),
  ],
}
```

**宿主（host）**

```ts
federation({
  name: 'host',
  remotes: {
    // 单地址：dev 自动拼 @unifed-entry.js，prod 用 filename
    lowcode: 'http://localhost:4664/lowcode',
  },
  shared: { vue: { singleton: true } },
})
```

**消费**

```ts
// 静态导入（构建期改写为门面协商）
import { loadRemote } from 'virtual:unifed-runtime'
const Mod = await loadRemote('lowcode/./InfoCard')
```

## 错误码

| 码 | 语义 |
|----|------|
| MFU-001 | 远程/模块加载失败（附可达性·URL·CORS 三步排查建议） |
| MFU-002 | 远程自报名与注册名不一致 |
| MFU-003 | shared 版本不满足 strictVersion |
| MFU-004 | share 不可用（无提供方且无本地回退） |
| MFU-005 | 容器重复 init 冲突 |
| MFU-006 | 模块未暴露 |
| MFU-007 | preload 失败 |
| MFU-008 | remote 未注册 |

## License

MIT © chenmingye (Jason)
