/**
 * W1 `fulgurjs init` —— 通用脚手架（项目无关）。
 *
 * 原则（2026-09-19 定调）：插件为所有项目服务，不内置任何具体项目的模板、锚点或文件改写。
 * init 只做三件通用的事：
 * 1) 写出带注释的 fulgurjs.config.ts 起步模板——默认导出直接是 federation() 选项；
 *    宿主可选具名导出 hostPages；
 * 2) 加载并校验 --config 指定的配置（CFG 三段式报错；旧聚合形态报迁移错误）；
 * 3) 打印可直接粘贴的 `federation(fulgurjsConfig)` 接入块与接入核对清单（纯打印，
 *    不改写任何项目文件）。旧聚合配置（root + apps[]）的专属输出（各应用粘贴块、
 *    NGINX 样板）已随 5.0.0 删除——NGINX 部署要点在核对清单第 8 条。
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadAppConfig, type AppConfigLoadResult } from './app-config'

const MARK = '[fulgurjs:init]'

/**
 * 单项目 fulgurjs.config.ts 起步模板。
 * 默认导出直接可传给 federation()；宿主另以具名导出 hostPages 提供 CLI 核对数据。
 */
export const STARTER_CONFIG = `// fulgurjs.config.ts —— @fulgurjs/federation 单项目接入配置（一项目一份，可入库、可复跑）
//
// Vite 接入（本项目 vite.config.ts 只需两行联邦相关代码）：
//   import federation from '@fulgurjs/federation'
//   import fulgurjsConfig from './fulgurjs.config'
//   // plugins: [ ...原有插件, federation(fulgurjsConfig) ]
//
// CLI（纯本地，无网络）：
//   npx fulgurjs explain                      # 解释本应用有效形态与加载链
//   npx fulgurjs check-pages                  # 宿主页面表 ↔ 远程 manifest 契约核对
//   npx fulgurjs doctor --base http://<站点> --apps <容器名>   # 部署体检
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  // 联邦容器名（远程引用它时用这个名；同一页面内唯一）
  name: 'my-app',
  // 本应用对外暴露的模块：'./键' → 相对本项目根的源文件路径
  exposes: {
    './pages/home': './src/views/Home.vue',
  },
  // 本应用消费的远程（键 = import 前缀；dev/prod 地址二段式，单地址字符串也行）
  remotes: {
    'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' },
  },
  // 可选：远程需要启动期初始化（全局样式/组件/locale）时声明入口文件——
  // 默认导出 setup(context) 应用级执行一次；可选具名导出 onSession(context)
  // 按宿主 sessionKey 去重执行。缺省 = 无初始化行为（普通 expose 语义不变）
  // setup: './src/fulgurjs/setup.ts',
  shared: {
    vue: { singleton: true, requiredVersion: '^3.4.0' },
    'vue-router': { singleton: true, requiredVersion: '^4.4.5' },
    pinia: { singleton: true, requiredVersion: '^2.1.7' },
  },
} satisfies FederationOptions

// ── 以下仅供 CLI explain/check-pages 读取（不是 federation() 的参数）──
// 宿主应用：把页面路由表以具名导出 hostPages 提供给 CLI，与运行时 createHostPages
// 消费同一份数据模块（唯一手工维护位置；纯远程应用删除本段即可）。
// 纯数据模块示例 src/fulgurjs/host/pages.data.ts：
//   export const remotePrefixes = { '/remote-a/': 'remote-a' }
//   export const pages = [{ route: '/remote-a/home', name: 'Home', title: '首页' }]
// import { pages, remotePrefixes } from './src/fulgurjs/host/pages.data'
// export const hostPages = { pages, remotePrefixes }
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

/** 单项目形态：vite.config.ts 接入块（真实形态就是两行导入 + 一次插件注册） */
function viteSnippetForAppMode(appRoot: string): string {
  return `// ${appRoot}/vite.config.ts（联邦相关行；其余 Vite 配置原样保留）
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig({
  plugins: [
    // ...原有插件,
    federation(fulgurjsConfig),
  ],
})`
}

const COMMON_CHECKLIST = [
  '1. 安装依赖：npm/pnpm add @fulgurjs/federation',
  '2. expose 一律指向独立页（页面从路由取参）；组件需要必填 props 时给默认值（BLD-003）',
  '3. shared 里 vue / vue-router / pinia 建议 singleton: true——跨应用必须同实例（全局响应性、getActivePinia、路由注入）',
  '4. 远程需要启动期初始化（全局组件/样式/locale 等）时，在 fulgurjs.config.ts 的 setup 声明入口文件：',
  '   默认导出 setup(context) 应用级执行一次（容器首次被加载业务模块前）；可选具名导出 onSession(context)',
  '   按宿主 sessionKey 去重执行（换账号/重登自动重跑）。宿主无需再手写「loadRemote 启动器并调用」；',
  '   跨应用传值统一走 @fulgurjs/federation/runtime 的 context 函数：宿主 provideAppContext 写入',
  '   （退出时 clearAppContext 清理），远程 setup/onSession 用 getAppContext / requireAppContext 消费',
  '5. 应用代码唯一 API 入口：import { loadRemote, provideAppContext, getAppContext, clearAppContext, definePages, createHostPages, remoteSchema, remoteComponent } from \'@fulgurjs/federation/runtime\'',
  '6. dev 冷启动首轮 30~60s 有预构建窗口（瞬时 504/"ce"，DEV-010）：先真实打开页面预热再做断言',
  '7. 配置解释：fulgurjs explain；页面契约核对：fulgurjs check-pages（宿主项目运行，--manifest/--site 指定远程 manifest 来源）；',
  '   部署体检：fulgurjs doctor --base <URL> --apps <容器名...>',
  '8. 部署语义：remoteEntry/manifest/index.html 必须 no-cache（严禁 immutable）；带 hash 的 assets 长缓存',
]

function appModeSummary(loaded: AppConfigLoadResult): string[] {
  const options = loaded.options!
  const roleText = { host: '宿主', remote: '远程', dual: '宿主+远程（双角色）' }[
    Object.keys(options.remotes ?? {}).length > 0 && (Object.keys(options.exposes ?? {}).length > 0 || !!options.setup) ? 'dual' : Object.keys(options.remotes ?? {}).length > 0 ? 'host' : 'remote'
  ] as string
  const lines: string[] = []
  lines.push(`  ${options.name}（${roleText}，单项目配置，目录 ${loaded.appRoot}；base/dev 端口由 vite.config.ts 管理）`)
  for (const [k, v] of Object.entries(options.remotes ?? {})) {
    const cfg = typeof v === 'string' ? { dev: v, prod: v } : (v as { dev?: string; prod?: string })
    lines.push(`    消费远程 ${k} → dev ${cfg.dev ?? ''} / prod ${cfg.prod ?? ''}`)
  }
  if (options.exposes) {
    lines.push(`    exposes（${Object.keys(options.exposes).length}）：${Object.keys(options.exposes).join('、')}`)
  }
  if (options.setup) {
    lines.push(`    setup（可选远程初始化）：${options.setup}`)
  }
  if (loaded.hostPages) {
    lines.push(`    页面路由表（hostPages 具名导出）：${loaded.hostPages.pages.length} 条`)
  } else {
    lines.push('    页面路由表：（无 hostPages 导出——纯远程应用无需；宿主建议提供）')
  }
  return lines
}

/** 校验配置并生成完整报告（校验失败以 Error 抛出，三段式文案来自配置加载器） */
export async function inspectConfig(configPath: string): Promise<string> {
  const loaded = await loadAppConfig(configPath)
  const out: string[] = []
  out.push(`${MARK} 配置校验通过：单项目形态（默认导出 = federation() 选项）`)
  out.push('应用摘要：')
  out.push(...appModeSummary(loaded))
  out.push('\n── vite.config.ts plugins 接入块（这就是全部联邦接入代码） ──')
  out.push(viteSnippetForAppMode(loaded.appRoot))
  out.push('\n── 接入核对清单（联邦通用项，与具体项目无关） ──')
  out.push(...COMMON_CHECKLIST)
  return out.join('\n')
}
