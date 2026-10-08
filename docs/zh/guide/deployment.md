# 部署指南

> 远程与宿主各自构建、各自部署（同域子目录或异域均可）。部署面只有四件事要做对：base 对齐、入口 no-cache、SPA 回退不吞 JS、CORS 放行。全部可用 `fulgurjs doctor` 机器体检。

## 产物与端点

`pnpm build` / `npm run build` 后，远程应用 dist 里比普通 Vite 产物多两个固定文件：

| 环境 | 路径 | 说明 |
|---|---|---|
| dev | `/<base>/@fulgurjs-entry.js` | 远程容器入口（插件中间件直出，自包含） |
| dev | `/<base>/@fulgurjs-manifest.json` | dev manifest（宿主 dts / preloadRemote 消费） |
| prod | `/<base>/fulgurjs-remoteEntry.js` | 固定文件名容器入口（内容每次构建变——**必须 no-cache**） |
| prod | `/<base>/fulgurjs-manifest.json` | expose chunk/CSS 清单（preloadRemote 消费，**no-cache**） |

宿主在 `fulgurjs.config.ts` 里用 prod 地址指向它们：

```ts
remotes: {
  'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' },
}
```

单地址字符串 `'http://localhost:5101'` 形态下：dev 自动拼 `/@fulgurjs-entry.js`，prod 自动拼 filename；以 `.js` 结尾的地址 prod 原样使用。

## base 对齐

远程部署在 `/remote-a/` 时：

- 远程 Vite 构建的 `base` 也应为 `/remote-a/`（保证其 chunk 引用路径正确）；
- 宿主 `prod` 配置为 `/remote-a`（或完整 URL）；
- `--base` 与路由的分层见[URL 同步 · Vite base 与路由分层](url-sync.md#vite-base-与路由分层子目录部署)：宿主 Router base 承担部署前缀，桥接 `basePath` 只表达业务路径。

## 缓存：no-cache 是硬规则

`fulgurjs-remoteEntry.js`、`fulgurjs-manifest.json`、`index.html` 三者**必须 `Cache-Control: no-cache`**（协商缓存），严禁 immutable/max-age 长缓存：

- 入口文件名固定而内容每次构建变化——浏览器长期持有旧 remoteEntry 后，重部署清理旧 hash chunk 即全站 404（`fulgurjs doctor` 对 immutable 直接 FAIL）；
- 带内容哈希的 `assets/*` chunk 才配长缓存（`immutable, max-age=31536000`）。

NGINX 片段（含 SPA 回退，见下）：

```nginx
# 远程子目录（每应用一份；宿主同理但无 remoteEntry）
location /remote-a/ {
  # 联邦入口与清单：协商缓存
  location = /remote-a/fulgurjs-remoteEntry.js { add_header Cache-Control "no-cache"; }
  location = /remote-a/fulgurjs-manifest.json  { add_header Cache-Control "no-cache"; }
  location = /remote-a/index.html              { add_header Cache-Control "no-cache"; }

  # 带哈希的 chunk 长缓存
  location /remote-a/assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }

  # SPA 回退：只兜 HTML 导航，不吞 JS
  try_files $uri $uri/ /remote-a/index.html;
}
```

## SPA 回退：绝不把 JS 请求兜成 HTML

深链回退只应作用于**页面导航**。回退过宽时，缺失的 JS chunk/入口被兜成 200 + HTML，浏览器把它当模块解析直接报错，而且 `doctor` 与浏览器状态码都看不出缺失（200 假象）。要求：

- 为静态资源目录加精确匹配（`try_files $uri =404` 或独立 location）；
- remoteEntry 用精确 location 原样返回 JS；
- 资源 404 就老实 404。

## CORS

跨源联邦（异域部署、dev 双端口）要求远程端点带 `Access-Control-Allow-Origin`：

- dev 由插件配置 `devCorsOrigins` 控制（默认 `'*'`；allowlist 数组形态见[配置参考](../reference/configuration.md#devcorsorigins--devfsroot-三态示例)）；用户显式配置的 `server.cors` 永远优先；
- **prod 的 CORS 由部署层（NGINX 等）负责**，dev 配置不会自动修改生产服务器：

```nginx
location /remote-a/fulgurjs-remoteEntry.js {
  add_header Access-Control-Allow-Origin "*";
  add_header Cache-Control "no-cache";
}
```

同源部署（全部挂在同一站点子目录下）不需要 CORS 头。

## 发布期的版本混搭

发布窗口内，旧页面仍持有旧 remoteEntry，会继续引用旧 hash chunk。避免「旧页面突然失效」：

- 保留仍被旧产物引用的 chunk（部署不清空整个 assets 目录，或保留 N 个历史版本）；
- 或采用原子切换 + no-cache 入口，让旧页面在下一次导航后自然收敛到新版本；
- 完整部署用 `rsync -a --delete dist/<app>/`（整目录一致），避免部分文件新部分文件旧。

## 部署体检：`fulgurjs doctor`

```bash
# 基本用法：--base 是站点根；--apps 是站点根下的部署子目录（远程部署在 /remote-a/ 就写 remote-a）
npx @fulgurjs/federation doctor --base https://your-site --apps my-app,remote-a

# 纯宿主（无远程入口）：跳过 remoteEntry 检查
npx @fulgurjs/federation doctor --base https://your-site --apps my-app --no-entry

# 自定义入口文件名 / 合法关闭 manifest / 无页面子目录
npx @fulgurjs/federation doctor --base https://your-site --apps remote-a --entry my-entry.js --no-manifest --no-html

# dev 容器体检 / CI JSON / 抽样数
npx @fulgurjs/federation doctor --base http://localhost:5174 --apps remote-a --dev --json --chunk-sample 32
```

检查项（每项三段式 PASS/FAIL/WARN + 现象/根因/修法）：

- remoteEntry / manifest / index.html 的 200、`Cache-Control=no-cache`（immutable 即 FAIL）、内容形态（返回 HTML 而非 JS 即 FAIL——回退吞 JS 的典型症状）；
- CORS 头存在性（跨源部署必需；同源 WARN 提示）；
- hash chunk 抽样可达（引用面 = index.html 首屏引用 > manifest exposes 文件 > remoteEntry imports，含一跳传递 import；默认抽样 16，`--chunk-sample N` 调整）；
- 各应用 manifest.shared 同键版本对比（skew 预演，WARN）；
- `--dev` 检查 `@fulgurjs-entry.js` 直出 JS 与 dev manifest。

退出码：**有 FAIL 即 1**，可直接做 CI 门禁。`--apps` 必填不猜默认：条目可为 `'.'`（部署在站点根）或完整 URL（检查多 origin）。语法/参数全集见 [CLI 参考](../reference/cli.md#fulgurjs-doctor)。

## 部署核对清单

- [ ] 远程 Vite `base` 与部署子目录一致
- [ ] 宿主 `remotes[*].prod` 指向正确站点路径/URL
- [ ] remoteEntry / manifest / index.html 均为 no-cache（doctor FAIL 拦截 immutable）
- [ ] 带哈希 assets 长缓存
- [ ] SPA 回退不吞 JS（资源 404 保持 404）
- [ ] 跨源部署时远程端点带 CORS 头
- [ ] 发布窗口保留旧 chunk
- [ ] `npx @fulgurjs/federation doctor --base <URL> --apps <子目录,...>` 零 FAIL
