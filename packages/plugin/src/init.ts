/**
 * W1 `fulgurjs init` —— 通用脚手架（项目无关）。
 *
 * 原则（2026-09-19 定调）：插件为所有项目服务，不内置任何具体项目的模板、锚点或文件改写。
 * 各项目自身的集成细节（权限路由剔除、远程启动器、详情页联邦分支等）属于项目侧工程。
 * init 只做三件通用的事：
 * 1) 写出带注释的 fulgurjs.config.ts 起步模板（--force 覆盖已存在文件）；
 * 2) 加载并校验 --config 指定的配置（CFG 三段式报错）；
 * 3) 打印可直接粘贴的样板：每个应用的 federation() vite 配置块、NGINX no-cache 站点模板、
 *    宿主/远程接入核对清单（全部是联邦通用知识）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadRepoConfig, type AppConfig, type RepoConfig } from './config'

const MARK = '[fulgurjs:init]'

/** fulgurjs.config.ts 起步模板（通用示例， fictitious 应用名） */
export const STARTER_CONFIG = `// fulgurjs.config.ts —— @fulgurjs/federation 接入配置（单文件驱动，可入库、可复跑）
// 用法：npx fulgurjs init --config fulgurjs.config.ts   校验配置并输出可粘贴样板与核对清单
//       npx fulgurjs doctor --base http://<站点> --apps <应用目录名...>   部署体检
import { defineRepoConfig } from '@fulgurjs/federation/config'

export default defineRepoConfig({
  // 工程根目录（monorepo 根或单应用仓库根）
  root: process.cwd(),
  apps: [
    // ── 宿主：消费远程页面/组件（也可再 expose 自己的组件给更高层消费）──
    {
      path: 'apps/host',            // 相对 root 的应用目录
      name: 'host-app',             // 联邦容器名（远程引用它时用这个名）
      port: 5173,                   // dev 端口
      base: '/',                    // 部署/dev 的 URL 前缀
      host: {
        // 路由前缀 → 远程名：宿主把 /remote-a/** 的页面解析到远程 remote-a
        remotePrefixes: { '/remote-a/': 'remote-a' },
        // 远程地址：裸 URL（对象形式不支持 name@ 前缀，见错误码 CFG-007）
        remotes: {
          'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' },
        },
        // 页面路由表：宿主路径 → 远程 exposes 键（默认推导 pages/<去前缀去参数段>；
        // 带参路由或非默认键用 spec 显式覆盖）
        pages: [
          { route: '/remote-a/home', name: 'RemoteAHome', title: '首页' },
          { route: '/remote-a/detail/:id', name: 'RemoteADetail', spec: 'pages/remote-a/detail', title: '详情' },
        ],
      },
    },
    // ── 远程：expose 独立页（页面自己从路由取参，不依赖父组件传必填 props，见 BLD-003）──
    {
      path: 'apps/remote-a',
      name: 'remote-a',
      port: 5174,
      base: '/remote-a',
      remote: {
        exposes: {
          './pages/remote-a/home': './src/views/Home.vue',
          './pages/remote-a/detail': './src/views/Detail.vue',
        },
      },
    },
  ],
  // 部署信息（可选）：仅供 init 输出 NGINX 样板时使用
  deploy: { webRoot: '/var/www/your-site', listen: 8080 },
})
`

export type TemplateResult = 'written' | 'exists'

/** 写出起步模板；已存在且非本工具产物时拒绝覆盖（--force 由调用方传参放开） */
export async function writeConfigTemplate(target: string, force = false): Promise<TemplateResult> {
  if (fs.existsSync(target) && !force) {
    return 'exists'
  }
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true })
  fs.writeFileSync(path.resolve(target), STARTER_CONFIG)
  return 'written'
}

const DEFAULT_SHARED_BLOCK = `shared: {
          vue: { singleton: true, requiredVersion: '^3.4.0' },
          'vue-router': { singleton: true, requiredVersion: '^4.4.5' },
          pinia: { singleton: true, requiredVersion: '^2.1.7' },
        }`

function remoteEntriesLiteral(remotes: Record<string, { dev: string; prod: string }>): string {
  return Object.entries(remotes)
    .map(([k, v]) => `    '${k}': { dev: '${v.dev}', prod: '${v.prod}' },`)
    .join('\n')
}

function exposesLiteral(exposes: Record<string, string>): string {
  return Object.entries(exposes)
    .map(([k, v]) => `    '${k}': '${v}',`)
    .join('\n')
}

/** 生成某应用的 federation() vite 配置块（可直接粘贴进 vite.config.ts 的 plugins 数组） */
function viteSnippetFor(app: AppConfig): string {
  const hostRemotes = app.host ? remoteEntriesLiteral(app.host.remotes) : ''
  const remoteRemotes = app.remote?.remotes ? remoteEntriesLiteral(app.remote.remotes) : ''
  const remotesBlock = hostRemotes || remoteRemotes
    ? `  remotes: {\n${hostRemotes || remoteRemotes}\n  },\n`
    : ''
  const exposesBlock = app.remote?.exposes
    ? `  exposes: {\n${exposesLiteral(app.remote.exposes)}\n  },\n`
    : ''
  const sharedBlock = app.shared
    ? `  shared: {\n${Object.entries(app.shared)
        .map(([k, v]) => {
          const opts = [v.singleton ? 'singleton: true' : '', v.requiredVersion ? `requiredVersion: '${v.requiredVersion}'` : ''].filter(Boolean)
          return `    '${k}': { ${opts.join(', ')} },`
        })
        .join('\n')}\n  },\n`
    : `  ${DEFAULT_SHARED_BLOCK},\n`
  return `federation({
  name: '${app.name}',
${remotesBlock}${exposesBlock}${sharedBlock}})`
}

