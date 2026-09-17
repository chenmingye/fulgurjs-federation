/**
 * W1 init：fulgur.config.ts 驱动的迁移生成器（主包内置 bin，决策见排期文档 §4）。
 *
 * 两类动作：
 * - generate：整文件生成（模板 = 已验证最终形态，见 init-templates.ts 提取脚本）；
 * - patch：锚点式外科手术（vite 配置 / main.ts / permission.ts / LayoutContent /
 *   staticRouter / 表单页 props / 详情页联邦分支 / Redirect 撞名 / 形状守卫 / env）。
 *   每补丁携带幂等 marker；锚点缺失 = 项目结构与 jeecg/yudao 基线不符，显式报错指路。
 *
 * 验收口径：从 svn 全新拷贝出发零手工编辑完成接入（排期文档 W1）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadFulgurConfig, type FulgurAppConfig, type FulgurRepoConfig } from './config'
import {
  T_FULGUR_PAGES,
  T_FULGUR_BRIDGE,
  T_FULGUR_DEMO,
  T_BPM_BOOT,
  T_BPM_TASKCARD,
  T_LOWCODE_BOOT,
  T_LOWCODE_INFOCARD,
  T_BPM_OPTIMIZE,
  T_LOWCODE_OPTIMIZE,
  T_MODULE_DESIGN,
} from './init-templates'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MARK = '[fulgur:init]'

export interface InitReportEntry {
  file: string
  action: 'generate' | 'patch' | 'skip'
  note?: string
}

export interface InitResult {
  report: InitReportEntry[]
  errors: string[]
}

// ─────────────────────────── 基础设施 ───────────────────────────

function substitute(body: string, vars: Record<string, string>): string {
  let out = body
  for (const [k, v] of Object.entries(vars)) out = out.split(k).join(v)
  return out
}

function ensureDirFor(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
}

/**
 * 整文件生成：有 marker 视为本工具产物（幂等跳过）。
 * - overwrite=true：接管型文件（optimizeDeps 清单/.env/NGINX conf 等）——先备份
 *   <file>.fulgur-orig.bak 再覆盖，保证零手工编辑且可回溯；
 * - overwrite=false：存在外部文件则拒绝（防覆盖人工修改），--force 同义放开。
 */
function generateFile(abs: string, content: string, report: InitReportEntry[], force = false, overwrite = false): void {
  if (fs.existsSync(abs)) {
    const prev = fs.readFileSync(abs, 'utf8')
    if (prev.includes(MARK)) {
      report.push({ file: abs, action: 'skip', note: '已存在（本工具产物，幂等跳过）' })
      return
    }
    if (!force && !overwrite) {
      report.push({ file: abs, action: 'skip', note: '存在非本工具文件，拒绝覆盖（--force 可强制）' })
      return
    }
    fs.copyFileSync(abs, `${abs}.fulgur-orig.bak`)
    report.push({ file: abs, action: 'generate', note: '已备份原文件为 *.fulgur-orig.bak' })
  }
  ensureDirFor(abs)
  // 生成内容统一携带 marker（幂等重跑识别）；原内容无 marker 时按文件类型补注释头
  const marked = content.includes(MARK)
    ? content
    : /\.vue$/.test(abs)
      ? `<!-- ${MARK} generated — 可用 fulgur init 幂等重建 -->\n${content}`
      : `// ${MARK} generated — 可用 fulgur init 幂等重建\n${content}`
  fs.writeFileSync(abs, marked)
  if (!fs.existsSync(`${abs}.fulgur-orig.bak`)) report.push({ file: abs, action: 'generate' })
}

interface PatchOp {
  label: string
  /** 幂等标记：replace 后的文件包含它即视为已应用 */
  marker: string
  find: string
  replace: string
  /** 允许多处命中（默认恰好 1 处，防锚点漂移） */
  allowMany?: boolean
}

/** 锚点式补丁：锚点唯一命中才动手；缺失/多义都显式报错，绝不静默 */
function patchFile(abs: string, ops: PatchOp[], report: InitReportEntry[], errors: string[], force = false): void {
  if (!fs.existsSync(abs)) {
    errors.push(`[fulgur:init] 锚点补丁目标不存在：${abs}\n根因：工程路径与 fulgur.config.ts 的 apps[].path 不符\n修法：核对 config.apps[].path 与 root 下的实际目录名`)
    return
  }
  let src = fs.readFileSync(abs, 'utf8')
  // 行尾自适应：jeecg/yudao 部分文件为 CRLF——锚点按文件行尾匹配，替换内容同化行尾
  const eol = (src.slice(0, 4000).match(/\r\n/g)?.length ?? 0) > (src.slice(0, 4000).split('\n').length - 1) / 2 ? '\r\n' : '\n'
  const toFileEol = (t: string) => t.replace(/\r?\n/g, eol)
  let touched = 0
  for (const op of ops) {
    if (src.includes(op.marker)) {
      report.push({ file: abs, action: 'skip', note: `${op.label}（已应用）` })
      continue
    }
    const hits = src.split(toFileEol(op.find)).length - 1
    if (hits === 0) {
      errors.push(
        `[fulgur:init] 补丁锚点未命中：${abs} :: ${op.label}\n根因：该文件与 jeecg/yudao 基线结构不符（已手工改过或版本不同）\n修法：按迁移指南手工落此改动（锚点：${op.find.split('\n')[0].slice(0, 80)}）`,
      )
      continue
    }
    if (hits > 1 && !op.allowMany) {
      errors.push(`[fulgur:init] 补丁锚点多义（${hits} 处）：${abs} :: ${op.label}\n根因：锚点字符串不够唯一\n修法：人工核对该文件后处理`)
      continue
    }
    src = src.split(toFileEol(op.find)).join(toFileEol(op.replace))
    touched += 1
  }
  if (touched > 0) {
    ensureDirFor(abs)
    fs.writeFileSync(abs, src)
    report.push({ file: abs, action: 'patch', note: `${touched} 处锚点补丁` })
  }
}

const rel = (root: string, appPath: string, ...seg: string[]) => path.join(root, appPath, ...seg)

function sharedLiteral(shared?: FulgurAppConfig['shared']): string {
  const s = shared ?? {
    vue: { singleton: true, requiredVersion: '^3.4.0' },
    'vue-router': { singleton: true, requiredVersion: '^4.4.5' },
    pinia: { singleton: true, requiredVersion: '^2.1.7' },
  }
  const entries = Object.entries(s).map(([k, v]) => {
    const opts = [v.singleton ? 'singleton: true' : '', v.requiredVersion ? `requiredVersion: '${v.requiredVersion}'` : ''].filter(Boolean)
    return `          '${k}': { ${opts.join(', ')} },`
  })
  return `shared: {\n${entries.join('\n')}\n        },`
}

function exposesLiteral(exposes: Record<string, string>, indent = '          '): string {
  return Object.entries(exposes)
    .map(([k, v]) => `${indent}'${k}': '${v}',`)
    .join('\n')
}

/** fulgurPages 的页面表条目（route/name/spec?/title?，spec 显式覆盖语义见 defineFulgurPages） */
function pagesTableLiteral(pages: NonNullable<FulgurAppConfig['host']>['pages']): string {
  return pages
    .map((p) => {
      const fields = [`route: '${p.route}'`]
      if (p.name) fields.push(`name: '${p.name}'`)
      if (p.spec) fields.push(`spec: '${p.spec}'`)
      if (p.title) fields.push(`title: '${p.title}'`)
      return `    { ${fields.join(', ')} },`
    })
    .join('\n')
}

// ─────────────────────────── package.json 依赖 ───────────────────────────

