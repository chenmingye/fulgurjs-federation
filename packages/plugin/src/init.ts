/**
 * W1 `fulgurjs init` —— 通用脚手架（项目无关）。
 *
 * 原则（2026-09-19 定调；6.0.0 起按 UX-02/UX-03 场景化）：插件为所有项目服务，
 * 不内置任何具体项目的模板、锚点或文件改写。init 只做三件通用的事：
 * 1) 按框架与角色写出**最小有效**的 fulgurjs.config.ts 起步模板——默认导出直接是
 *    federation() 选项；逐页接入的宿主可选具名导出 hostPages；
 * 2) 加载并校验 --config 指定的配置（CFG 三段式报错；旧聚合形态报迁移错误）；
 * 3) 打印可直接粘贴的 `federation(fulgurjsConfig)` 接入块与**按场景**的接入核对清单
 *    （纯打印，不改写任何项目文件）。
 *
 * 场景来源：框架从项目 package.json 依赖判断（vue/react 依赖可明确时据此生成；
 * 两框架并存或都没有时不猜，要求 --framework 显式选择）；角色由 --role 给出
 * （consumer 消费方 / provider 提供方 / dual 双角色，默认 dual）。shared 只包含
 * 项目实际安装且被共享的库，不默认塞 pinia/vue-router。
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadAppConfig, type AppConfigLoadResult } from './app-config'

const MARK = '[fulgurjs:init]'

export type InitFramework = 'vue' | 'react'
export type InitRole = 'consumer' | 'provider' | 'dual'

export interface InitScenario {
  framework: InitFramework
  role: InitRole
}

/** 从 package.json 依赖判断框架；判断不了返回 null（调用方要求显式选择，不猜） */
export function detectFrameworkFromPackageJson(pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): InitFramework | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const hasVue = 'vue' in deps
  const hasReact = 'react' in deps
  if (hasVue && !hasReact) return 'vue'
  if (hasReact && !hasVue) return 'react'
  return null
}

const REMOTES_EXAMPLE = `  // 本应用消费的远程（键 = import 前缀；dev/prod 地址二段式，单地址字符串也行）
  remotes: {
    'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' },
  },`

const EXPOSES_EXAMPLE = {
  vue: `  // 本应用对外暴露的模块：'./键' → 相对本项目根的源文件路径
  // 普通组件/函数模块可直接 expose（使用方 remoteComponent/loadRemote 消费，props 见组件契约）；
  // 只有作为「页面」接入（宿主页面路由表）时才要求独立页（从路由取参）
  exposes: {
    './shared/user-badge': './src/components/UserBadge.vue',
  },`,
  react: `  // 本应用对外暴露的模块：'./键' → 相对本项目根的源文件路径
  // 普通组件/函数模块可直接 expose（使用方 remoteComponent/loadRemote 消费，props 见组件契约）；
  // 只有作为「页面」接入（宿主页面路由表）时才要求独立页（从路由取参）
  exposes: {
    './shared/user-badge': './src/components/UserBadge.tsx',
  },`,
}

/** shared 示例：只写框架本体；router/store 只在项目实际安装时提示追加（不默认硬编码版本范围） */
function sharedExample(framework: InitFramework): string {
  if (framework === 'vue') {
    return `  // 跨应用共享的库 singleton: true（全局响应性/路由/store 注入要求同实例）。
  // 只列项目实际安装且要跨应用共享的库；requiredVersion 按项目实际版本收敛（可省略）。
  shared: {
    vue: { singleton: true },
  },`
  }
  return `  // 跨应用共享的库 singleton: true（Hooks 状态/renderer 要求同实例）。
  // 只列项目实际安装且要跨应用共享的库；requiredVersion 按项目实际版本收敛（可省略）。
  // react-dom 也按需共享（远程渲染进宿主 DOM 时必须同 renderer）。
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },`
}

const HOST_PAGES_COMMENT = `// ── 以下仅供逐页接入的宿主使用（不是 federation() 的参数）──
// 逐页接入（宿主页面路由表 → 远程页面）时，把页面路由表以具名导出 hostPages 提供给 CLI，
// 与运行时 createHostPages 消费同一份数据模块（唯一手工维护位置）。
// 纯数据模块示例 src/fulgurjs/host/pages.data.ts：
//   export const remotePrefixes = { '/remote-a/': 'remote-a' }
//   export const pages = [{ route: '/remote-a/home', name: 'Home', title: '首页' }]
// import { pages, remotePrefixes } from './src/fulgurjs/host/pages.data'
// export const hostPages = { pages, remotePrefixes }
//
// 不用逐页接入（完整子应用桥接 / 普通组件消费）则删除本段——业务菜单与业务 Router
// 仍归应用自己管理，联邦不接管。`

