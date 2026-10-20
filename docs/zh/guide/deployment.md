# 部署指南

> 远程与宿主各自构建、各自部署（同域子目录或异域均可）。部署面只有四件事要做对：base 对齐、入口 no-cache、SPA 回退不吞 JS、CORS 放行。`fulgurjs doctor` 检查这些端点的部分可观测条件；真实页面、会话、完整资源图与业务交互仍须浏览器验收。

## 产物与端点

`pnpm build` / `npm run build` 后，远程应用 dist 默认生成两个联邦固定文件（入口名可由 filename 修改，manifest 可关闭；dts 声明资源另计）：

| 环境 | 路径 | 说明 |
|---|---|---|
| dev | `/<base>/@fulgurjs-entry.js` | 远程容器入口（插件中间件直出，自包含） |
| dev | `/<base>/@fulgurjs-manifest.json` | dev manifest（宿主类型同步 / preloadRemote 消费；dts 启用时附 types 定位） |
| prod | `/<base>/fulgurjs-remoteEntry.js` | 固定文件名容器入口（内容每次构建变——**必须 no-cache**） |
| prod | `/<base>/fulgurjs-manifest.json` | expose chunk/CSS 清单（preloadRemote 消费，**no-cache**） |

宿主在 `fulgurjs.config.ts` 里用 prod 地址指向它们：

```ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'host',
  remotes: {
    'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' },
  }
} satisfies FederationOptions
```

单地址字符串的目录 URL 在 dev 拼接 @fulgurjs-entry.js、prod 拼接配置的 filename；完整 .js URL（可带 query）在两种环境都原样使用。远程自定义 filename 时，消费方推荐写完整 prod 入口 URL，不能假定会自动读到远程构建配置。

## 构建目标与已有 TLA 包装插件

