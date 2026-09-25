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
  /** 页面保活开关（按页显式开启；默认关闭） */
  keepAlive?: boolean
}

export interface RemoteAddress {
  dev: string
  prod: string
}

export interface HostConfig {
  /**
   * 页面路由表（可选）：应用代码的页面表是运行时页面真源（供宿主路由与
   * createHostPages 共用），仓库配置中的副本仅供 init/explain 摘要与核对。
   * 不再强制——缺省时 CLI 摘要按实际提供数量报告。
   */
  pages?: PageEntry[]
  /** 页面 spec 推导规则（与宿主 createHostPages 的 deriveSpec 保持一致；缺省 = 去首段 + 剥 :参 段） */
  deriveSpec?: (route: string) => string
  /** 路由前缀 → 远程名 */
  remotePrefixes: Record<string, string>
  /** 消费的远程地址（键 = import 前缀；裸 URL，对象形式不支持 name@ 前缀） */
  remotes: Record<string, RemoteAddress>
}

export interface RemoteConfig {
  /** exposes：./键 → 源文件（独立页） */
  exposes: Record<string, string>
  /** 远程初始化入口（默认导出 setup(context)，可选具名导出 onSession(context)） */
  setup?: string
  /** 反向消费的远程（双向联邦时） */
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
  /** 显式覆盖 dev 下自身源码参与 shared 协商改写；缺省按角色推断（见 federationOptionsForApp） */
  devSharedSelf?: boolean
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

  // 本包 dist/config.js 的绝对路径（bundle 场景下 import.meta.url = dist/cli.js，取同目录）。
  // 两种模块形态都要支持：ESM（CLI/init 直用）下 import.meta.url 可用；CJS 形态（vite 配置
  // 加载器把本模块 require 进 CJS 配置包，esbuild 会把 import.meta.url 编译为空）回落
  // __dirname——两侧都以「自身所在目录 + config.js」定位。
  const selfDir = await (async (): Promise<string> => {
    try {
      return path.dirname(fileURLToPath(import.meta.url))
    } catch {
      /* import.meta 不可用（CJS 形态） */
    }
    try {
      return __dirname
    } catch {
      /* __dirname 不可用（严格 ESM 形态） */
    }
    return ''
  })()
  const selfConfigJs = selfDir ? path.join(selfDir, 'config.js') : ''
  const SELF_SPEC = selfConfigJs && fs.existsSync(selfConfigJs) ? pathToFileURL(selfConfigJs).href : '@fulgurjs-federation-config-unavailable'

  const rewriteSelfImports = (source: string): string =>
    source.replace(/(['"])@fulgurjs\/federation\/config\1/g, (_m, q) => `${q}${SELF_SPEC}${q}`)

  // cache-bust 用单调计数器而非 Date.now()：同毫秒两次加载会命中模块缓存拿到前一份配置
  //（2026-09-25 实测：两个测试毫秒内先后 loadRepoConfig，第二份读到第一份内容）
  let cacheBust = 0
  const importConfigs = async (cacheKey: string) => {
    return (await import(`${cacheKey}?t=${Date.now()}-${++cacheBust}`)) as { default: UserConfig }
  }

  let mod: { default: UserConfig }
  if (configPath.endsWith('.json')) {
    mod = { default: JSON.parse(fs.readFileSync(configPath, 'utf8')) }
  } else {
    const source = rewriteSelfImports(fs.readFileSync(configPath, 'utf8'))
    const tmpBase = path.join(os.tmpdir(), `fulgurjs-config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
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
        `[fulgurjs:init] 应用 "${app.path}" 既无 host 也无 remote 角色\n根因：应用必须至少声明一个角色\n修法：宿主补 host: { remotePrefixes, remotes }（pages 可选），远程补 remote: { exposes }`,
      )
    }
  }
  return cfg as RepoConfig
}

/**
 * 仓库配置 → 某应用的 federation() Vite 插件选项（§3.4 单配置驱动）。
 *
 * 转换范围：name、宿主/反向 remotes（两处同键冲突即报错，带两边值）、exposes、
 * 可选 setup、shared、devSharedSelf。build.target/base/端口/代理/插件顺序等仍归各应用
 * vite.config.ts 管理——本函数只生成 federation({...}) 的入参。
 *
 * devSharedSelf 来源（优先级）：app.devSharedSelf 显式值 > 角色推断。
 * 推断规则：提供 exposes（含仅 setup）的应用为 true（其源码被宿主消费，需协商到宿主
 * 实例）；纯宿主（只消费）为 false。双向联邦漏配该项曾是已知错误配置（§12.4），
 * 推断后不再依赖背诵。
 */
export function federationOptionsForApp(
  config: RepoConfig,
  appPathOrName: string,
): import('./options').FederationOptions {
  const app = config.apps.find(
    (a) => a.path === appPathOrName || a.name === appPathOrName,
  )
  if (!app) {
    throw new Error(
      `[fulgurjs] 应用 "${appPathOrName}" 不在仓库配置中\n` +
        `  可用应用: ${config.apps.map((a) => `${a.path}(${a.name})`).join('、')}\n` +
        `  修法: 修正应用目录名或容器名（fulgurjs.config.ts apps 数组内二选一匹配）`,
    )
  }
  if (!app.host && !app.remote) {
    throw new Error(
      `[fulgurjs] 应用 "${app.path}" 既无 host 也无 remote 角色\n` +
        `  修法: 宿主补 host: { remotePrefixes, remotes }，远程补 remote: { exposes }`,
    )
  }

  // remotes：宿主消费 + 远程反向消费合并；同键不同地址 = 配置漂移，显式报错不静默覆盖
  const remotes: Record<string, RemoteAddress> = {}
  const remoteSource = new Map<string, string>()
  const mergeRemotes = (from: Record<string, RemoteAddress> | undefined, role: string) => {
    for (const [key, addr] of Object.entries(from ?? {})) {
      const prev = remotes[key]
      if (prev && (prev.dev !== addr.dev || prev.prod !== addr.prod)) {
        throw new Error(
          `[fulgurjs] 应用 "${app.path}" 的远程 "${key}" 在 ${role} 与 ${remoteSource.get(key)} 两处地址不一致\n` +
            `  ${remoteSource.get(key)}: dev=${prev.dev} prod=${prev.prod}\n` +
            `  ${role}: dev=${addr.dev} prod=${addr.prod}\n` +
            `  修法: 修正 fulgurjs.config.ts 使两处一致（同一远程在一个应用内只能有一个地址）`,
        )
      }
      remotes[key] = addr
      remoteSource.set(key, role)
    }
  }
  mergeRemotes(app.host?.remotes, 'host.remotes')
  mergeRemotes(app.remote?.remotes, 'remote.remotes')

  const hasExposes = !!app.remote && Object.keys(app.remote.exposes).length > 0
  const hasRemotes = Object.keys(remotes).length > 0

  return {
    name: app.name,
    ...(hasRemotes ? { remotes } : {}),
    ...(hasExposes ? { exposes: app.remote!.exposes } : {}),
    ...(app.remote?.setup ? { setup: app.remote.setup } : {}),
    ...(app.shared ? { shared: app.shared } : {}),
    devSharedSelf: app.devSharedSelf ?? (hasExposes || !!app.remote?.setup),
  }
}