/**
 * 按场景生成的 fulgurjs.config.ts 起步模板（最小有效配置；UX-02）。
 * 默认导出直接可传给 federation()；逐页接入的宿主另以具名导出 hostPages。
 */
export function starterConfigFor(scenario: InitScenario): string {
  const { framework, role } = scenario
  const wantRemotes = role === 'consumer' || role === 'dual'
  const wantExposes = role === 'provider' || role === 'dual'
  const lines: string[] = []
  lines.push(`// fulgurjs.config.ts —— @fulgurjs/federation 单项目接入配置（一项目一份，可入库、可复跑）`)
  lines.push(`//`)
  lines.push(`// Vite 接入（本项目 vite.config.ts 只需两行联邦相关代码）：`)
  lines.push(`//   import federation from '@fulgurjs/federation'`)
  lines.push(`//   import fulgurjsConfig from './fulgurjs.config'`)
  lines.push(`//   // plugins: [ ...原有插件, federation(fulgurjsConfig) ]`)
  lines.push(`//`)
  lines.push(`// CLI（纯本地，无网络）：`)
  lines.push(`//   npx fulgurjs explain                      # 解释本应用有效形态与加载链`)
  lines.push(`//   npx fulgurjs check-pages                  # 逐页接入的宿主：页面表 ↔ 远程 manifest 契约核对`)
  lines.push(`//   npx fulgurjs doctor --base http://<站点> --apps <部署子目录>   # 部署体检`)
  lines.push(`import type { FederationOptions } from '@fulgurjs/federation'`)
  lines.push('')
  lines.push('export default {')
  lines.push("  // 联邦容器名（远程引用它时用这个名；同一页面内唯一）")
  lines.push("  name: 'my-app',")
  if (wantExposes) lines.push(EXPOSES_EXAMPLE[framework])
  if (wantRemotes) lines.push(REMOTES_EXAMPLE)
  lines.push('  // 可选：远程需要启动期初始化（全局样式/组件/locale）时声明入口文件——')
  lines.push('  // 默认导出 setup(context) 应用级执行一次；可选具名导出 onSession(context)')
  lines.push('  // 按宿主 sessionKey 去重执行。缺省 = 无初始化行为（普通 expose 语义不变）')
  lines.push("  // setup: './src/fulgurjs/setup.ts',")
  lines.push(sharedExample(framework))
  lines.push(`} satisfies FederationOptions`)
  if (role === 'consumer' || role === 'dual') {
    lines.push('')
    lines.push(HOST_PAGES_COMMENT)
  }
  lines.push('')
  return lines.join('\n')
}

/** 兼容导出：默认场景（Vue 双角色）的起步模板（writeConfigTemplate 无参形态使用） */
export const STARTER_CONFIG = starterConfigFor({ framework: 'vue', role: 'dual' })

export type TemplateResult = 'written' | 'exists'

/** 写出起步模板；已存在且非本工具产物时拒绝覆盖（--force 由调用方传参放开） */
export async function writeConfigTemplate(target: string, force = false, scenario: InitScenario = { framework: 'vue', role: 'dual' }): Promise<TemplateResult> {
  if (fs.existsSync(target) && !force) {
    return 'exists'
  }
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true })
  fs.writeFileSync(path.resolve(target), starterConfigFor(scenario))
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

const APP_ENTRY_NOTE: Record<InitFramework, string> = {
  vue: `5. Vue 应用代码唯一 API 入口：import { loadRemote, remoteComponent, createHostPages, provideAppContext, getAppContext, clearAppContext, definePages, remoteSchema } from '@fulgurjs/federation/vue'
   （完整子应用桥接另加 createVueBridgeApp / defineBridgeApp；URL 同步另加 createVueBridgeNavigation / connectVueBridgeRouter——同一入口。
    框架无关模块（纯 JS/TS 消费、无 Vue）用 @fulgurjs/federation/runtime）`,
  react: `5. React 应用代码唯一 API 入口：import { loadRemote, remoteComponent, useLoadRemote, RemoteErrorBoundary, createReactHostPages, provideAppContext, getAppContext, clearAppContext, definePages, remoteSchema } from '@fulgurjs/federation/react'
   （完整子应用桥接另加 createReactBridgeApp / defineBridgeApp；URL 同步另加 createReactBridgeNavigation / createReactBridgeRouter——同一入口。
    框架无关模块（纯 JS/TS 消费、无 React）用 @fulgurjs/federation/runtime）`,
}