/** 生成 NGINX no-cache 站点模板（联邦部署通用知识，无任何项目特定垫片） */
function nginxSnippetFor(cfg: RepoConfig): string {
  const listen = cfg.deploy?.listen ?? 8080
  const webRoot = cfg.deploy?.webRoot ?? '/var/www/your-site'
  const hostApp = cfg.apps.find((a) => a.host) ?? cfg.apps[0]
  const hostIndex = `/${hostApp.base.replace(/^\/|\/$/g, '')}/index.html`.replace(/\/{2,}/g, '/')
  const blocks = cfg.apps
    .map(
      (a) => {
        const b = a.base === '/' || a.base === '' ? '/' : a.base.replace(/\/$/, '')
        return `  location ${b} {
    try_files $uri $uri/ ${hostIndex};

    location = ${b}/fulgurjs-remoteEntry.js {
      add_header Cache-Control "no-cache";
      add_header Access-Control-Allow-Origin "*";
    }
    location = ${b}/fulgurjs-manifest.json {
      add_header Cache-Control "no-cache";
      add_header Access-Control-Allow-Origin "*";
    }
    location = ${b}/index.html {
      add_header Cache-Control "no-cache";
    }
  }`
      },
    )
    .join('\n\n')
  return `# 联邦站点模板（要点：remoteEntry/manifest/index.html 必须 no-cache——
# 文件名固定而内容每次构建变化，immutable 长缓存会让浏览器持旧入口、重部署后全 404；
# 带 hash 的 assets 才配长缓存；跨源部署时保留 Access-Control-Allow-Origin）
server {
  listen ${listen};
  root ${webRoot};

${blocks}
}`
}

function appSummary(app: AppConfig): string {
  const role = app.host ? (app.remote ? '宿主+远程' : '宿主') : '远程'
  const lines: string[] = []
  lines.push(`  ${app.name}（${role}，目录 ${app.path}，dev 端口 ${app.port}，base ${app.base}）`)
  if (app.host) {
    for (const [k, v] of Object.entries(app.host.remotes)) {
      lines.push(`    消费远程 ${k} → dev ${v.dev} / prod ${v.prod}`)
    }
    lines.push(`    页面路由表：${app.host.pages.length} 条`)
  }
  if (app.remote?.exposes) {
    lines.push(`    exposes：${Object.keys(app.remote.exposes).join('、')}`)
  }
  if (app.remote?.remotes) {
    for (const [k, v] of Object.entries(app.remote.remotes)) {
      lines.push(`    反向消费 ${k} → dev ${v.dev} / prod ${v.prod}（双向联邦，dev 下需 devSharedSelf: true）`)
    }
  }
  return lines.join('\n')
}

/** 校验配置并生成完整报告（校验失败以 Error 抛出，三段式文案来自 config 加载器） */
export async function inspectConfig(configPath: string): Promise<string> {
  const cfg = await loadRepoConfig(configPath)
  const out: string[] = []
  out.push(`${MARK} 配置校验通过：root=${cfg.root}，apps=${cfg.apps.length}`)
  out.push('应用摘要：')
  for (const app of cfg.apps) out.push(appSummary(app))

  out.push('\n── 各应用 vite.config.ts plugins 粘贴块 ──')
  for (const app of cfg.apps) {
    out.push(`\n# ${app.path}（${app.name}）`)
    out.push(viteSnippetFor(app))
  }

  out.push('\n── NGINX 站点模板 ──')
  out.push(nginxSnippetFor(cfg))

  out.push('\n── 接入核对清单（联邦通用项，与具体项目无关） ──')
  out.push('1. 宿主与远程都安装依赖：pnpm add @fulgurjs/federation')
  out.push('2. expose 一律指向独立页（页面从路由取参）；组件需要必填 props 时给默认值（BLD-003）')
  out.push('3. shared 里 vue / vue-router / pinia 建议 singleton: true——跨应用必须同实例（全局响应性、getActivePinia、路由注入）')
  out.push('4. 远程的全局副作用（全局组件/指令/启动期初始化）封装为启动器模块并 expose，宿主在 loadRemote 页面前调用；')
  out.push('   跨应用传值（locale/store/事件等）统一走 virtual:fulgurjs-api 的 context 函数：宿主 provideAppContext 一次写入，远程 boot 用 getAppContext / requireAppContext 消费')
  out.push('5. 应用代码唯一 API 入口：import { loadRemote, provideAppContext, getAppContext, definePages, remoteSchema, remoteComponent } from \'virtual:fulgurjs-api\'——3.0.0 起旧入口（virtual:fulgurjs-runtime / @fulgurjs/federation 的 context/pages/vue 子路径）已删除，一律改用本入口')
  out.push('6. dev 冷启动首轮 30~60s 有预构建窗口（瞬时 504/"ce"，DEV-010）：先真实打开页面预热再做断言')
  out.push('7. 部署后体检：fulgurjs doctor --base <URL> --apps <应用...>（缓存头/资源形态/CORS/chunk 可达/版本 skew）')
  out.push('8. 部署语义：remoteEntry/manifest/index.html 必须 no-cache（严禁 immutable）；带 hash 的 assets 长缓存')
  return out.join('\n')
}
