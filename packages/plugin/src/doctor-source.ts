/** 离线接入预检：只加载声明配置，业务入口/Vite 配置仅读取，不运行应用或发 HTTP 请求。 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { init, parse } from 'es-module-lexer'
import { loadAppConfig } from './app-config'
import type { DoctorCheck } from './doctor'

// esbuild 是 CJS 包且内部动态 require node 内置模块：静态 import 进 ESM 的 cli bundle
// 会在运行时报 "Dynamic require of fs"。与 app-config.resolveEsbuild 同模式：运行时解析。
const requireFromHere = createRequire(import.meta.url)
let cachedTransform: ((input: string, options: { loader: 'ts' | 'tsx'; target: string }) => Promise<{ code: string }>) | undefined
const esbuildTransform = () => {
  if (!cachedTransform) {
    const esb = requireFromHere('esbuild') as typeof import('esbuild')
    cachedTransform = esb.transform.bind(esb)
  }
  return cachedTransform
}

export interface SourceDoctorReport {
  checks: DoctorCheck[]
  failed: boolean
  /** False when a source dependency could not be followed or the bounded scan stopped. */
  complete: boolean
  filesScanned: number
  manualChecks: string[]
  integrationFiles: { required: string[]; optional: string[]; existing: string[] }
}

const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '/index.ts', '/index.tsx', '/index.js', '/index.vue']

