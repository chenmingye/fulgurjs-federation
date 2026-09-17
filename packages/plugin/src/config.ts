/**
 * W1 fulgur.config.ts：单配置文件驱动的迁移生成器 schema（决策：主包内置 bin + 单配置文件）。
 *
 * 设计边界（排期文档 W1）：
 * - CLI 编码的是「已验证最终形态」（testbed 三应用集成的全部修复项，见排期 §3 重建必做清单）；
 *   项目侧差异（谁是宿主/谁是远程/页面路由表/端口/部署形态）全部来自本配置文件；
 * - 非标项目结构（权限/路由体系差异）由 patcher 锚点失败显式报错指路，不静默吞。
 */
export interface FulgurPageEntry {
  /** 宿主路由路径（/flowable、/lowcode 原生空间，参数段 :xx） */
  route: string
  /** 路由 name（命名跳转依赖） */
  name?: string
  /** exposes 键（显式覆盖推导） */
  spec?: string
  /** 页签中文标题 */
  title?: string
}

export interface FulgurAppConfig {
  /** 目录名（仓库内相对路径），如 demo-host */
  path: string
  /** 联邦容器名（remotes 自报名/exposes 提供方） */
  name: string
  /** dev 端口 */
  port: number
  /** 部署/dev base 路径，如 /main */
  base: string
  /** 部署目录名（webRoot 下），缺省取 base 去斜杠 */
  deployDir?: string
  /** 宿主角色 */
  host?: {
    /** 页面路由表（fulgurPages） */
    pages: FulgurPageEntry[]
    /** 路由前缀 → remote 名 */
    remotePrefixes: Record<string, string>
    /** remotes 配置（键 → { dev, prod }，裸 URL 无 name@ 前缀） */
    remotes: Record<string, { dev: string; prod: string }>
    /** 权限路由剔除前缀（后台菜单生成的联邦路径） */
    menuFilterPrefixes: string[]
  }
  /** remote 角色 */
  remote?: {
    /** exposes：./键 → 源文件 */
    exposes: Record<string, string>
    /** 消费的 remotes（双向联邦，如 bpm 消费 admin 表单组件） */
    remotes?: Record<string, { dev: string; prod: string }>
    /** federatedBoot 形态：bpm（store 挂宿主 pinia）/lowcode（globCom+avue+EP locale） */
    boot: 'bpm' | 'lowcode'
    /** 联邦详情页直渲染 patch（bpm detail 双分支） */
    detailPatch?: boolean
    /** EP 进 shared singleton（lowcode D.4） */
    sharedElementPlus?: boolean
  }
  /** shared 表（vue/vue-router/pinia 全应用一致） */
  shared?: Record<string, { singleton?: boolean; requiredVersion?: string }>
  /** optimizeDeps 调整（bpm/lowcode 的 include/exclude 最终形态） */
  optimize?: { exclude: string[] }
  /** dev 专用 dayjs→esm 别名（CJS 子路径 interop 兜底） */
  dayjsDevAlias?: boolean
}

export interface FulgurRepoConfig {
  /** 全新拷贝出的工程根（CLI 在其上做集成） */
  root: string
  apps: FulgurAppConfig[]
  env: {
    /** 本地后台（.env.backend BACKEND_ORIGIN_DEV） */
    backendOrigin: string
    backendContext: string
    /** 乾坤开关（false=联邦平行通道） */
    qiankun: boolean
    /** admin prod 压缩（compress 插件对 undefined 崩溃 → none） */
    compress: 'none' | 'gzip' | 'brotli'
  }
  deploy: {
    /** nginx 站点根 */
    webRoot: string
    /** conf 输出路径（nginx servers 目录） */
    nginxConf: string
    listen: number
    /** 后台反代 */
    backendProxy: string
  }
  /** 免登录演示路由（FulgurDemo，双远程组件直渲染） */
  demo?: {
    adminRoutePath: string
    componentSource: string
    cards: Array<{ remote: string; expose: string }>
  }
}

export type FulgurUserConfig = Partial<FulgurRepoConfig>

/** 用户配置文件入口：仅做类型收窄（identity），不引入运行时逻辑 */
export function defineFulgurConfig(config: FulgurUserConfig): FulgurUserConfig {
  return config
}

/**
 * 加载 fulgur.config.ts（或 .js/.json）。
 * - 配置内的 `@fulgur/federation/config` 导入被重写为本包 dist/config.js 绝对路径——
 *   init 之前工程依赖尚未安装（鸡生蛋），重写后零依赖可加载；
 * - TS 走 Node 原生类型剥离（Node ≥23.6 默认开启；配置文件须用可擦除语法——纯对象无 enum/namespace）；
 *   老版本 Node 回退 esbuild 转译（先试配置工程，再试 CLI 自带依赖树）。
 */
export async function loadFulgurConfig(configPath: string): Promise<FulgurRepoConfig> {
  const { pathToFileURL, fileURLToPath } = await import('node:url')
  const { createRequire } = await import('node:module')
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')

  // 本包 dist/config.js 的绝对路径（bundle 场景下 import.meta.url = dist/cli.js，取同目录）
  const selfDir = path.dirname(fileURLToPath(import.meta.url))
  const selfConfigJs = path.join(selfDir, 'config.js')
  const SELF_SPEC = fs.existsSync(selfConfigJs) ? pathToFileURL(selfConfigJs).href : '@fulgur-federation-config-unavailable'

  const rewriteSelfImports = (source: string): string =>
    source.replace(/(['"])@fulgur\/federation\/config\1/g, (_m, q) => `${q}${SELF_SPEC}${q}`)

  const importConfigs = async (cacheKey: string) => {
    return (await import(`${cacheKey}?t=${Date.now()}`)) as { default: FulgurUserConfig }
  }

  let mod: { default: FulgurUserConfig }
  if (configPath.endsWith('.json')) {
    mod = { default: JSON.parse(fs.readFileSync(configPath, 'utf8')) }
  } else {
    const source = rewriteSelfImports(fs.readFileSync(configPath, 'utf8'))
    const tmpBase = path.join(os.tmpdir(), `fulgur-config-${Date.now()}`)
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
      `[fulgur:init] 配置缺少 root（全新拷贝出的工程根目录绝对路径）\n根因：CLI 需要知道在哪个工程上做集成\n修法：fulgur.config.ts 顶层补 root: '/abs/path/to/repo'`,
    )
  }
  if (!Array.isArray(cfg.apps) || cfg.apps.length === 0) {
    throw new Error('[fulgur:init] 配置缺少 apps（至少一个宿主或远程应用）')
  }
  return cfg as FulgurRepoConfig
}
