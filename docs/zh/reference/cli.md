# CLI 参考：`fulgurjs`

> 全部命令纯本地执行（`explain`/`check-pages`/`doctor` 中只有 doctor 与 check-pages 会按参数访问站点 URL），不读取 token/环境秘密。单项目形态：`fulgurjs.config.ts` 在应用根目录，命令默认读 `./fulgurjs.config.ts`。
>
> 入口选择口诀（应用代码导入）：Vue 应用 `@fulgurjs/federation/vue` ｜ React 应用 `/react` ｜ 框架无关模块 `/runtime` ｜ Vite 配置用包根（`federation(options)`）。

## 命令总表

| 命令 | 用途 | 退出码 0 条件 |
|---|---|---|
| `fulgurjs create` | 新项目：从完整模板创建可运行联邦工程 | 创建+安装成功 |
| `fulgurjs init` | 已有项目：生成配置起步模板 / 校验配置 | 模板写出或校验通过 |
| `fulgurjs explain` | 解释本应用有效联邦形态与加载链 | 解释成功 |
| `fulgurjs types` | 远程类型：提供方验证声明生成 / 宿主同步声明（CI 在 typecheck 前运行） | 生成+同步+发现检查全部通过 |
| `fulgurjs check-pages` | 宿主页面表 ↔ 远程 manifest 契约核对 | 无确定性错误且已验证 |
| `fulgurjs doctor` | 部署/配置层体检 | 无 FAIL |
| `fulgurjs port` | 模板工程端口统一变更 | 计划生成或写入成功 |
| `fulgurjs --help` | 帮助 | — |

退出码约定：`0` 成功；`1` 命令语义内的确定性失败（check-pages 核对失败、doctor 有 FAIL、types 的生成/同步/发现失败——可作 CI 断言）；`2` 用法错误/异常（缺参、配置非法、目标不可写等）。

---

## `fulgurjs create`

完整工程创建向导（**新项目入口**）。从已安装 npm 包内复制一个完整模板工程（workspace + 子应用 + 锁文件 + 启动脚本）并默认执行 `pnpm install --frozen-lockfile`。

### 语法

```bash
fulgurjs create [--list]                                  # 交互选择模板（TTY）
fulgurjs create <模板> [--dir <路径>] [--no-install] [--force] [--json]
```

### 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `<模板>` | TTY 交互选择；非 TTY 缺省即报错 | `vue-vue` / `react-react` / `vue-host-react-remote` / `react-host-vue-remote` / `showcase` |
| `--dir <路径>` | 当前目录下与模板同名 | 目标目录 |
| `--no-install` | 默认执行安装 | 跳过 `pnpm install --frozen-lockfile` |
| `--force` | 非空目录拒绝写入 | 复用非空目录：只补缺失文件，同名冲突逐项列出并**保留你的版本**（绝不改写/删除已有内容） |
| `--json` | 人类可读输出 | stdout 仅输出结果 JSON，进度与安装日志走 stderr |
| `--list` | — | 列出模板清单后退出 |

### 副作用与校验

- 写入目标目录（模板文件复制），默认另执行 pnpm 安装；
- 创建前按模板 `engines.node` 校验 Node（≥ 20.19.0 不满足即失败，**未写入任何文件**）；安装前预检 pnpm（`corepack enable` 或 `npm i -g pnpm` 修法）；
- 复制后校验关键文件齐全（`package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`scripts/dev.mjs`、`scripts/dev.config.json`）；
- 复制排除 `node_modules`/`dist`/`.vite`/`.run`/`*.log`；
- 不做应用名称/端口改写（改端口的四处清单见[示例与模板](../guide/examples.md#改端口的固定清单)）。

### 退出码

`0` 成功；`2` 失败（模板未知 / 目标路径是文件 / 非空目录未加 --force / 环境校验失败 / 复制中断 / 安装失败）。复制中途失败与安装失败时**已生成工程保留**供排查。

### 示例

```bash
# 成功：创建并安装
$ npx @fulgurjs/federation create vue-vue --dir my-federation
[fulgurjs:create] 已创建完整工程 /path/my-federation（模板 vue-vue，插件依赖 6.1.8）
后续步骤：
  cd "/path/my-federation"
  pnpm dev                # 按启动顺序拉起全部应用，失败会整组退出并说明原因
访问入口（远程先于宿主就绪）：
  http://localhost:5213/    vue-remote
  http://localhost:5214/    vue-host
...

# 失败：非空目录
$ npx @fulgurjs/federation create vue-vue --dir existing
[fulgurjs:create] 目标目录非空，拒绝覆盖：/path/existing
  根因：静默合并可能掩盖与你已有文件的冲突。
  修法：换一个目录（--dir），或加 --force 复用目录（只补缺失文件；同名冲突逐项列出并保留你的版本，绝不改写）
