/**
 * W1 fulgurjs.config.ts：单配置文件驱动的 schema + 加载器（项目无关，决策见排期文档 §4：
 * 主包内置 bin + 单配置文件驱动，可入库可复跑）。
 * init 只消费该配置生成通用样板（见 init.ts）；插件运行时（federation()）不读取本文件。
 */
export interface PageEntry {
  /** 宿主路由路径（参数段用 :xx） */
  route: string
  /** 路由 name（命名跳转依赖） */
  name?: string
  /** 远程 exposes 键（显式覆盖默认推导 pages/<去前缀去参数段>） */
  spec?: string
  /** 页签标题 */
  title?: string
}

export interface RemoteAddress {
  dev: string
  prod: string
}

export interface HostConfig {
  /** 页面路由表 */
  pages: PageEntry[]
  /** 路由前缀 → 远程名 */
  remotePrefixes: Record<string, string>
  /** 消费的远程地址（键 = import 前缀；裸 URL，对象形式不支持 name@ 前缀） */
  remotes: Record<string, RemoteAddress>
}

export interface RemoteConfig {
  /** exposes：./键 → 源文件（独立页） */
  exposes: Record<string, string>
  /** 反向消费的远程（双向联邦时；dev 下自身源码参与协商需 devSharedSelf: true） */
  remotes?: Record<string, RemoteAddress>
}

export interface AppConfig {
  /** 相对 root 的应用目录 */
  path: string
  /** 联邦容器名 */
  name: string
  /** dev 端口 */
  port: number
  /** 部署/dev 的 URL 前缀，如 /main */
  base: string
  /** 部署目录名（缺省取 base 去斜杠） */
  deployDir?: string
  /** 宿主角色 */
  host?: HostConfig
  /** 远程角色 */
  remote?: RemoteConfig
  /** 该应用的 shared 表（缺省建议 vue/vue-router/pinia singleton，见 init 输出的样板） */
  shared?: Record<string, { singleton?: boolean; requiredVersion?: string }>
}

export interface DeployConfig {
  /** NGINX 站点根（样板输出用，可选） */
  webRoot?: string
  /** 监听端口（样板输出用，可选） */
  listen?: number
}

export interface RepoConfig {
  /** 工程根（monorepo 根或单应用仓库根） */
  root: string
  apps: AppConfig[]
  deploy?: DeployConfig
}

export type UserConfig = Partial<RepoConfig>

/** 用户配置文件入口：仅做类型收窄（identity），不引入运行时逻辑 */
export function defineRepoConfig(config: UserConfig): UserConfig {
  return config
}

/**
 * 加载 fulgurjs.config.ts（或 .js/.json）。
 * - 配置内的 `@fulgurjs/federation/config` 导入被重写为本包 dist/config.js 绝对路径——
 *   init 之前工程依赖尚未安装（鸡生蛋），重写后零依赖可加载；
 * - TS 走 Node 原生类型剥离（Node ≥23.6 默认开启；配置文件须用可擦除语法——纯对象无 enum/namespace）；
 *   老版本 Node 回退 esbuild 转译（先试配置工程，再试 CLI 自带依赖树）。
 */
export async function loadRepoConfig(configPath: string): Promise<RepoConfig> {
  const { pathToFileURL, fileURLToPath } = await import('node:url')
  const { createRequire } = await import('node:module')
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')

  // 本包 dist/config.js 的绝对路径（bundle 场景下 import.meta.url = dist/cli.js，取同目录）
  const selfDir = path.dirname(fileURLToPath(import.meta.url))
  const selfConfigJs = path.join(selfDir, 'config.js')
  const SELF_SPEC = fs.existsSync(selfConfigJs) ? pathToFileURL(selfConfigJs).href : '@fulgurjs-federation-config-unavailable'

  const rewriteSelfImports = (source: string): string =>
    source.replace(/(['"])@fulgurjs\/federation\/config\1/g, (_m, q) => `${q}${SELF_SPEC}${q}`)

  const importConfigs = async (cacheKey: string) => {
    return (await import(`${cacheKey}?t=${Date.now()}`)) as { default: UserConfig }
  }

  let mod: { default: UserConfig }
  if (configPath.endsWith('.json')) {
    mod = { default: JSON.parse(fs.readFileSync(configPath, 'utf8')) }
  } else {
    const source = rewriteSelfImports(fs.readFileSync(configPath, 'utf8'))
    const tmpBase = path.join(os.tmpdir(), `fulgurjs-config-${Date.now()}`)
    if (/\.(ts|mts|cts)$/.test(configPath)) {
      // Node ≥23.6：原生类型剥离（写回 .ts 后 import）
      try {
        const tmpTs = `${tmpBase}.ts`
        fs.writeFileSync(tmpTs, source)
        mod = await importConfigs(pathToFileURL(tmpTs).href)
      } catch (e) {
        if (!/Unexpected|SyntaxError|ERR_UNSUPPORTED_NODE_MODULES|ERR_UNKNOWN_FILE_EXTENSION|ERR_IMPORT_ATTRIBUTE/.test(String(e)) && process.version.startsWith('v2')) {
          throw e
        }
        // 老版本 Node：esbuild 转译（先配置工程，再 CLI 依赖树）
        const requireFromConfig = createRequire(configPath)
        let esbuild: typeof import('esbuild')
        try {
          esbuild = requireFromConfig('esbuild')
        } catch {
          const requireFromSelf = createRequire(import.meta.url)
          esbuild = requireFromSelf('esbuild')
        }
        const out = esbuild.buildSync({ entryPoints: [configPath], bundle: false, write: false, format: 'esm', target: 'node18' })
        const jsFile = `${tmpBase}.mjs`
        fs.writeFileSync(jsFile, rewriteSelfImports(out.outputFiles[0].text))
        mod = await importConfigs(pathToFileURL(jsFile).href)
      }
    } else {
      const jsFile = `${tmpBase}.mjs`
      fs.writeFileSync(jsFile, source)
      mod = await importConfigs(pathToFileURL(jsFile).href)
    }
  }
  const cfg = mod.default
  if (!cfg?.root) {
    throw new Error(
      `[fulgurjs:init] 配置缺少 root（工程根目录绝对路径）\n根因：CLI 需要知道在哪个工程上做集成\n修法：fulgurjs.config.ts 顶层补 root: '/abs/path/to/repo'（起步模板：fulgurjs init）`,
    )
  }
  if (!Array.isArray(cfg.apps) || cfg.apps.length === 0) {
    throw new Error('[fulgurjs:init] 配置缺少 apps（至少一个宿主或远程应用）')
  }
  for (const app of cfg.apps) {
    if (!app.host && !app.remote) {
      throw new Error(
        `[fulgurjs:init] 应用 "${app.path}" 既无 host 也无 remote 角色\n根因：应用必须至少声明一个角色\n修法：宿主补 host: { pages, remotePrefixes, remotes }，远程补 remote: { exposes }`,
      )
    }
  }
  return cfg as RepoConfig
}