function patchPkgDep(cfg: FulgurRepoConfig, app: FulgurAppConfig, report: InitReportEntry[], errors: string[], force: boolean): void {
  const abs = rel(cfg.root, app.path, 'package.json')
  // link 路径：同仓相对路径优先（testbed 布局）；跨树（如临时目录验收）回退绝对路径
  let pluginLink = path.relative(rel(cfg.root, app.path), PLUGIN_ROOT).split(path.sep).join('/')
  const probe = path.resolve(rel(cfg.root, app.path), pluginLink)
  if (path.resolve(probe) !== path.resolve(PLUGIN_ROOT)) pluginLink = PLUGIN_ROOT
  // 锚点候选：admin 尾依赖为 xss，bpm/lowcode 为 xml-js
  const anchors = ['"xss": "^1.0.15"', '"xml-js": "^1.6.11"']
  let applied = false
  for (const anchor of anchors) {
    const before = fs.readFileSync(abs, 'utf8')
    if (before.includes('"@fulgur/federation":')) {
      applied = true
      break
    }
    if (!before.includes(anchor)) continue
    patchFile(
      abs,
      [
        {
          label: '添加 @fulgur/federation link 依赖',
          marker: '"@fulgur/federation":',
          find: anchor,
          replace: `${anchor},\n    "@fulgur/federation": "link:${pluginLink}"`,
        },
      ],
      report,
      errors,
      force,
    )
    applied = true
    break
  }
  if (!applied && !fs.readFileSync(abs, 'utf8').includes('"@fulgur/federation":')) {
    errors.push(
      `[fulgur:init] package.json 依赖锚点未命中：${abs}\n根因：dependencies 末项既不是 xss 也不是 xml-js（依赖版本与 jeecg/yudao 基线不同）\n修法：手工在 dependencies 加 "@fulgur/federation": "link:${pluginLink}"`,
    )
  }
}

// ─────────────────────────── env 文件 ───────────────────────────

/**
 * 宿主 env 调整（补丁式，保留 svn 原文件内容）：
 * - .env：乾坤开关置 false（联邦平行通道）
 * - .env.development：代理/域名指向本地后台
 * - .env.production：追加 COMPRESS=none（compress 插件对 undefined 崩溃）
 * 远程应用不生成 env（后台地址由 testbed scripts/sync-backend-env.mjs 在启动时同步）。
 */
function generateAppEnvFiles(cfg: FulgurRepoConfig, app: FulgurAppConfig, report: InitReportEntry[], errors: string[], force: boolean): void {
  if (!app.host) return
  const backend = `${cfg.env.backendOrigin}${cfg.env.backendContext}`
  patchFile(
    rel(cfg.root, app.path, '.env'),
    [
      {
        label: '乾坤开关（联邦平行通道）',
        marker: `VITE_GLOB_APP_OPEN_QIANKUN=${cfg.env.qiankun}`,
        find: 'VITE_GLOB_APP_OPEN_QIANKUN=true',
        replace: `VITE_GLOB_APP_OPEN_QIANKUN=${cfg.env.qiankun}`,
      },
    ],
    report,
    errors,
    force,
  )
  patchFile(
    rel(cfg.root, app.path, '.env.development'),
    [
      {
        label: 'dev 代理指向本地后台',
        marker: `VITE_PROXY=[["${cfg.env.backendContext}","${backend}/"]`,
        find: 'VITE_PROXY=[["/demo","http://localhost:8085/demo/"],["/upload","http://localhost:8085/demo/sys/common/upload"]]',
        replace: `VITE_PROXY=[["${cfg.env.backendContext}","${backend}/"],["/upload","${backend}/sys/common/upload"]]`,
      },
      {
        label: 'dev 域名指向本地后台',
        marker: `VITE_GLOB_DOMAIN_URL=${backend}/`,
        find: 'VITE_GLOB_DOMAIN_URL=http://localhost:8085/demo/',
        replace: `VITE_GLOB_DOMAIN_URL=${backend}/`,
      },
    ],
    report,
    errors,
    force,
  )
  patchFile(
    rel(cfg.root, app.path, '.env.production'),
    [
      {
        label: 'prod 压缩关闭（compress 插件对 undefined 崩溃）',
        marker: `VITE_BUILD_COMPRESS=${cfg.env.compress}`,
        find: 'VITE_APP_SUB_lowcode=/lowcode/index.html',
        replace:
          'VITE_APP_SUB_lowcode=/lowcode/index.html\n' +
          `# [fulgur:init] 压缩插件对 undefined 崩溃（compress.ts 读 split），显式 ${cfg.env.compress} 关闭\n` +
          `VITE_BUILD_COMPRESS=${cfg.env.compress}\n` +
          'VITE_BUILD_COMPRESS_DELETE_ORIGIN_FILE=false',
      },
    ],
    report,
    errors,
    force,
  )
}

function patchRootEnvBackend(cfg: FulgurRepoConfig, report: InitReportEntry[], errors: string[], force: boolean): void {
  patchFile(
    rel(cfg.root, '.env.backend'),
    [
      {
        label: 'BACKEND_ORIGIN_DEV 指向本地后台',
        marker: `BACKEND_ORIGIN_DEV=${cfg.env.backendOrigin}`,
        find: 'BACKEND_ORIGIN_DEV=http://localhost:8085',
        replace: `BACKEND_ORIGIN_DEV=${cfg.env.backendOrigin}`,
      },
      {
        label: 'QIANKUN_OPEN 开关（联邦平行通道）',
        marker: `QIANKUN_OPEN=${cfg.env.qiankun}`,
        find: 'QIANKUN_OPEN=true',
        replace: `QIANKUN_OPEN=${cfg.env.qiankun}`,
      },
    ],
    report,
    errors,
    force,
  )
}

// ─────────────────────────── 宿主（admin）───────────────────────────