export async function runSourceDoctor(configPath: string): Promise<SourceDoctorReport> {
  let loaded: Awaited<ReturnType<typeof loadAppConfig>>
  try {
    loaded = await loadAppConfig(configPath)
  } catch (error) {
    // 预检的职责就是发现确定的配置错误：缺 expose/setup 文件等加载失败按 FAIL 报告
    // （CLI 退出 1），不是用法错误（退出 2）。三段式信息从 appConfigError 原文提取。
    const message = error instanceof Error ? error.message : String(error)
    const sections = message.split('\n')
    return {
      checks: [{
        app: '(config)', item: '配置加载', level: 'FAIL',
        symptom: sections[0]?.replace(/^\[fulgurjs:[^\]]+\]\s*/, '') ?? message,
        cause: message.match(/根因：(.+)/)?.[1],
        fix: message.match(/修法：(.+)/)?.[1],
      }],
      failed: true, complete: false, filesScanned: 0, manualChecks: [],
      integrationFiles: { required: [], optional: [], existing: [] },
    }
  }
  const root = fs.realpathSync(loaded.appRoot)
  const options = loaded.options
  const app = options.name
  const checks: DoctorCheck[] = []
  const pending: string[] = []
  const seen = new Set<string>()
  const imports = new Set<string>()
  const sources = new Map<string, string>()
  let complete = true
  const relative = (file: string) => path.relative(root, file).split(path.sep).join('/')
  const within = (file: string) => file === root || file.startsWith(root + path.sep)
  const add = (item: string, level: DoctorCheck['level'], symptom: string, cause?: string, fix?: string) => {
    checks.push({ app, item, level, symptom, cause, fix })
  }
  const resolveSource = (value: string, parent = root): string | undefined => {
    const clean = value.split(/[?#]/)[0]
    const file = /^(?:\/?@\/|~\/)/.test(clean)
      ? path.join(root, 'src', clean.replace(/^(?:\/?@\/|~\/)/, ''))
      : path.resolve(parent, clean)
    for (const ext of extensions) {
      const candidate = file + ext
      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue
      const real = fs.realpathSync(candidate)
      return real
    }
    return undefined
  }
  const required: string[] = [relative(loaded.configPath)]
  // Vite 配置可能通过辅助函数注册插件：静态信息不足只 WARN，不把未知当缺陷或通过。
  const viteFiles = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'].filter(file => fs.existsSync(path.join(root, file)))
  if (viteFiles.length !== 1) add('Vite 插件接线', 'WARN', '未找到唯一常规 Vite 配置，无法确认插件注册。', '可能使用自定义 --config 或多份环境配置。', '在实际 Vite plugins 中注册 federation(fulgurjsConfig)；init --plan 可预览受支持配置的接线。')
  else {
    const code = fs.readFileSync(path.join(root, viteFiles[0]), 'utf8')
    add(viteFiles[0], 'WARN', 'Vite 配置存在；插件调用、动态 base 与部署对应关系仍需核对。',
      '本地预检不执行 Vite 配置；导入插件或写了注释并不能证明 plugins 实际启用。',
      code.includes('@fulgurjs/federation') ? '运行真实 dev/build；确认当前配置调用 federation，生产 base/远程 prod 前缀与服务器映射一致。' : '检查插件是否由辅助函数注册；否则用 init --plan 预览接线，不要仅创建 fulgurjs.config.ts。')
  }
  if (fs.existsSync(path.join(root, '.fulgurjs-init-pending.json'))) add('接入写入恢复', 'FAIL', '存在被中断的 init 写入记录。', '此前写入尚未完成或回退遇到手工编辑。', '运行 fulgurjs init --rollback；若提示文件被编辑，按恢复记录人工合并后再执行。')
  for (const [key, expose] of Object.entries(options.exposes ?? {})) {
    const file = resolveSource(typeof expose === 'string' ? expose : expose.import)
    if (file) { pending.push(file); required.push(relative(file)); add(`expose ${key}`, 'PASS', `源文件存在：${relative(file)}`) }
    else {
      complete = false
      add(`expose ${key}`, 'FAIL', '暴露源文件缺失或无法解析。',
        '配置指向的文件不能在加载时才发现缺失。', '核对 exposes 路径、后缀和别名；共享目录另用其所属项目门禁核实。')
    }
  }
  if (options.setup) {
    const file = resolveSource(options.setup)
    if (file) pending.push(file)
    else { complete = false; add('setup', 'FAIL', 'setup 源文件不存在或无法解析。', '初始化入口不能在加载时才发现缺失。', '修正 setup 路径；没有初始化需求则删除 setup 配置。') }
  }
  const html = path.join(root, 'index.html')
  let hasEntry = false
  if (fs.existsSync(html)) for (const tag of fs.readFileSync(html, 'utf8').matchAll(/<script\b[^>]*>/gi)) {
    const entry = tag[0].match(/\bsrc=["']([^"']+)["']/i)?.[1]
    if (!entry || !/\btype=["']module["']/i.test(tag[0]) || /^(?:https?:)?\/\//.test(entry)) continue
    const file = resolveSource(entry.replace(/^\//, ''))
    if (file) { pending.push(file); hasEntry = true }
    else {
      complete = false
      add('index.html 入口', 'FAIL', `本地 module 入口不存在：${entry}`, '入口引用无法解析，不能只检查 expose 路径。', '修正 index.html script src，或恢复实际入口；自定义虚拟入口使用其插件构建检查核实。')
    }
  }
  if (Object.keys(options.remotes ?? {}).length && !hasEntry) complete = false
  await init
  while (pending.length && seen.size < 256) {
    const file = pending.shift()!
    if (!within(file)) {
      complete = false
      add('目录外源码', 'WARN', '已配置的源文件存在于应用目录之外；未读取文件内容。', '单项目预检不展开 monorepo 外部目录。', '通过该共享目录所属项目的类型与构建门禁核实；合法的跨目录 expose 不会被判为缺文件。')
      continue
    }
    if (seen.has(file) || /\.d\.[cm]?ts$/.test(file) || relative(file).includes('fulgurjs/types/')) continue
    if (!/\.(?:[cm]?js|jsx|ts|tsx|vue)$/.test(file)) continue // Assets are not application code.
    seen.add(file)
    const raw = fs.readFileSync(file, 'utf8')
    if (file.endsWith('.vue') && /<script\b[^>]*\bsrc\s*=/.test(raw)) complete = false
    const script = file.endsWith('.vue')
      ? [...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join('\n')
      : raw
    try {
      const { code } = await esbuildTransform()(script, { loader: file.endsWith('.tsx') || file.endsWith('.jsx') ? 'tsx' : 'ts', target: 'esnext' })
      sources.set(relative(file), code)
      if (/import\.meta\.glob/.test(code)) complete = false // Do not claim expansion of a runtime/module glob.
      for (const item of parse(code)[0]) {
        if (!item.n) { if (item.d >= 0) complete = false; continue }
        imports.add(item.n)
        if (/\.d\.[cm]?ts(?:[?#]|$)/.test(item.n)) {
          add(relative(file), 'FAIL', `运行时代码导入了类型声明：${item.n}`, '生成声明不是可执行模块，不能作为组件/工具运行时注册。', '只使用 import type，或引用真正的远程模块；检查 glob 是否排除 **/*.d.ts。')
        }
        if (item.n.startsWith('@fulgurjs/federation/') && !['@fulgurjs/federation/vue', '@fulgurjs/federation/react', '@fulgurjs/federation/runtime'].includes(item.n)) {
          add(relative(file), 'WARN', `应用代码使用非推荐入口：${item.n}`, '内部模块不是应用接入路径；静态预检不判断该路径是否仍被 exports 允许。', 'Vue 用 /vue，React 用 /react，框架无关模块用 /runtime；类型注册表的 import type 不应成为运行时代码。')
        }
        if (item.n.startsWith('.') || /^(?:\/?@\/|~\/)/.test(item.n)) {
          // 构建资源（图片/字体/媒体/样式/数据）不是可静态检查的源码依赖：跳过跟随，
          // 不 WARN、不降低 complete（与下方"资源不是应用代码"同一口径）。
          if (/\.(?:[cm]?js|jsx|ts|tsx|vue)$/.test(item.n.split(/[?#]/)[0]) || !/\.[a-z0-9]+$/i.test(item.n.split(/[?#]/)[0])) {
            const next = resolveSource(item.n, path.dirname(file))
            if (next) pending.push(next)
            else { complete = false; add(relative(file), 'WARN', '有本地导入无法跟随，源码检查不是完整依赖闭包。', '可能使用自定义别名、虚拟模块、资源或目录外源码。', '按项目 tsconfig/Vite 配置完成解析与类型检查；本命令不猜自定义别名。') }
          }
        }
      }
    } catch {
      complete = false
      add(relative(file), 'WARN', '本文件无法静态解析，未把它判定为检查通过。', '可能包含宏、自定义语法或源码错误。', '运行本项目有效配置的类型/构建检查；不要用此报告代替编译。')
    }
  }
  if (pending.length) complete = false
  for (const [file, code] of sources) {
    if (/setActivePinia\s*\(/.test(code) && /\bawait\b/.test(code)) {
      add(file, 'WARN', '同一模块使用 setActivePinia 和 await，需要确认异步状态归属。',
        '等待期间另一个应用可能改变全局 activePinia；静态扫描不能证明当前回调一定取错实例。',
        '在回调中传入本应用 pinia，或用 /vue 的 bindStoreToApp 绑定实际实例；组件内保留原生注入，不把库单例当成业务 store 实例。')
    }
    if (/define(?:BridgeApp|Application)\s*\(/.test(code) && /createWeb(?:Hash)?History\s*\(/.test(code) && !/createMemoryHistory/.test(code)) {
      add(file, 'WARN', '桥接装配中出现浏览器 history，需确认它只在独立启动时执行。',
        '子应用直接写浏览器历史可能重复前缀或添加意外 hash；此项是人工核查，不是已复现缺陷。',
        '统一装配用 defineApplication；按 context.mode 选择 web/memory history，桥接返回 { app, router }。')
    }
    for (const match of code.matchAll(/import\.meta\.glob(?:Eager)?\s*\(\s*(\[[\s\S]*?\]|["'][^"']+["'])/g)) {
      if (/\.ts/.test(match[1]) && !/![^"']*\.d\.ts/.test(match[1])) {
        add(file, 'WARN', '发现扫描 .ts 的业务 glob，未看到排除 .d.ts 的负模式。',
          '自动生成声明只用于类型；不能被组件/工具注册器作为运行模块执行。其他 exclude 配置需人工核实。',
          '在 glob 中排除 **/*.d.ts 和应用装配目录；不要导入生成声明的内容。')
      }
    }
  }
  const shared = Array.isArray(options.shared) ? options.shared : Object.keys(options.shared ?? {})
  if (Object.keys(options.remotes ?? {}).length && options.dts !== false) {
    add('远程类型接线', 'WARN', '远程类型启用；本地扫描不能证明声明已同步且被 IDE 的有效 tsconfig 包含。',
      '首次生成、远程未启动、自定义 include/references 或 IDE 项目选择都会影响提示。',
      '启动提供方后运行 fulgurjs types；在实际消费文件验证正确 props 和错误 props 的正负类型样例。勿用 any 消除诊断，也无需清空全部业务存量错误。')
  }
  const isImported = (key: string) => [...imports].some(value => value === key || value.startsWith(key + '/'))
  for (const key of shared) {
    const hint = Array.isArray(options.shared) ? undefined : options.shared?.[key]
    const local = typeof hint === 'string' ? hint : hint?.import
    const target = (typeof local === 'string' ? local : key).replace(/\/$/, '')
    if (Object.keys(options.remotes ?? {}).length && complete && local !== false && !isImported(target)) {
      add(`shared.${key}`, 'WARN', '已扫描入口没有发现此共享库的运行时导入。',
        '可能是多余 provider，也可能由扫描之外的入口使用；不能仅凭安装了依赖就要求共享。',
        '确认真实用途；完整子应用自有的状态库通常由子应用提供，不要求未使用它的宿主重复提供。')
    }
  }
  // D02 正向风险：Vue 消费方未声明 shared.vue。证据只有「本地确实使用 vue + 配置了 remotes
  // 且本地 shared 无 vue」——远程配置与最终打包结果未知，不据此断言双实例已发生。
  const usesVue = [...imports].some(v => v === 'vue' || v.startsWith('vue/') || v === '@fulgurjs/federation/vue')
  if (Object.keys(options.remotes ?? {}).length && usesVue && !shared.includes('vue')) {
    add('shared.vue', 'WARN', '本地是 Vue 应用且配置了远程消费，但 shared 未声明 vue。',
      '组件直渲染要求远程组件与消费方渲染器使用同一 Vue 实例；本地未声明时无法从静态扫描确认是否收敛——这是接入风险，尚未证实存在重复实例（远程可能未共享 vue、或仅暴露纯 TS 模块）。',
      '消费远程 Vue 组件的两侧都在 federation({ shared }) 声明 vue（建议 singleton），并核对 shareScope 一致；运行时若实例分裂，remoteComponent 边界会报 MFU-019。仅消费纯 TS 模块可忽略本项。')
  }
  for (const [key, remote] of Object.entries(options.remotes ?? {})) {
    if (typeof remote === 'function') {
      add(`remotes.${key}`, 'WARN', '远程地址由运行时函数决定，未执行该函数。', '离线预检不执行业务远程地址回调。', '在实际 dev/prod 链路核对函数返回值、入口类型和网络错误。')
    } else if (typeof remote === 'string') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/.test(remote)) {
        add(`remotes.${key}`, 'WARN', '单地址远程指向本机开发服务，生产也会使用该地址。',
          '没有显式区分开发与生产地址。', '使用 { dev: 开发地址, prod: 部署路径或URL }；生产不借用开发服务器。')
      }
    } else if (!remote.dev || !remote.prod) {
      add(`remotes.${key}`, 'WARN', '远程地址未同时声明 dev/prod。', '缺省回退可能把开发地址带入生产。', '在同一配置中明确写出 dev 和 prod，再核对部署子路径。')
    }
  }
  add('源码扫描范围', complete ? 'PASS' : 'WARN', `读取 ${seen.size} 个应用源文件${complete ? '；静态依赖扫描完成。' : '；扫描不完整，不能据此宣称接入成功。'}`,
    complete ? undefined : '存在动态路径、自定义别名或超过256文件的依赖图。', complete ? undefined : '完成构建、有效项目TS和实际浏览器验收；此命令只做接入预检。')
  return {
    checks, failed: checks.some(check => check.level === 'FAIL'), complete, filesScanned: seen.size,
    manualChecks: [
      '完整子应用：复用一份装配代码；Vue 返回尚未安装的 app/router，守卫先准备好。',
      'Vue 远程组件：需要的祖先注入、全局组件、权限指令和主题必须在实际消费 app 中存在；不会自动复制整个业务 app。',
      '业务 store 实例与共享库实例是两件事；并行容器不能靠一个可变模块变量区分状态归属。',
      '源码预检不证明挂载、深链、会话、卸载和错误恢复通过；这些由实际验收确认。',
      '直渲染空白排查边界：模块导出成功≠组件挂载≠业务就绪；合法 null/注释节点/Suspense 等待/KeepAlive 停用不是故障。插件只观察到外层模块加载——内部 loader、业务请求与分支进入情况须用 props 到达、网络面板与远程自身日志核实，不从「无 pageerror/无 chunk 请求」直接推断根因。',
    ],
    integrationFiles: {
      required: [...new Set(required)],
      optional: ['setup：只有远程初始化/全局组件/Provider等需求才配置', '会话/context：只有宿主登录态和跨应用上下文需求才接入', 'hostPages：仅逐页接入；完整子应用不重复登记内部菜单'],
      existing: ['vite.config：注册 federation', '独立 main：调用 application.start', '原 router/守卫：复用路由，按运行模式创建 history', '宿主视图：声明挂载前缀和 createVueBridgeApp/createReactBridgeApp'],
    },
  }
}