/** 按场景输出核对清单（UX-03：不施加与场景无关的使用规则） */
export function checklistFor(scenario: InitScenario): string[] {
  const { framework, role } = scenario
  const out: string[] = []
  const provide = role === 'provider' || role === 'dual'
  const consume = role === 'consumer' || role === 'dual'
  out.push('1. 安装依赖：npm/pnpm add @fulgurjs/federation')
  if (provide) {
    out.push('2. expose 目标按用途分类：普通组件/函数模块可直接 expose（使用方 remoteComponent/loadRemote 消费）；')
    out.push('   作为「页面」接入宿主页面路由表时才要求独立页（页面从路由取参）；组件必填 props 给默认值（BLD-003）')
  }
  if (consume) {
    out.push('3. 消费方式按需选择：普通组件/模块用 remoteComponent/loadRemote（不需要页面表、不需要桥接配置）；')
    out.push('   完整子应用（自带 Router/store）用桥接 createVueBridgeApp/createReactBridgeApp——宿主只配挂载前缀与入口，')
    out.push('   子应用保留自己的 Router 与业务菜单，不逐页登记内部页面')
  }
  out.push('4. shared 里只列「项目实际安装且跨应用共享」的库，跨应用同实例的（vue/react/react-dom/router/store）配 singleton: true；')
  out.push('   独立 Router/store 的完整子应用隔离设计是合法的——不是所有共享项都必须 singleton')
  if (consume) {
    out.push('5. 远程需要启动期初始化（全局组件/样式/locale 等）时，在 fulgurjs.config.ts 的 setup 声明入口文件：')
    out.push('   默认导出 setup(context) 应用级执行一次（容器首次被加载业务模块前）；可选具名导出 onSession(context)')
    out.push('   按宿主 sessionKey 去重执行（换账号/重登自动重跑）。跨应用传值走 context 函数：宿主 provideAppContext 写入')
    out.push('   （退出时 clearAppContext 清理），远程 setup/onSession 用 getAppContext / requireAppContext 消费')
  }
  out.push(APP_ENTRY_NOTE[framework])
  out.push('6. dev 冷启动首轮 30~60s 有预构建窗口（瞬时 504/"ce"，DEV-010）：先真实打开页面预热再做断言')
  out.push('7. 配置解释：fulgurjs explain；部署体检：fulgurjs doctor --base <URL> --apps <部署子目录...>')
  if (consume) {
    out.push('   （--apps 是站点根下的部署子目录，不是容器名）')
    out.push('8. 仅逐页接入的宿主：页面契约核对 fulgurjs check-pages（--manifest/--site 指定远程 manifest 来源）；')
    out.push('   未配置 hostPages 的工程运行 check-pages 会明确提示「未配置该能力」，不产出伪核对')
  } else {
    out.push('8. 逐页接入（宿主页面路由表）是可选项——纯提供方无需 check-pages/hostPages')
  }
  out.push('9. 部署语义：remoteEntry/manifest/index.html 必须 no-cache（严禁 immutable）；带 hash 的 assets 长缓存')
  return out
}

/** 兼容导出：默认场景（Vue 双角色）清单 */
export const COMMON_CHECKLIST = checklistFor({ framework: 'vue', role: 'dual' })

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
    lines.push('    页面路由表：（无 hostPages 导出——未用逐页接入，check-pages 不适用）')
  }
  return lines
}

/** 校验配置并生成完整报告（校验失败以 Error 抛出，三段式文案来自配置加载器） */
export async function inspectConfig(configPath: string): Promise<string> {
  const loaded = await loadAppConfig(configPath)
  const options = loaded.options!
  const isHost = Object.keys(options.remotes ?? {}).length > 0
  const isRemote = Object.keys(options.exposes ?? {}).length > 0 || !!options.setup
  const role: InitRole = isHost && isRemote ? 'dual' : isHost ? 'consumer' : 'provider'
  // 框架从应用 package.json 判断；判断不了按 vue 输出入口提示并注明判断依据
  let framework: InitFramework = 'vue'
  let frameworkNote = ''
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(loaded.appRoot, 'package.json'), 'utf8')) as Parameters<typeof detectFrameworkFromPackageJson>[0]
    const detected = detectFrameworkFromPackageJson(pkg)
    if (detected) framework = detected
    else frameworkNote = '\n   （未能从 package.json 判断框架——以下入口提示按 Vue 给出；React 项目请改用 @fulgurjs/federation/react）'
  } catch {
    frameworkNote = '\n   （未读取到应用 package.json——以下入口提示按 Vue 给出；React 项目请改用 @fulgurjs/federation/react）'
  }
  const out: string[] = []
  out.push(`${MARK} 配置校验通过：单项目形态（默认导出 = federation() 选项）`)
  out.push('应用摘要：')
  out.push(...appModeSummary(loaded))
  out.push('\n── vite.config.ts plugins 接入块（这就是全部联邦接入代码） ──')
  out.push(viteSnippetForAppMode(loaded.appRoot))
  out.push('\n── 接入核对清单（按本配置的角色生成，与具体项目无关） ──')
  out.push(...checklistFor({ framework, role }).map((line) => (line.startsWith('5.') ? line + frameworkNote : line)))
  return out.join('\n')
}