function initHostApp(cfg: FulgurRepoConfig, app: FulgurAppConfig, report: InitReportEntry[], errors: string[], force: boolean, vars: Record<string, string>): void {
  const host = app.host!
  const remotesLiteral = Object.entries(host.remotes)
    .map(([k, v]) => `          '${k}': { dev: '${v.dev}', prod: '${v.prod}' },`)
    .join('\n')

  // 1) fulgurPages.ts（页面路由表 + 匹配器/工厂）
  const pagesFile = substitute(T_FULGUR_PAGES, vars).replace(
    '/*__PAGES_TABLE__*/',
    `\n${pagesTableLiteral(host.pages)}\n  `,
  )
  generateFile(rel(cfg.root, app.path, 'src/qiankun/fulgurPages.ts'), pagesFile, report, force)

  // 2) fulgurBridge.ts（token/user 桥 + 宿主 app 暴露）
  generateFile(
    rel(cfg.root, app.path, 'src/qiankun/fulgurBridge.ts'),
    substitute(T_FULGUR_BRIDGE, vars),
    report,
    force,
  )

  // 3) 演示页（可选）
  if (cfg.demo) {
    generateFile(rel(cfg.root, app.path, cfg.demo.componentSource), substitute(T_FULGUR_DEMO, vars), report, force)
  }

  // 4) vite.config.ts：import / target / emptyOutDir / sourcemap / 插件块（含 dev 空垫片）
  patchFile(
    rel(cfg.root, app.path, 'vite.config.ts'),
    [
      {
        label: 'import federation',
        marker: "import { federation } from '@fulgur/federation'",
        find: "import { createVitePlugins } from './build/vite/plugin'",
        replace: "import { federation } from '@fulgur/federation'\nimport { createVitePlugins } from './build/vite/plugin'",
      },
      {
        label: 'build.target es2022（TLA 需要）',
        marker: "target: 'es2022'",
        find: "      target: 'es2015',",
        replace:
          "      // es2015 → es2022：联邦 TLA（自动异步边界）要求 es2022+（DESIGN 已知差异 #3）\n" +
          "      target: 'es2022',",
      },
      {
        label: 'emptyOutDir（outDir 根外显式清空）',
        marker: 'emptyOutDir: true',
        find: '      outDir: OUTPUT_DIR,',
        replace:
          '      outDir: OUTPUT_DIR,\n' +
          '      // outDir 在项目根之外，vite 默认不清空——显式清空防历次构建旧 hash 残留累积\n' +
          '      emptyOutDir: true,',
      },
      {
        label: 'sourcemap inline → false（大工程 swc OOM 规避）',
        marker: 'sourcemap: false',
        find: "      sourcemap: 'inline',",
        replace:
          "      // sourcemap inline → false（三件套规避之一：3 万模块工程 inline sourcemap 触发 swc OOM）\n" +
          '      sourcemap: false,',
      },
      {
        label: '联邦插件块 + dev 空垫片',
        marker: 'fulgur:tab-page-empty-shim',
        find: '    plugins: createVitePlugins(viteEnv, isBuild, isQiankunMicro),',
        replace:
          `    plugins: [\n      ...createVitePlugins(viteEnv, isBuild, isQiankunMicro),\n` +
          `      // dev 诚实空垫片：demo 后台无 /demo/tab/page 端点（低代码「模块设计」列表接口），\n` +
          `      // 代理前拦截直出空页 jeecg Result——页面渲染"暂无数据"而非 404 报错 ${MARK}\n` +
          `      ...(isBuild\n        ? []\n        : [\n            {\n              name: 'fulgur:tab-page-empty-shim',\n              configureServer(server: any) {\n                server.middlewares.use('/demo/tab/page', (_req: any, res: any) => {\n                  res.setHeader('Content-Type', 'application/json; charset=utf-8')\n                  res.end(\n                    JSON.stringify({\n                      success: true,\n                      message: 'empty shim: demo backend has no /tab/page endpoint',\n                      code: 200,\n                      result: { records: [], total: 0, pages: 0 },\n                      timestamp: Date.now(),\n                    }),\n                  )\n                })\n              },\n            },\n          ]),\n` +
          `      // 联邦平行通道：宿主 + 双角色（exposes 表单组件供远程详情页消费）\n` +
          `      federation({\n        name: '${app.name}',\n        remotes: {\n${remotesLiteral}\n        },\n        exposes: {\n${exposesLiteral(app.remote?.exposes ?? {})}\n        },\n        // 宿主与子应用必须同实例：vue 全局响应性、useRouter 注入 key、getActivePinia\n        ${sharedLiteral(app.shared)}\n      }),\n    ],`,
      },
    ],
    report,
    errors,
    force,
  )

  // 5) main.ts：乾坤门控
  patchFile(
    rel(cfg.root, app.path, 'src/main.ts'),
    [
      {
        label: 'useGlobSetting import',
        marker: "import { useGlobSetting } from '/@/hooks/setting';",
        find: "import registerApps from '/@/qiankun/index';",
        replace:
          "import registerApps from '/@/qiankun/index';\nimport { useGlobSetting } from '/@/hooks/setting';",
      },
      {
        label: '乾坤门控（联邦平行通道）',
        marker: '联邦模式门控',
        find: '  registerApps();',
        replace:
          '  // 联邦模式门控：乾坤开关关闭（.env.backend QIANKUN_OPEN=false → VITE_GLOB_APP_OPEN_QIANKUN=false）\n' +
          '  // 时不启动乾坤注册，子应用页面走联邦平行通道（staticRouter 注册的 FULGUR_ROUTES）\n' +
          "  if (useGlobSetting().openQianKun === 'true') {\n    registerApps();\n  }",
      },
    ],
    report,
    errors,
    force,
  )

  // 6) permission.ts：联邦路径剔除（switch 分支内 + 注册前递归剔除）
  patchFile(
    rel(cfg.root, app.path, 'src/store/modules/permission.ts'),
    [
      {
        label: 'BACK 权限模式剔除联邦路径',
        marker: '联邦通道（fulgur）：/flowable/**',
        find:
          '          // update-begin--author:liaozhiyang---date:20240529---for：【TV360X-522】ai助手路由写死在前端\n' +
          '          routes = [PAGE_NOT_FOUND_ROUTE, ...routeList, ...staticRoutesList];',
        replace:
          '          // update-end--author:liaozhiyang---date:20240529---for：【TV360X-522】ai助手路由写死在前端\n' +
          `          // 联邦通道（fulgur）：/flowable/**、/lowcode/** 页面由 staticRouter 的 FULGUR_ROUTES ${MARK}\n` +
          '          // 承载（loadRemote 直渲染）。后台菜单为这两类路径生成的路由记录在宿主无法解析\n' +
          '          // component（恒为空），若注册会抢先匹配导致页面空白——此处剔除；\n' +
          '          // 菜单显示用 backMenuList（上面已生成），不受影响\n' +
          '          const isFederatedPath = (pth?: string) => {\n' +
          "            const norm = (pth || '').replace(/^\\/+/, '');\n" +
          "            return norm.startsWith('flowable/') || norm.startsWith('lowcode/');\n" +
          '          };\n' +
          '          routeList = routeList.filter((r) => !isFederatedPath(r.path));\n' +
          '          routes = [PAGE_NOT_FOUND_ROUTE, ...routeList, ...staticRoutesList];',
      },
      {
        label: '注册前递归剔除联邦空路由（各权限模式）',
        marker: 'pruneFederatedEmpties',
        find: '      routes.push(ERROR_LOG_ROUTE);',
        replace:
          `      // 联邦通道（fulgur）：后台菜单生成的联邦路径路由在宿主解析不出 component ${MARK}\n` +
          '      // （恒为空），若注册会抢先匹配导致页面空白——统一在注册前递归剔除；\n' +
          '      // 菜单显示用 backMenuList（已生成），不受影响\n' +
          '      const isFederatedPath = (pth?: string) => {\n' +
          "        const norm = (pth || '').replace(/^[/]+/, '');\n" +
          "        return norm.startsWith('flowable/') || norm.startsWith('lowcode/');\n" +
          '      };\n' +
          '      const pruneFederatedEmpties = (list: AppRouteRecordRaw[]): AppRouteRecordRaw[] =>\n' +
          '        list\n' +
          '          .map((r) => (r.children?.length ? { ...r, children: pruneFederatedEmpties(r.children as AppRouteRecordRaw[]) } : r))\n' +
          '          .filter((r) => !(isFederatedPath(r.path) && !r.component && !(r.children && r.children.length)));\n' +
          '      routes = pruneFederatedEmpties(routes);\n' +
          '      routes.push(ERROR_LOG_ROUTE);',
      },
    ],
    report,
    errors,
    force,
  )

  // 7) LayoutContent：联邦分支（模板/脚本/样式）
  patchFile(
    rel(cfg.root, app.path, 'src/layouts/default/content/index.vue'),
    [
      {
        label: '模板：联邦直渲染分支',
        marker: 'fulgurComp',
        find: '    <PageLayout v-if="!isSubAppRoute" />',
        replace:
          '    <PageLayout v-if="!isSubAppRoute" />\n' +
          '    <!-- 联邦分支：fulgur 页面直渲染（params+query 全量透传，fullPath 变化重挂载） -->\n' +
          '    <div v-else-if="fulgurComp" class="fulgur-view">\n' +
          '      <component :is="fulgurComp" :key="route.fullPath" v-bind="fulgurProps" />\n' +
          '    </div>',
      },
      {
        label: '脚本：联邦导入',
        marker: "from '/@/qiankun/fulgurPages'",
        find: "  import { queryAmisPageConfigById } from '@/components/amis/amisPageConfig.api';\n  //amis",
        replace:
          "  import { queryAmisPageConfigById } from '@/components/amis/amisPageConfig.api';\n  //amis\n  // 联邦\n  import { resolveFulgurPageFromPath, fulgurPageComponent } from '/@/qiankun/fulgurPages';\n  import { fulgurBridge } from '/@/qiankun/fulgurBridge';",
      },
      {
        label: '脚本：fulgurComp/fulgurProps',
        marker: '联邦分支：路由表能解析到的路径',
        find: '      useContentViewHeight();',
        replace:
          '      // 联邦分支：路由表能解析到的路径 → loadRemote 直渲染（优先于乾坤容器）\n' +
          '      const fulgurComp = computed(() => {\n' +
          '        const resolved = resolveFulgurPageFromPath(route.path);\n' +
          '        if (!resolved) return null;\n' +
          '        fulgurBridge();\n' +
          '        return fulgurPageComponent(resolved.spec, resolved.remote);\n' +
          '      });\n' +
          '      const fulgurProps = computed(() => {\n' +
          '        const resolved = resolveFulgurPageFromPath(route.path);\n' +
          '        return resolved ? { ...route.params, ...route.query } : {};\n' +
          '      });\n\n' +
          '      useContentViewHeight();',
      },
      {
        label: '脚本：return 暴露',
        marker: 'fulgurComp,',
        find: '        isAmis,\n        formid,\n        formjson,',
        replace: '        isAmis,\n        formid,\n        formjson,\n        fulgurComp,\n        fulgurProps,\n        route,',
      },
      {
        label: '样式：fulgur-view',
        marker: '.fulgur-view',
        find: '  .app-view-box {\n    width: 100%;\n    height: 100%;\n  }',
        replace:
          '  .app-view-box {\n    width: 100%;\n    height: 100%;\n  }\n\n  .fulgur-view {\n    width: 100%;\n    height: 100%;\n  }',
      },
    ],
    report,
    errors,
    force,
  )

  // 8) staticRouter：FULGUR_ROUTES + demo 路由 + 注册
  const flowableRemote = Object.entries(host.remotePrefixes).find(([p]) => p.startsWith('/flowable'))?.[1] ?? ''
  const lowcodeRemote = Object.entries(host.remotePrefixes).find(([p]) => p.startsWith('/lowcode'))?.[1] ?? ''
  const fulgurRoutesBlock =
    `// ---- 联邦页面通道：27 页后台菜单路由（defineAsyncComponent 直渲染进宿主布局）---- ${MARK}\n` +
    `import { FULGUR_PAGES, fulgurPageComponent, resolveFulgurPageFromPath } from '@/qiankun/fulgurPages';\n\n` +
    `function fulgurRemoteOf(route: string): string {\n` +
    `  return route.startsWith('/lowcode/') ? '${lowcodeRemote}' : '${flowableRemote}';\n` +
    `}\n\n` +
    `export const FULGUR_ROUTES: AppRouteRecordRaw = {\n` +
    `  path: '',\n  name: 'fulgur-pages-parent',\n  component: LAYOUT,\n  meta: { title: 'fulgur' },\n` +
    `  children: FULGUR_PAGES.map((page) => {\n` +
    `    const resolved = resolveFulgurPageFromPath(page.route)!;\n` +
    `    return {\n` +
    `      path: page.route,\n      name: page.name,\n` +
    `      // props：params+query 全量透传（bpm detail 的 id/taskId、form 的 type/id 等依赖它）\n` +
    `      props: (route: any) => ({ ...route.params, ...route.query }),\n` +
    `      component: fulgurPageComponent(resolved.spec, resolved.remote) as any,\n` +
    `      meta: { title: page.title },\n` +
    `    } as AppRouteRecordRaw;\n` +
    `  }),\n};\n`
  const demoRouteBlock = cfg.demo
    ? `\n// 免登录联邦演示路由（meta.ignoreAuth）：双远程组件直渲染\nexport const FULGUR_DEMO_ROUTE: AppRouteRecordRaw = {\n  path: '${cfg.demo.adminRoutePath}',\n  name: 'FulgurDemo',\n  component: () => import('@/views/fulgur/FulgurDemo.vue'),\n  meta: { title: '联邦演示', ignoreAuth: true },\n};\n`
    : ''
  patchFile(
    rel(cfg.root, app.path, 'src/router/routes/staticRouter.ts'),
    [
      {
        label: 'FULGUR_ROUTES 定义 + 导入',
        marker: 'FULGUR_ROUTES: AppRouteRecordRaw',
        find: "import { LAYOUT } from '@/router/constant';",
        replace: "import { LAYOUT } from '@/router/constant';\n" + fulgurRoutesBlock + demoRouteBlock,
      },
      {
        label: 'staticRoutesList 注册',
        marker: cfg.demo ? '[AI_ROUTE, FULGUR_ROUTES, FULGUR_DEMO_ROUTE]' : '[AI_ROUTE, FULGUR_ROUTES]',
        find: 'export const staticRoutesList = [AI_ROUTE];',
        replace: cfg.demo
          ? 'export const staticRoutesList = [AI_ROUTE, FULGUR_ROUTES, FULGUR_DEMO_ROUTE];'
          : 'export const staticRoutesList = [AI_ROUTE, FULGUR_ROUTES];',
      },
    ],
    report,
    errors,
    force,
  )
  if (cfg.demo) {
    patchFile(
      rel(cfg.root, app.path, 'src/router/routes/index.ts'),
      [
        {
          label: '导入 FULGUR_DEMO_ROUTE',
          marker: "import { FULGUR_DEMO_ROUTE } from './staticRouter'",
          find: "import { PAGE_NOT_FOUND_ROUTE, REDIRECT_ROUTE } from '@/router/routes/basic';",
          replace:
            "import { PAGE_NOT_FOUND_ROUTE, REDIRECT_ROUTE } from '@/router/routes/basic';\nimport { FULGUR_DEMO_ROUTE } from './staticRouter';",
        },
        {
          label: '免登录路由挂载',
          marker: 'FULGUR_DEMO_ROUTE,\n  TokenLoginRoute',
          find: '  TokenLoginRoute,',
          replace:
            '  // 联邦免登录演示路由（fulgur-demo：双远程组件直渲染）\n  FULGUR_DEMO_ROUTE,\n  TokenLoginRoute,',
        },
      ],
      report,
      errors,
      force,
    )
  }

  // 9) FormRouterPage / AmisFormRouterPage：formParams props 通道
  patchFile(
    rel(cfg.root, app.path, 'src/views/page/flowable/FormRouterPage.vue'),
    [
      {
        label: 'formParams props（取参通道）',
        marker: 'const fp: Record<string, any> | null =',
        find:
          "  const name = getUrlParam('name') || 'default';\n" +
          "  const id = getUrlParam('id') || 'default';\n" +
          "  const toEdit = getUrlParam('toEdit') || '-1';\n" +
          "  const disabled = getUrlParam('disabled') || '';",
        replace:
          '  // 联邦直渲染通道：formParams 优先（props 传参替代 URL query，联邦页面里 useRoute/window.location\n' +
          '  // 都是宿主的）；空时回落 URL 参数，乾坤 iframe 用法完全兼容\n' +
          "  const props = defineProps<{ formParams?: Record<string, any> }>();\n" +
          '  const fp: Record<string, any> | null =\n' +
          "    props.formParams && Object.keys(props.formParams).length ? props.formParams : null;\n" +
          "  const name = fp?.name ?? (getUrlParam('name') || 'default');\n" +
          "  const id = fp?.id ?? (getUrlParam('id') || 'default');\n" +
          "  const toEdit = fp?.toEdit ?? (getUrlParam('toEdit') || '-1');\n" +
          "  const disabled = fp?.disabled ?? (getUrlParam('disabled') || '');",
      },
      {
        label: 'processData 取参切换',
        marker: '...(fp ?? getAllUrlParams()),',
        find: '      ...getAllUrlParams(),',
        replace: '      ...(fp ?? getAllUrlParams()),',
      },
    ],
    report,
    errors,
    force,
  )
  patchFile(
    rel(cfg.root, app.path, 'src/components/amis/AmisFormRouterPage.vue'),
    [
      {
        label: 'formParams props（AMIS 取参通道）',
        marker: '联邦直渲染通道：formParams 优先',
        find: '  const route = useRoute();',
        replace:
          '  const route = useRoute();\n' +
          '  // 联邦直渲染通道：formParams 优先（props 传参替代 URL query，联邦页面里 useRoute()\n' +
          '  // 是宿主路由）；空时回落 URL 参数，乾坤 iframe 用法完全兼容\n' +
          '  const props = defineProps<{ formParams?: Record<string, any> }>();\n' +
          '  const fp = computed(() =>\n' +
          '    props.formParams && Object.keys(props.formParams).length ? props.formParams : null,\n' +
          '  );\n' +
          '  const fromFp = (k: string): any => {\n' +
          '    const v: any = fp.value?.[k];\n' +
          '    return Array.isArray(v) ? v[0] : v;\n' +
          '  };\n' +
          '  const fromQuery = (k: string): any => (route.query as any)[k];',
      },
      {
        label: 'schemaId 通道切换',
        marker: 'if (fp.value) {',
        find:
          '    const v1 = route.query.formId;\n' +
          "    if (Array.isArray(v1)) return v1[0] || '';\n" +
          '    if (v1 != null && String(v1)) return String(v1);\n' +
          '    const v2 = route.query.amisId;\n' +
          "    if (Array.isArray(v2)) return v2[0] || '';\n" +
          '    if (v2 != null && String(v2)) return String(v2);\n' +
          '    const v3: any = (route.query as any).schemaId ?? (route.query as any).configId;\n' +
          "    if (Array.isArray(v3)) return v3[0] || '';\n" +
          '    if (v3 != null && String(v3)) return String(v3);\n' +
          "    return '';",
        replace:
          '    if (fp.value) {\n' +
          "      const v = fromFp('formId') ?? fromFp('amisId') ?? fromFp('schemaId') ?? fromFp('configId');\n" +
          "      return v != null && String(v) ? String(v) : '';\n" +
          '    }\n' +
          "    const v1 = fromQuery('formId');\n" +
          "    if (Array.isArray(v1)) return v1[0] || '';\n" +
          '    if (v1 != null && String(v1)) return String(v1);\n' +
          "    const v2 = fromQuery('amisId');\n" +
          "    if (Array.isArray(v2)) return v2[0] || '';\n" +
          '    if (v2 != null && String(v2)) return String(v2);\n' +
          "    const v3: any = fromQuery('schemaId') ?? fromQuery('configId');\n" +
          "    if (Array.isArray(v3)) return v3[0] || '';\n" +
          '    if (v3 != null && String(v3)) return String(v3);\n' +
          "    return '';",
      },
      {
        label: 'pageData 通道切换',
        marker: 'if (fp.value) {\n      Object.keys(fp.value)',
        find:
          '    Object.keys(route.query || {}).forEach((k) => {\n' +
          '      const v: any = (route.query as any)[k];\n' +
          '      q[k] = Array.isArray(v) ? v[0] : v;\n' +
          '    });',
        replace:
          '    if (fp.value) {\n' +
          '      Object.keys(fp.value).forEach((k) => {\n' +
          '        const v: any = fp.value![k];\n' +
          '        q[k] = Array.isArray(v) ? v[0] : v;\n' +
          '      });\n' +
          '    } else {\n' +
          '      Object.keys(route.query || {}).forEach((k) => {\n' +
          '        const v: any = (route.query as any)[k];\n' +
          '        q[k] = Array.isArray(v) ? v[0] : v;\n' +
          '      });\n' +
          '    }',
      },
    ],
    report,
    errors,
    force,
  )

  // 9.5) package.json：插件 link 依赖
  patchPkgDep(cfg, app, report, errors, force)

  // 10) build/vite/plugin/index.ts：topLevelAwait 停用（三件套之二，swc AST 不兼容 + 插件自带 TLA）
  patchFile(
    rel(cfg.root, app.path, 'build/vite/plugin/index.ts'),
    [
      {
        label: 'topLevelAwait 插件停用',
        marker: 'topLevelAwait（停用，三件套规避之二）',
        find: "    topLevelAwait({\n      // 可选配置项\n      promiseExportName: '__tla',\n      promiseImportName: (i) => `__tla_${i}`,\n    }),",
        replace:
          "    // topLevelAwait（停用，三件套规避之二）：vite-plugin-top-level-await 1.6 的 swc AST\n" +
          "    // 「missing field type」连锁问题（DESIGN 已知差异 #7）；联邦插件自带 TLA 自动异步边界\n" +
          "    // topLevelAwait({\n" +
          "    //   promiseExportName: '__tla',\n" +
          "    //   promiseImportName: (i) => `__tla_${i}`,\n" +
          "    // }),",
      },
    ],
    report,
    errors,
    force,
  )

  // 11) env 补丁 + 根 .env.backend
  generateAppEnvFiles(cfg, app, report, errors, force)
  patchRootEnvBackend(cfg, report, errors, force)
}