（退出码 2）
```

---

## `fulgurjs init`

已有项目：在应用根生成**单项目** `fulgurjs.config.ts` 起步模板（最小有效配置），或校验已有配置并输出接入块。**只生成配置起步模板**——不生成完整工程（新项目用 `create`）、不生成桥/路由/启动器/NGINX 文件、不改写任何项目文件。

### 语法

```bash
fulgurjs init [--out <路径>] [--framework vue|react] [--role consumer|provider|dual] [--force]
fulgurjs init --config <path>
```

### 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--out <路径>` | `./fulgurjs.config.ts` | 输出路径 |
| `--framework vue\|react` | 从 package.json 依赖判断 | 两框架并存或都没有时不猜：TTY 交互询问；非 TTY 报错要求显式指定（退出码 2） |
| `--role` | `dual` | `consumer` 纯消费方（生成 remotes 示例 + hostPages 注释）/ `provider` 纯提供方（生成 exposes 示例）/ `dual` 双角色（两者都生成） |
| `--force` | 已存在拒绝覆盖 | 覆盖已存在的模板 |
| `--config <path>` | — | 校验模式：加载并校验配置（CFG 三段式报错）+ 输出 `federation(fulgurjsConfig)` 接入块与按角色的接入核对清单（纯打印，不改写文件） |

### 副作用

- 模板模式：写出一个文件（目标路径）；已存在且未 `--force` 时拒绝（退出码 2）；
- `--config` 模式：零写入，纯打印。

### 退出码

`0` 成功；`2` 用法错误（未知框架/角色、非 TTY 无法判断框架、目标已存在、配置校验失败）。

### 示例

```bash
# 成功：React 消费方起步配置
$ npx @fulgurjs/federation init --framework react --role consumer
[fulgurjs:init] 已生成 React 纯消费方起步模板 fulgurjs.config.ts
后续步骤：
  1. 编辑 fulgurjs.config.ts：填入容器名/remotes/shared（默认导出直接是 federation() 选项）
  2. vite.config.ts 接入（仅两行联邦相关代码）：
       import federation from '@fulgurjs/federation'
       import fulgurjsConfig from './fulgurjs.config'
       // plugins: [ ...原有插件, federation(fulgurjsConfig) ]
  3. npx @fulgurjs/federation explain
  4. 部署后：npx @fulgurjs/federation doctor --base <URL> --apps <部署子目录>
...

# 失败：非 TTY 无法判断框架
$ npx @fulgurjs/federation init
[fulgurjs:init] 无法从 package.json 判断框架（vue/react 依赖缺失或并存）。
  修法：显式指定 fulgurjs init --framework vue|react（--role consumer|provider|dual 可选，默认 dual）
（退出码 2）
```

---

## `fulgurjs types`

远程类型的一个入口命令：按当前 `fulgurjs.config.ts` 自动识别角色（可同时是提供方与宿主——先生成（纯本地，不等待任何远程在线）再同步，无互等死锁）。

### 语法

```bash
fulgurjs types [--config <path>] [--mode dev|prod] [--check]
```

### 行为

| 角色 | 行为 | 失败时 |
|---|---|---|
| 提供方（有公开 exposes） | 本地验证声明 bundle 生成（真实工具链：TS/TSX 用 TypeScript，含 `.vue` 用 vue-tsc） | TYP-001 诊断 + **非零退出**（构建不中断页面产物，这里是严格门禁） |
| 宿主（有 remotes） | 按 `--mode`（默认 `dev`，读 remotes 的 dev 地址；`prod` 读 prod 地址）拉取远程 manifest → 校验 → 下载声明 → 生成 ambient 声明与类型注册表 → 原子写入 `dts.dir`（默认 `src/fulgurjs/types/`） | 网络/校验/写入失败按状态明确报告并**非零退出**；远程未提供类型（TYP-004）同样非零——严格类型验收要求更新提供方 |
| 收尾（有类型工作） | 校验生成目录被应用 tsconfig 覆盖（TYP-006 最小修法）+ 外部类型依赖在宿主可解析（TYP-005 安装指引） | 未覆盖/缺失 → **非零退出** |

`--check`：只核对本地缓存与账本记录的代次（不联网，**不代表远程线上最新已核实**）。

### 示例

```bash
# CI（typecheck 前）：
npx @fulgurjs/federation types && npx vue-tsc --noEmit   # 或 tsc --noEmit

# 本地核对已同步状态（不联网）：
npx @fulgurjs/federation types --check

# 对部署后的远程同步（读 remotes 的 prod 地址）：
npx @fulgurjs/federation types --mode prod
```

---

## `fulgurjs explain`

配置解释器：**纯本地、无网络、不读 token/环境秘密**。解释本应用有效联邦形态与加载链。

### 语法

```bash
fulgurjs explain [--config <path>] [--json]
```