Rollup 构建链路中的异步共享门面可能保留顶层 `await`；按入门配置选择支持它的实际浏览器目标（通常 `build.target: 'es2022'`），不要仅修改 tsconfig 的 target。Vite 的构建目标由 Vite 配置决定，见 [Vite 构建指南](https://vite.dev/guide/build.html)。

已有项目若另装 TLA 降级包装插件，先核实它与当前 Vite、联邦产物的组合。遇到包装器解析错误，保留首错，在相同依赖与配置下做仅启停包装器的对照；需要旧浏览器时必须验证完整降级链，不能以提高 target 冒充兼容。

`build.sourcemap` 无须因接入联邦而关闭。大型工程遇到构建爆栈时，先保留报错插件、chunk 与堆栈，分别比较 `true`（独立 map）、`'inline'` 和 `false`，据结果定位问题；临时关闭只能记为规避及其调试影响，不能据此断言是业务问题或宣布插件根因已修复。

## base 对齐

远程部署在 `/remote-a/` 时：

- 远程 Vite 构建的 `base` 也应为 `/remote-a/`（保证其 chunk 引用路径正确）；
- 宿主 `prod` 配置为 `/remote-a`（或完整 URL）；
- `--base` 与路由的分层见[URL 同步 · Vite base 与路由分层](url-sync.md#vite-base-与路由分层子目录部署)：宿主 Router base 承担部署前缀，桥接 `basePath` 只表达业务路径。

## 缓存：no-cache 是硬规则

`fulgurjs-remoteEntry.js`、`fulgurjs-manifest.json`、`index.html` 三者**必须 `Cache-Control: no-cache`**（协商缓存），严禁 immutable/max-age 长缓存：

- 入口文件名固定而内容每次构建变化——浏览器长期持有旧 remoteEntry 后，重部署清理旧 hash chunk 即全站 404（`fulgurjs doctor` 对 immutable 直接 FAIL）；
- 带内容哈希的 `assets/*` chunk 才配长缓存（`immutable, max-age=31536000`）。

NGINX 示例放在已有 `server {}` 内，假定 `root /srv/federation;`，磁盘文件为 `/srv/federation/remote-a/...`；不要同时套用不同的 alias 映射。先用实际目录替换，再执行 `nginx -t`。纯宿主没有 expose/setup 时无需复制 remoteEntry 规则；宿主同时提供组件时仍需保留。

```nginx
root /srv/federation;
location = /remote-a/fulgurjs-remoteEntry.js {
  add_header Cache-Control "no-cache" always;
  try_files $uri =404;
}
location = /remote-a/fulgurjs-manifest.json {
  add_header Cache-Control "no-cache" always;
  try_files $uri =404;
}
location = /remote-a/index.html {
  add_header Cache-Control "no-cache" always;
  try_files $uri =404;
}
# This directory must contain content-hashed assets only.
location ^~ /remote-a/assets/ {
  add_header Cache-Control "public, max-age=31536000, immutable";
  try_files $uri =404;
}
location ~* ^/remote-a/.*\.(?:js|mjs|css|json|map|wasm|woff2?|ttf|png|jpe?g|svg|ico)$ {
  add_header Cache-Control "no-cache" always;
  try_files $uri =404;
}
location /remote-a/ {
  add_header Cache-Control "no-cache" always;
  try_files $uri $uri/ @remote_a_html;
}
location @remote_a_html {
  if ($request_method !~ ^(GET|HEAD)$) { return 404; }
  if ($http_accept !~* "text/html") { return 404; }
  rewrite ^ /remote-a/index.html last;
}
```

## SPA 回退：绝不把 JS 请求兜成 HTML

深链回退只应作用于**页面导航**。回退过宽时，缺失的 JS chunk/入口被兜成 200 + HTML，浏览器把它当模块解析直接报错，仅看 HTTP 200 会误判；doctor 的内容形态检查可识别它抽查到的错误响应。要求：

- 为静态资源目录加精确匹配（`try_files $uri =404` 或独立 location）；
- remoteEntry 用精确 location 原样返回 JS；
- 资源 404 就老实 404。

## CORS

跨源联邦（异域部署、dev 双端口）要求远程端点带 `Access-Control-Allow-Origin`：

- dev 由插件配置 `devCorsOrigins` 控制（默认 `'*'`；allowlist 数组形态见[配置参考](../reference/configuration.md#devcorsorigins-三态示例)）；显式 server.cors 只覆盖 Vite 侧源码模块，插件 entry/manifest/types 端点仍使用 devCorsOrigins，两处 allowlist 应对齐；
- **prod 的 CORS 由部署层（NGINX 等）负责**，dev 配置不会自动修改生产服务器：

```nginx
# Add these headers inside EVERY location serving cross-origin resources:
# remoteEntry, manifest, JS/CSS chunks, and dts resources when synchronized.
add_header Access-Control-Allow-Origin "https://host.example.com" always;
add_header Vary "Origin" always;
```

不能只给 remoteEntry 加 CORS：它导入的 JS、CSS 及浏览器拉取的清单也需可跨源读取。上面是要合并到各资源 location 的头，不是另建重复 location。NGINX 子 location 声明自己的 `add_header` 时通常不继承父层整组头，应逐项确认实际响应；多来源 allowlist 用部署层按 Origin 校验/反射。只有全部内容确实公开且不使用跨源凭据时才使用 `*`，不能和凭据请求混用。

同源部署（全部挂在同一站点子目录下）不需要 CORS 头。

## 发布期的版本混搭

发布窗口内，旧页面仍持有旧 remoteEntry，会继续引用旧 hash chunk。避免「旧页面突然失效」：

1. 先上传新构建所需的全部带哈希资源，保留旧入口仍可能引用的旧资源；然后切换清单、入口和 HTML，避免新入口先引用尚未上传的文件。
2. 原子目录切换只能避免服务器文件混搭，**不能清除已打开页面的 ESM 模块缓存**。旧 chunk 必须在原 URL 继续可达，或采用带版本的资源路径并保留对应版本。
3. 不要对当前服务目录直接运行会删除旧 chunk 的 `rsync --delete`。可以同步到未上线的独立发布目录，再按上述资源保留策略切换；最后按明确的保留期/仍在使用的版本回收旧资源。
4. no-cache 表示后续请求重新验证缓存，不代表强制刷新已打开页面。需要用户更新时由产品显式提示，不自动刷新正在编辑的页面。

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
- CORS 头提示（缺失时 WARN；工具不能代替真实浏览器验证目标 Origin、凭据策略或全部传递资源）；
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