// ─────────────────────────── 远程（bpm / lowcode）───────────────────────────

const BPM_EXPOSES_REF: Record<string, string> = {
  './pages/bpm/task/todo': './src/views/bpm/task/todo/index.vue',
  './pages/bpm/task/done': './src/views/bpm/task/done/index.vue',
  './pages/bpm/task/my': './src/views/bpm/processInstance/index.vue',
  './pages/bpm/task/copy': './src/views/bpm/task/copy/index.vue',
  './pages/bpm/task/create': './src/views/bpm/processInstance/create/index.vue',
  './pages/bpm/process-instance/detail': './src/views/bpm/processInstance/detail/index.vue',
  // 独立页版本（Master）：自带 processsKey 拉取逻辑（读 URL query），联邦直渲染天然兼容；
  // 子组件版 ProcessDefinitionDetail.vue 需父页传 selectProcessDefinition prop，直挂会渲染崩溃
  './pages/bpm/manager/action': './src/views/bpm/processInstance/create/ProcessDefinitionDetailMaster.vue',
  './pages/bpm/manager/model': './src/views/bpm/model/index.vue',
  './pages/bpm/manager/model/create': './src/views/bpm/model/form/index.vue',
  // update/copy/definition 三个 expose 指向同一表单文件，行为由 route.params.type 驱动
  './pages/bpm/manager/model/update': './src/views/bpm/model/form/index.vue',
  './pages/bpm/manager/model/copy': './src/views/bpm/model/form/index.vue',
  './pages/bpm/manager/model/definition': './src/views/bpm/model/form/index.vue',
  './pages/bpm/manager/form': './src/views/bpm/form/index.vue',
  './pages/bpm/manager/form/edit': './src/views/bpm/form/editor/index.vue',
  './pages/bpm/manager/category': './src/views/bpm/category/index.vue',
  './pages/bpm/manager/user-group': './src/views/bpm/group/index.vue',
  './pages/bpm/manager/process-listener': './src/views/bpm/processListener/index.vue',
  './pages/bpm/manager/process-expression': './src/views/bpm/processExpression/index.vue',
  './pages/bpm/manager/process-instance/manager': './src/views/bpm/processInstance/manager/index.vue',
  './pages/bpm/manager/process-tasnk': './src/views/bpm/task/manager/index.vue',
  './pages/bpm/manager/definition': './src/views/bpm/model/definition/index.vue',
  './pages/bpm/process-instance/report': './src/views/bpm/processInstance/report/index.vue',
  './federatedBoot': './src/fulgur-exposes/federatedBoot.ts',
  './TaskCard': './src/fulgur-exposes/TaskCard.vue',
}