### 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--config <path>` | `./fulgurjs.config.ts` | 配置文件路径 |
| `--json` | 人类可读 | 输出 JSON（供 CI） |

### 输出内容

- 应用角色（**按实际 federation 选项判定**——配 `remotes` 即消费、配 `exposes`/`setup` 即提供，两者均有=双角色）；
- 有效 remotes（dev/prod 地址）、公开 exposes、内部 setup、shared、页面 spec 映射与数据来源、`devSharedSelf` 最终值及来源、加载链；
- **桥接完备性 WARN**（启发式提示，不产生错误码）：exposes 含 `./bridge` 的子应用本框架键须 `singleton: true`（React 子应用需 react+react-dom 双键）；shared 同时含 vue 与 react 的桥接宿主须三键全 `singleton: true`。

### 退出码

`0` 成功；`2` 配置加载/校验失败。传已废弃的 `--app` 报中文迁移错误（退出码 2）。

### 示例

```bash
$ npx @fulgurjs/federation explain
[fulgurjs:explain] demo-host（宿主+远程（双角色），单项目配置，目录 /path/demo-host）
  消费远程 remote-a → dev http://localhost:5174/remote-a / prod /remote-a
  exposes（1）：./api
  ...
```

---

## `fulgurjs check-pages`

页面契约核对：宿主页面表（`hostPages` 具名导出）↔ 远程 manifest exposes。**逐页接入的宿主运行**；未配置 `hostPages` 的工程明确提示不适用，不产出伪核对。

### 语法

```bash
fulgurjs check-pages [--config <path>] [--site <URL>]
                     [--manifest <remote>=<路径|URL>]... [--require-verified] [--json]
```

### 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--config <path>` | `./fulgurjs.config.ts` | 配置文件路径 |
| `--site <URL>` | 无 | 站点地址；按消费方 prod 地址推导远程 manifest |
| `--manifest <remote>=<路径\|URL>` | 无，可多次 | 显式指定每个远程的 manifest 来源（文件路径或 URL） |
| `--require-verified` | 关闭 | CI 严格模式：无法验证也非零退出（避免 0 条核对显示通过） |
| `--json` | 人类可读 | 输出 JSON（供 CI） |

manifest 来源优先级：**`--manifest`（可多次、文件路径或 URL）> `--site`/消费方 prod 地址推导**。显式来源失败**不回退**（无本地 dist 兜底），输出每个 remote 的实际命中来源（防止旧本地 dist 冒充线上核对）。

### 副作用与输出

零写入。报告：未知 remote、映射到未消费远程、缺失 expose、路由冲突（R1–R5）；远程不可达报「无法验证」。

### 退出码

`0` 无确定性错误且已验证；`1` 确定性错误（核对失败）；`--require-verified` 时无法验证也非零；`2` 配置/用法异常。

### 示例

```bash
# 成功
$ npx @fulgurjs/federation check-pages --site http://your-site
[fulgurjs:check-pages] remote-a：manifest 来源 https://your-site/remote-a/fulgurjs-manifest.json
  页面 /remote-a/home → pages/remote-a/home  ✓
...
（退出码 0）

# 失败：缺失 expose（退出码 1）
[fulgurjs:check-pages] remote-a：expose pages/remote-a/missing 在 manifest 中不存在
  现象：... 根因：... 修法：...

# 未配置 hostPages
[fulgurjs:check-pages] 本配置未导出 hostPages（未使用逐页接入），check-pages 不适用
```

---

## `fulgurjs doctor`

部署/配置层自动体检。检查 `<base>/<app>/` 下的 remoteEntry/manifest/index.html 的 200/no-cache/JS 形态、CORS、chunk 抽样可达、版本 skew 预演。

### 语法

```bash
fulgurjs doctor --base <URL> --apps <a,b,c> [--entry <文件名>] [--no-entry]
                [--no-manifest] [--no-html] [--dev] [--json] [--chunk-sample N]
```

### 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--base <URL>` | **必填** | 站点根地址，如 `http://your-site` |
| `--apps <a,b,c>` | **必填，不猜默认** | 站点根下的**部署子目录**（远程部署在 `/remote-a/` 就写 `remote-a`，不是容器名）；`'.'`=站点根；条目可为完整 URL 检查多 origin |
| `--entry <文件名>` | `fulgurjs-remoteEntry.js` | 自定义远程入口文件名（自定义 `filename` 的部署用） |
| `--no-entry` | 关闭 | 纯宿主/无远程入口部署：跳过 remoteEntry 检查（不静默猜，也不误报缺失） |
| `--no-manifest` | 关闭 | 合法关闭 manifest 的部署：跳过 manifest 检查 |
| `--no-html` | 关闭 | 无站点页面（纯远程入口子目录等）：跳过 index.html 检查 |
| `--dev` | prod 口径 | 检查 dev 容器入口（`@fulgurjs-entry.js` 直出 JS）；dev 模式不做 no-cache 检查 |
| `--chunk-sample N` | `16` | remoteEntry/manifest/index.html 引用链的 chunk 抽样上限 |
| `--json` | 人类可读 | 输出 JSON（CI 断言） |