const LOWCODE_EXPOSES_REF: Record<string, string> = {
  './pages/lowdev/formDesign': './src/views/lowdesign/formDesign/index.vue',
  './pages/lowdev/reportDesign': './src/views/lowdesign/reportDesign/index.vue',
  './pages/lowdev/graphReportDesign': './src/views/lowdesign/graphReportDesign/index.vue',
  './pages/lowdev/moduleDesign': './src/views/lowdesign/moduleDesign/index.vue',
  './pages/lowdev/reportTest': './src/views/lowdesign/reportView/index.vue',
  './pages/form/external': './src/views/lowdesign/formView/index.vue',
  './federatedBoot': './src/fulgur-exposes/federatedBoot.ts',
  './InfoCard': './src/fulgur-exposes/InfoCard.vue',
}

/** dev 专用 dayjs→esm 别名（CJS 子路径 interop 兜底；build 严禁挂——prod 双重 interop） */
const DAYJS_ALIAS_BLOCK =
  '        // dev 专用 dayjs→esm 别名：element-plus 移出预构建（联邦防 vue 双实例）后，其\n' +
  '        // dayjs CJS 子路径裸导入无 interop，dev 必须别名兜住；但 build 下严禁挂——\n' +
  '        // prod rollup 会把 element-plus 的 CJS require 导向 ESM 形成双重 interop\n' +
  '        // （p.default.extend TypeError，历史结论 d3af5de） [fulgur:init]\n' +
  '        ...(isBuild\n' +
  '          ? []\n' +
  '          : [\n' +
  '              { find: /^dayjs$/, replacement: \'dayjs/esm\' },\n' +
  "              { find: /^dayjs\\/(plugin|locale)\\/([\\w-]+)(\\.js)?$/, replacement: 'dayjs/esm/$1/$2/index.js' }\n" +
  '            ]),'