### 检查项（每项三段式 PASS/FAIL/WARN + 现象/根因/修法）

- remoteEntry / manifest / index.html 的 200、`Cache-Control` no-cache（**immutable 即 FAIL**）、内容形态（返回 HTML 而非 JS 即 FAIL——深链回退吞 JS 的症状）；
- remoteEntry CORS（`Access-Control-Allow-Origin`，跨源联邦必需）；
- manifest 契约校验（schemaVersion 支持/字段完整性）；
- hash chunk 抽样可达（引用面 = index.html 首屏引用 > manifest exposes 文件 > remoteEntry imports，含一跳传递 import；GET 查形态区分回退掩盖）；
- 各应用 manifest.shared 同键版本对比（skew 预演 WARN）。

### 副作用

零写入，只发 HTTP 请求（超时 8s/请求）。

### 退出码

`0` 无 FAIL；`1` 有 FAIL（可直接做 CI 门禁）；`2` 缺 `--base`/`--apps` 用法错误。

### 示例

```bash
# 成功（无 FAIL）
$ npx @fulgurjs/federation doctor --base http://your-site --apps my-app,remote-a
[fulgurjs:doctor] PASS [remote-a] fulgurjs-remoteEntry.js — 200, Cache-Control: no-cache, JS 形态
...
[fulgurjs:doctor] 汇总：18 PASS / 1 WARN / 0 FAIL
（退出码 0）

# 失败：immutable 缓存（退出码 1）
[fulgurjs:doctor] FAIL [remote-a] fulgurjs-remoteEntry.js
  现象：fulgurjs-remoteEntry.js 的 Cache-Control=public, max-age=31536000, immutable：...
  根因：文件名固定而内容每次构建变化——浏览器会长期持有旧版本，重部署后旧 hash chunk 被清理即全 404
  修法：nginx 改为 Cache-Control "no-cache"（协商缓存）；带 hash 的 assets 才配长缓存

# 用法错误（退出码 2）
$ npx @fulgurjs/federation doctor --base http://your-site
[fulgurjs:doctor] 缺少 --apps <子目录,...>——doctor 不猜默认应用名。
  修法：--apps 传站点根下的部署子目录（...部署在站点根写 "."；多 origin 直接写完整 URL）...
```

---

## `fulgurjs port`

模板工程的端口统一变更。默认**只预览**（`--write` 才写入）。

### 语法

```bash
fulgurjs port <应用> <新端口> [--write]
```

### 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `<应用>` | 必填 | `scripts/dev.config.json` 中的 `name` 或 `dir` |
| `<新端口>` | 必填 | 纯数字 |
| `--write` | 预览模式 | 实际写盘 |

### 预览/写入的四处

1. 该应用 `package.json` 的 `dev` 与 `preview` 脚本（`--port`）；
2. 宿主 `fulgurjs.config.ts` 里该远程的 dev 地址（多应用模板自动定位宿主子目录）；
3. `scripts/dev.config.json` 里该应用的 `port`（启动器预检/探活都用它）；
4. 模板 README 顶部的端口表。

替换为**词边界匹配**（`5333` 不会误伤 `15333`），不触碰其他端口与生产地址；只写 hits>0 的文件。**副作用**：`--write` 修改上述文件（可用 `git checkout <file>` 回退）；README 无法安全定位时输出人工确认提示而不盲目写。

### 退出码

`0` 预览/写入成功；`2` 用法错误 / 非 `create` 生成的工程（缺 `scripts/dev.config.json`）/ 应用不存在 / 新旧端口相同 / 旧端口未在任何受影响文件出现（工程可能已手工改过）。

### 示例

```bash
# 预览（默认）
$ npx @fulgurjs/federation port vue-remote 6213
[fulgurjs:port] 计划：vue-remote（目录 remote）端口 5213 → 6213
  改写 remote/package.json（2 处）
  改写 scripts/dev.config.json（1 处）
  改写 host/fulgurjs.config.ts（1 处）
  改写 README.md（3 处）
预览模式未写盘；确认无误后加 --write 执行。写入可用 git checkout <file> 回退。
（退出码 0）

# 写入
$ npx @fulgurjs/federation port vue-remote 6213 --write
[fulgurjs:port] 已写入 4 个文件（vue-remote 5213 → 6213）。回退：git checkout <file>
```

---

## `fulgurjs --help`

打印帮助（含全部命令、参数与示例）。`fulgurjs`（无子命令）、`-h`、`help` 同效。未知命令打印帮助并以退出码 2 结束。