function initRemoteApp(cfg: FulgurRepoConfig, app: FulgurAppConfig, report: InitReportEntry[], errors: string[], force: boolean, vars: Record<string, string>): void {
  const remote = app.remote!
  const isBpm = remote.boot === 'bpm'
  const outDirName = app.deployDir ?? app.base.replace(/^\//, '')

  // 1) federatedBoot（bare EP 导入 = U-7 修复后的 provider 路径）+ 演示卡片
  generateFile(
    rel(cfg.root, app.path, 'src/fulgur-exposes/federatedBoot.ts'),
    substitute(isBpm ? T_BPM_BOOT : T_LOWCODE_BOOT, vars),
    report,
    force,
  )
  if (cfg.demo) {
    generateFile(
      rel(cfg.root, app.path, `src/fulgur-exposes/${isBpm ? 'TaskCard.vue' : 'InfoCard.vue'}`),
      substitute(isBpm ? T_BPM_TASKCARD : T_LOWCODE_INFOCARD, vars),
      report,
      force,
    )
  }

  // 2) optimize.ts（联邦 exclude 最终形态）
  generateFile(
    rel(cfg.root, app.path, 'build/vite/optimize.ts'),
    substitute(isBpm ? T_BPM_OPTIMIZE : T_LOWCODE_OPTIMIZE, vars),
    report,
    force,
    true,
  )

  // 3) package.json：插件 link 依赖
  patchPkgDep(cfg, app, report, errors, force)

  // 4) vite.config.ts
  const exposes = remote.exposes ?? (isBpm ? BPM_EXPOSES_REF : LOWCODE_EXPOSES_REF)
  const remotesLiteral = Object.entries(remote.remotes ?? {})
    .map(([k, v]) => `          '${k}': { dev: '${v.dev}', prod: '${v.prod}' },`)
    .join('\n')
  const epSharedLine = remote.sharedElementPlus
    ? `\n          // element-plus singleton（D.4）：单副本收敛 + EP 全局配置（locale）inject 链一致\n          'element-plus': { singleton: true, requiredVersion: '^2.10.2' }`
    : ''
  const federationBlock =
    `      federation({\n` +
    `        name: '${app.name}',\n` +
    (isBpm
      ? `        // loadRemote 直调用本键名 ${vars.__ADMIN_NAME__}（与 admin 联邦 name 一致）；\n        // name@url 前缀语法仅字符串形式 external 支持，对象形式 dev/prod 值会被整串当 URL 拼接\n`
      : `        // 页面 exposes：后台菜单 27 页中 lowcode 6 页 + 联邦启动器 + 演示组件\n`) +
    (remotesLiteral
      ? `        remotes: {\n${remotesLiteral}\n        },\n`
      : '') +
    `        exposes: {\n${exposesLiteral(exposes)}\n        },\n` +
    `        // 本应用 shared：vue 全局响应性必须与宿主同实例\n` +
    `        shared: {\n          vue: { singleton: true, requiredVersion: '^3.4.0' },\n          'vue-router': { singleton: true, requiredVersion: '^4.4.5' },\n          pinia: { singleton: true, requiredVersion: '^2.1.7' },${epSharedLine}\n        },\n` +
    (isBpm ? `        // 本应用有 exposes 且有 remotes（双向联邦）：dev 下自身源码参与 shared 协商改写需显式开启\n        devSharedSelf: true,\n` : '') +
    `      }),`
  patchFile(
    rel(cfg.root, app.path, 'vite.config.ts'),
    [
      {
        label: 'import federation',
        marker: "import { federation } from '@fulgur/federation'",
        find: "import { createVitePlugins } from './build/vite'",
        replace: "import { federation } from '@fulgur/federation'\nimport { createVitePlugins } from './build/vite'",
      },
      {
        label: 'server.origin 按 VITE_PORT 动态生成',
        marker: 'origin 原写死',
        find: isBpm ? "      origin: 'http://127.0.0.1:4527'," : "      origin: 'http://127.0.0.1:4664',",
        replace:
          `      // origin 原写死端口与 VITE_PORT 错位（dev 下详情页时间线 svg 全部连接拒绝），按 VITE_PORT 动态生成 ${MARK}\n` +
          '      origin: `http://127.0.0.1:${env.VITE_PORT || ' + app.port + '}`,',
      },
      {
        label: '联邦插件块',
        marker: "federation({",
        find: isBpm ? '    plugins: createVitePlugins(isBuild),' : '    plugins: createVitePlugins(),',
        replace: isBpm
          ? `    plugins: [\n      ...createVitePlugins(isBuild),\n      // 联邦平行通道：qiankun 集成零改动，乾坤开关关闭时走联邦 ${MARK}\n${federationBlock}\n    ],`
          : `    plugins: [\n      ...createVitePlugins(),\n      // 联邦平行通道：qiankun 集成零改动，乾坤开关关闭时走联邦 ${MARK}\n${federationBlock}\n    ],`,
      },
      {
        label: 'dayjs dev 别名',
        marker: 'dev 专用 dayjs→esm 别名',
        find: "      alias: [\n        {\n          find: 'vue-i18n',",
        replace: "      alias: [\n" + DAYJS_ALIAS_BLOCK + "\n        {\n          find: 'vue-i18n',",
      },
      {
        label: 'emptyOutDir（outDir 根外显式清空）',
        marker: 'emptyOutDir: true',
        find: "      outDir: '../dist/" + outDirName + "',",
        replace:
          "      outDir: '../dist/" + outDirName + "',\n" +
          '      // outDir 在项目根之外，vite 默认不清空——显式清空防历次构建旧 hash 残留累积\n' +
          '      emptyOutDir: true,',
      },
    ],
    report,
    errors,
    force,
  )

  // 5) bpm detail 页联邦直渲染双分支
  if (remote.detailPatch) {
    patchDetailPage(cfg, app, report, errors, force)
  }
  // 6) lowcode moduleDesign 形状守卫
  if (app.path.includes('lowcode')) {
    patchModuleDesign(cfg, report, errors, force, vars)
  }
  // 7) bpm remaining.ts Redirect 撞名（vue-router 4.6 禁止父子同名）
  if (isBpm) {
    patchFile(
      rel(cfg.root, app.path, 'src/router/modules/remaining.ts'),
      [
        {
          label: 'Redirect 子路由改名（shared 协商高版本 vue-router）',
          marker: "name: 'RedirectChild'",
          find: "        name: 'Redirect',",
          replace:
            "        // 子路由改名：vue-router 4.6（shared 协商取最高版本）禁止父子同名路由\n" +
            "        //（原项目在其自带旧版 vue-router 下默许，联邦 shared 协商后暴露）\n" +
            "        name: 'RedirectChild',",
        },
      ],
      report,
      errors,
      force,
    )
  }
  // 8) env（远程应用不生成，宿主侧见 initHostApp）
}

function patchDetailPage(cfg: FulgurRepoConfig, app: FulgurAppConfig, report: InitReportEntry[], errors: string[], force: boolean): void {
  const abs = rel(cfg.root, app.path, 'src/views/bpm/processInstance/detail/index.vue')
  const templatePatch =
    '                        <!-- 联邦直渲染优先（admin/FormRouterPage loadRemote），iframe 为乾坤/加载失败兜底 --> [fulgur:init]\n' +
    '                        <component\n' +
    '                          :is="FederatedBusinessForm"\n' +
    '                          v-if="FederatedBusinessForm"\n' +
    '                          :form-params="federatedBusinessParams"\n' +
    '                        />\n'
  const amisTemplatePatch =
    '                        <!-- 联邦直渲染优先（admin/AmisFormRouterPage loadRemote），iframe 为乾坤/加载失败兜底 -->\n' +
    '                        <component\n' +
    '                          :is="FederatedAmisForm"\n' +
    '                          v-if="FederatedAmisForm"\n' +
    '                          :form-params="federatedAmisParams"\n' +
    '                        />\n'
  const scriptBlock =
    '\n' +
    '// ========== 联邦直渲染（AMIS/业务表单）：admin exposes 组件 loadRemote 直挂 ========== [fulgur:init]\n' +
    '// realm 判定不做一次性捕获（宿主桥写入与子组件 setup 的先后无保证），在数据就绪时点\n' +
    '// 实时判定：宿主运行时单例存在 = 本页经联邦通道加载（乾坤下无此单例）。\n' +
    '// 远程页面禁止静态导入 virtual:fulgur-runtime（D.1），宿主运行时走全局单例（迁移指南三B-1）\n' +
    'const FederatedAmisForm = shallowRef<any>(null) // admin/AmisFormRouterPage 异步组件\n' +
    'const FederatedBusinessForm = shallowRef<any>(null) // admin/FormRouterPage 异步组件\n' +
    'const federatedAmisParams = ref<Record<string, any>>({}) // AMIS 直渲染参数（formParams 单对象透传）\n' +
    'const federatedBusinessParams = ref<Record<string, any>>({}) // 业务表单直渲染参数\n' +
    '/** 联邦 realm 判定：宿主运行时单例在即联邦加载（loadRemote 直调须用自报名，MFU-002） */\n' +
    'const isFederatedRealm = () => !!(globalThis as any).__FULGUR_RUNTIME__\n' +
    '/**\n' +
    ' * 加载 admin 暴露的表单组件供联邦直渲染\n' +
    ' * @param kind amis=AmisFormRouterPage，custom=FormRouterPage\n' +
    ' * @returns 是否加载成功（false 时调用方回落 iframe 旧通道）\n' +
    ' */\n' +
    "const loadFederatedForm = async (kind: 'amis' | 'custom') => {\n" +
    '  const runtime = (globalThis as any).__FULGUR_RUNTIME__\n' +
    '  if (!runtime) return false\n' +
    "  const spec = kind === 'amis' ? '__ADMIN_NAME__/AmisFormRouterPage' : '__ADMIN_NAME__/FormRouterPage'\n" +
    '  try {\n' +
    '    const mod = await runtime.loadRemote(spec)\n' +
    '    const comp = (mod as any)?.default ?? mod\n' +
    "    if (comp) (kind === 'amis' ? FederatedAmisForm : FederatedBusinessForm).value = comp\n" +
    '    return !!comp\n' +
    '  } catch (e) {\n' +
    '    console.warn(`[fulgur] loadRemote(${spec}) 失败，回落 iframe:`, e)\n' +
    '    return false\n' +
    '  }\n' +
    '}\n'
  const businessBranch =
    '      const formParams = {\n' +
    '        id: processInstance.value.businessKey,\n' +
    '        name: data.processDefinition.formCustomCreatePath,\n' +
    '        toEdit: data.processInstance?.formVariables?.toEdit,\n' +
    '        disagreeType: data.processInstance?.formVariables?.disagreeType,\n' +
    '        nodeName: data.todoTask?.name,\n' +
    '        recordId: data.processInstance?.formVariables?.id,\n' +
    '        ...obj\n' +
    '      }\n' +
    '      if (isFederatedRealm()) {\n' +
    '        federatedBusinessParams.value = formParams\n' +
    '        FormComponentUrl.value = null\n' +
    "        loadFederatedForm('custom').then((ok) => {\n" +
    '          // 联邦加载失败回落乾坤 iframe 旧通道\n' +
    '          if (!ok) {\n' +
    '            FormComponentUrl.value = (window as any).mainAppProps.formUrl + toQueryString(formParams)\n' +
    '          }\n' +
    '        })\n' +
    '      } else {\n' +
    '        FormComponentUrl.value = (window as any).mainAppProps.formUrl + toQueryString(formParams)\n' +
    '      }'
  const amisBranch =
    '        const formParams = {\n' +
    '          id: processInstance.value.businessKey,\n' +
    '          name: data.processDefinition.formCustomCreatePath,\n' +
    '          toEdit: data.processInstance?.formVariables?.toEdit,\n' +
    '          disagreeType: data.processInstance?.formVariables?.disagreeType,\n' +
    '          nodeName: data.todoTask?.name,\n' +
    '          recordId: data.processInstance?.formVariables?.id,\n' +
    '          formId: amisId,\n' +
    "          loadingRaise: '1',\n" +
    '          debugSchema,\n' +
    "          // debugApi: '1',\n" +
    '          ...obj\n' +
    '        }\n' +
    '        if (isFederatedRealm()) {\n' +
    '          federatedAmisParams.value = formParams\n' +
    '          AmisFormComponentUrl.value = null\n' +
    "          loadFederatedForm('amis').then((ok) => {\n" +
    '            // 联邦加载失败回落乾坤 iframe 旧通道\n' +
    '            if (!ok) {\n' +
    '              AmisFormComponentUrl.value =\n' +
    "                (window as any).mainAppProps.baseUrl + '/AmisFormRouterPage?' + toQueryString(formParams)\n" +
    '            }\n' +
    '          })\n' +
    '        } else {\n' +
    '          AmisFormComponentUrl.value =\n' +
    "            (window as any).mainAppProps.baseUrl + '/AmisFormRouterPage?' + toQueryString(formParams)\n" +
    '          FormComponentUrl.value = null\n' +
    '        }'
  patchFile(
    abs,
    [
      {
        label: '模板：业务表单联邦分支',
        marker: 'FederatedBusinessForm',
        find:
          '                        <!-- <BusinessFormComponent :id="processInstance.businessKey" /> -->\n' +
          '                        <iframe\n' +
          '                          class="w-full h-100vh"',
        replace:
          '                        <!-- <BusinessFormComponent :id="processInstance.businessKey" /> -->\n' +
          templatePatch +
          '                        <iframe\n' +
          '                          v-else-if="FormComponentUrl"\n' +
          '                          class="w-full h-100vh"',
      },
      {
        label: '模板：AMIS 表单联邦分支',
        marker: 'FederatedAmisForm',
        find:
          '                      <div v-if="processDefinition?.formType === BpmModelFormType.AMIS">\n' +
          '                        <iframe\n' +
          '                          class="w-full h-100vh"',
        replace:
          '                      <div v-if="processDefinition?.formType === BpmModelFormType.AMIS">\n' +
          amisTemplatePatch +
          '                        <iframe\n' +
          '                          v-else-if="AmisFormComponentUrl"\n' +
          '                          class="w-full h-100vh"',
      },
      { label: '脚本：联邦直渲染块', marker: '联邦直渲染（AMIS/业务表单）', find: "const AmisFormComponentUrl = ref<any>(null) // AMIS 表单 iframe 地址", replace: 'const AmisFormComponentUrl = ref<any>(null) // AMIS 表单 iframe 地址\n' + scriptBlock.replace(/__ADMIN_NAME__/g, cfg.apps.find((a) => a.host)?.name ?? '') },
      { label: '脚本：业务表单分支', marker: 'federatedBusinessParams.value = formParams', find: '      // toQueryString\n      const queryParams = toQueryString({\n        id: processInstance.value.businessKey,\n        name: data.processDefinition.formCustomCreatePath,\n        toEdit: data.processInstance?.formVariables?.toEdit,\n        disagreeType: data.processInstance?.formVariables?.disagreeType,\n        nodeName: data.todoTask?.name,\n        recordId: data.processInstance?.formVariables?.id,\n        ...obj\n      })\n      FormComponentUrl.value = (window as any).mainAppProps.formUrl + queryParams\n      // 注意：data.processDefinition.formCustomViewPath 是组件的全路径，例如说：/crm/contract/detail/index.vue\n      // BusinessFormComponent.value = registerComponent(data.processDefinition.formCustomViewPath)', replace: businessBranch },
      { label: '脚本：AMIS 分支', marker: 'federatedAmisParams.value = formParams', find: "        const queryParams = toQueryString({\n          id: processInstance.value.businessKey,\n          name: data.processDefinition.formCustomCreatePath,\n          toEdit: data.processInstance?.formVariables?.toEdit,\n          disagreeType: data.processInstance?.formVariables?.disagreeType,\n          nodeName: data.todoTask?.name,\n          recordId: data.processInstance?.formVariables?.id,\n          formId: amisId,\n          loadingRaise: '1',\n          debugSchema,\n          // debugApi: '1',\n          ...obj\n        })\n        AmisFormComponentUrl.value =\n          (window as any).mainAppProps.baseUrl + '/AmisFormRouterPage?' + queryParams\n        FormComponentUrl.value = null", replace: amisBranch },
    ],
    report,
    errors,
    force,
  )
}

function patchModuleDesign(cfg: FulgurRepoConfig, report: InitReportEntry[], errors: string[], force: boolean, vars: Record<string, string>): void {
  const lowcodeApp = cfg.apps.find((a) => a.remote?.boot === 'lowcode')
  if (!lowcodeApp) return
  // 形状守卫版整文件（字节级模板，原文件为 CRLF——统一为已验证的 LF 形态）
  generateFile(
    rel(cfg.root, lowcodeApp.path, 'src/views/lowdesign/moduleDesign/index.vue'),
    substitute(T_MODULE_DESIGN, vars),
    report,
    force,
    true,
  )
}

// ─────────────────────────── NGINX conf ───────────────────────────

function generateNginxConf(cfg: FulgurRepoConfig, report: InitReportEntry[], force: boolean): void {
  const apps = cfg.apps.map((a) => ({ base: a.base, dir: a.deployDir ?? a.base.replace(/^\//, '') }))
  generateFile(cfg.deploy.nginxConf, nginxConfFinal(cfg, apps), report, force, true)
}

function nginxConfFinal(cfg: FulgurRepoConfig, apps: Array<{ base: string; dir: string }>): string {
  const blocks = apps
    .map(
      (a) => `  location ${a.base} {
    index index.html index.htm;
    try_files $uri $uri/ /main/index.html;

    location = ${a.base}/fulgur-remoteEntry.js {
      add_header Cache-Control "no-cache";
      add_header Access-Control-Allow-Origin "*";
      add_header Access-Control-Expose-Headers "*";
    }
    location = ${a.base}/fulgur-manifest.json {
      add_header Cache-Control "no-cache";
      add_header Access-Control-Allow-Origin "*";
      add_header Access-Control-Expose-Headers "*";
    }
    location = ${a.base}/index.html {
      add_header Cache-Control "no-cache";
    }
    add_header Access-Control-Allow-Origin "*";
  }`,
    )
    .join('\n\n')
  return `# [fulgur:init] 联邦 prod 测试站点（端口 ${cfg.deploy.listen}）
# 用途：三应用 prod 部署 + 27 页双环境回归；remoteEntry/manifest/index.html 必须 no-cache
# （严禁 immutable：文件名固定内容每次构建变，immutable 曾致浏览器持旧 remoteEntry→旧 chunk 404）
server {
  listen ${cfg.deploy.listen};
  server_name localhost;

  client_max_body_size 100m;

  root ${cfg.deploy.webRoot};

  gzip on;
  gzip_comp_level 6;
  gzip_min_length 1k;
  gzip_types text/plain text/css application/javascript application/json image/svg+xml;
  gzip_vary on;

${blocks}

  # 规范化：访问 /demo（不带尾部 /）时重定向补齐尾斜杠
  location = /demo {
    return 302 /demo/;
  }

  # 诚实空垫片：demo 后台无 /tab/page 端点（低代码「模块设计」列表接口），
  # 直出空页 jeecg Result——页面渲染"暂无数据"而非 404 报错
  location = /demo/tab/page {
    default_type application/json;
    return 200 '{"success":true,"message":"empty shim: demo backend has no /tab/page endpoint","code":200,"result":{"records":[],"total":0,"pages":0},"timestamp":1789600000000}';
  }

  # 接口反向代理
  location /demo {
    proxy_pass ${cfg.deploy.backendProxy};

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location = / {
    return 302 /main;
  }
}
`
}

// ─────────────────────────── 编排入口 ───────────────────────────

export async function runInit(configPath: string, opts: { force?: boolean } = {}): Promise<InitResult> {
  const cfg = await loadFulgurConfig(configPath)
  const report: InitReportEntry[] = []
  const errors: string[] = []
  const force = opts.force ?? false

  // 模板占位符取值（来源：config.apps 中的角色与端口/env；与 gen-init-templates.cjs 的 TOKENS 一一对应）
  const hostApp = cfg.apps.find((a) => a.host)
  const bpmApp = cfg.apps.find((a) => a.remote?.boot === 'bpm' && !a.host) ?? hostApp
  const lowcodeApp = cfg.apps.find((a) => a.remote?.boot === 'lowcode')
  const vars: Record<string, string> = {
    __ADMIN_NAME__: hostApp?.name ?? '',
    __BPM_NAME__: bpmApp?.name ?? '',
    __LOWCODE_NAME__: lowcodeApp?.name ?? '',
    __ADMIN_HOSTPORT__: hostApp ? `localhost:${hostApp.port}` : '',
    __BPM_HOSTPORT__: bpmApp ? `localhost:${bpmApp.port}` : '',
    __LOWCODE_HOSTPORT__: lowcodeApp ? `localhost:${lowcodeApp.port}` : '',
    __BACKEND_HOSTPORT__: cfg.env.backendOrigin.replace(/^https?:\/\//, ''),
  }

  for (const app of cfg.apps) {
    if (app.host) initHostApp(cfg, app, report, errors, force, vars)
    else if (app.remote) initRemoteApp(cfg, app, report, errors, force, vars)
    else errors.push(`[fulgur:init] 应用 ${app.path} 既无 host 也无 remote 角色（config.apps 结构错误）`)
  }

  generateNginxConf(cfg, report, force)
  return { report, errors }
}

export { loadFulgurConfig }
export default runInit
