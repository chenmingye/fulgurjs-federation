/**
 * Jason.chen — official architecture figures, shared geometry and bilingual labels.
 * Run from any directory: node docs/diagrams/render.mjs [--check].
 * Generates deterministic SVG and offline HTML with Node built-ins only.
 * PNGs are presentation exports of these SVGs; see README.md in this directory.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(fileURLToPath(import.meta.url))
const check = process.argv.includes('--check')
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
const choose = (lang, zh, en) => lang === 'zh' ? zh : en
const palette = `:root{--bg:#fff;--text:#172b43;--muted:#465c72;--line:#526b85;--tool:#e8f5ef;--run:#e6f5fc;--resource:#fff3df;--note:#f1f4f8;--error:#fff0f1;--error-line:#b91c36;--border:#c1ccd8} @media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#111b29;--text:#edf4fb;--muted:#c1cfdf;--line:#a3bdd5;--tool:#173b32;--run:#16384b;--resource:#44351e;--note:#233146;--error:#491d2b;--error-line:#ff829b;--border:#60758c}} :root[data-theme="dark"]{--bg:#111b29;--text:#edf4fb;--muted:#c1cfdf;--line:#a3bdd5;--tool:#173b32;--run:#16384b;--resource:#44351e;--note:#233146;--error:#491d2b;--error-line:#ff829b;--border:#60758c}`
const style = `${palette}
.diagram{font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:var(--text)}
.diagram .background{fill:var(--bg)}.diagram text{fill:var(--text)}
.diagram .heading{font-size:25px;font-weight:700}.diagram .section{font-size:18px;font-weight:700}
.diagram .title{font-size:18px;font-weight:700}.diagram .body{font-size:15px;fill:var(--muted)}
.diagram .edge-label{font-size:14px;fill:var(--muted);paint-order:stroke;stroke:var(--bg);stroke-width:7px;stroke-linejoin:round}
.diagram .box{stroke:var(--border);stroke-width:1.5;fill:var(--note)}
.diagram .tool{fill:var(--tool)}.diagram .run{fill:var(--run)}.diagram .resource{fill:var(--resource)}
.diagram .error{fill:var(--error);stroke:var(--error-line)}
.diagram .boundary{fill:none;stroke:var(--border);stroke-width:1.5;stroke-dasharray:7 5}
.diagram .edge{fill:none;stroke:var(--line);stroke-width:2;marker-end:url(#arrow)}
.diagram .optional{stroke-dasharray:7 5}.diagram .failure{stroke:var(--error-line);marker-end:url(#error-arrow)}
`
function drawing(title, description, height, lang) {
  const shapes = [], edges = [], labels = []
  const text = (x, y, lines, cls = 'body', anchor = 'middle', target = shapes) => {
    target.push(`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? 23 : 0}">${escape(line)}</tspan>`).join('')}</text>`)
  }
  const box = (id, x, y, w, h, titleText, lines = [], kind = 'run') => {
    shapes.push(`<g data-node="${id}"><rect class="box ${kind}" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>`)
    text(x + w / 2, y + 31, [titleText], 'title')
    text(x + w / 2, y + 59, lines)
    shapes.push('</g>')
  }
  const boundary = (x, y, w, h, name) => {
    shapes.push(`<rect class="boundary" x="${x}" y="${y}" width="${w}" height="${h}" rx="16"/>`)
    text(x + 18, y + 29, [name], 'section', 'start')
  }
  const edge = (points, label, x, y, kind = '') => {
    edges.push(`<path class="edge ${kind}" d="M ${points.map(p => p.join(' ')).join(' L ')}"/>`)
    if (label) text(x, y, [label], 'edge-label', 'middle', labels)
  }
  const finish = () => `<svg xmlns="http://www.w3.org/2000/svg" class="diagram" viewBox="0 0 1280 ${height}" width="1280" height="${height}" role="img" lang="${lang === 'zh' ? 'zh-CN' : 'en'}" aria-labelledby="title description"><title id="title">${escape(title)}</title><desc id="description">${escape(description)}</desc><style>${style}</style><defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 4 L0 8Z" fill="var(--line)"/></marker><marker id="error-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 4 L0 8Z" fill="var(--error-line)"/></marker></defs><rect class="background" width="1280" height="${height}"/><text class="heading" x="30" y="40">${escape(title)}</text>${edges.join('')}${shapes.join('')}${labels.join('')}</svg>\n`
  return { box, boundary, edge, text, finish }
}
function overview(lang) {
  const t = (zh, en) => choose(lang, zh, en)
  const d = drawing(t('fulgurjs：系统架构与三条使用路径', 'fulgurjs: system architecture and three integration paths'), t('开发构建、资源服务、浏览器执行；三条路径不互为前置。', 'Development/build, resource serving and browser execution; no integration path requires another.'), 1550, lang)
  const { box:b, boundary:g, edge:e, text } = d
  g(20, 70, 1240, 440, t('① 本地 Node.js 工具链：宿主与远程各自接入', '1. Local Node.js tools: each host and remote integrates separately'))
  b('host',40,120,390,94,t('宿主源码与配置','Host source and configuration'),['fulgurjs.config.ts + vite.config.ts'], 'tool')
  b('remote',450,120,390,94,t('远程源码与配置','Remote source and configuration'),['exposes / setup / remotes / shared'], 'tool')
  b('cli',860,120,380,94,'fulgurjs CLI',['create / init / explain / types', 'check-pages / doctor / port'], 'tool')
  b('plugin',280,260,720,94,t('各工程自己的 Vite 插件实例','Each project’s own Vite plugin instance'),['federation(options) · transform / virtual / shared facade'], 'tool')
  b('serve',40,390,390,100,t('serve：开发端点','serve: development endpoints'),['@fulgurjs-entry.js / manifest / types'], 'tool')
  b('build',450,390,390,100,t('build：Rollup / Rolldown','build: Rollup / Rolldown'),['remoteEntry / chunks / CSS'], 'tool')
  b('dts',860,390,380,100,t('声明生成与同步（可关闭）','Type generation/sync (optional)'),[t('开发工具链，不是业务执行步骤','Tooling, not business execution'), 'manifest / dts'], 'tool')
  e([[235,214],[235,240],[440,240],[440,260]])
  e([[645,214],[645,260]])
  e([[1000,354],[1050,354],[1050,390]],t('生成 / 同步','generate / sync'),1125,365,'optional')
  e([[440,354],[440,370],[235,370],[235,390]])
  e([[640,354],[640,390]])
  g(20,525,1240,200,t('② 资源服务：开发服务器或生产 HTTP 静态托管', '2. Resource serving: dev server or production HTTP hosting'))
  b('files',40,575,570,115,t('各工程独立产物','Independent project outputs'),[t('宿主 HTML/chunks；远程入口、模块、CSS','Host HTML/chunks; remote entry, modules, CSS'),t('manifest / dts 默认开启，可关闭','manifest / dts enabled by default, optional')],'resource')
  b('http',670,575,570,115,t('Vite dev server / HTTP / CDN','Vite dev server / HTTP / CDN'),[t('生产缓存、CORS、SPA 回退由部署负责','Production cache, CORS and SPA fallback: deployment'),t('远程代码最终在消费方浏览器执行','Remote code executes in the consuming browser')],'resource')
  e([[645,490],[645,565],[325,565],[325,575]],undefined,0,0,'optional')
  e([[610,630],[670,630]],t('服务资源','serve'),640,617)
  e([[235,490],[235,515],[955,515],[955,575]],t('开发端点','dev endpoints'),1070,502,'optional')
  g(20,760,1240,730,t('③ 浏览器执行：同一 realm；三条接入路径并列','3. Browser execution: one realm; three parallel integration paths'))
  b('runtime',40,825,390,115,t('页面级运行时单例','Page-level runtime singleton'),['globalThis.__FULGURJS_RUNTIME__',t('共享注册表 / shareScope × shareKey','Share registry / shareScope × shareKey')])
  b('load',450,825,390,115,t('远程加载与初始化','Remote loading and initialization'),['loadRemote · init · setup / onSession',t('详见模块加载顺序图','See the module-loading flow')])
  b('context',860,825,380,115,'AppContext', [t('页面级快照 + 函数引用','Page-level snapshots + function references'),t('不是自动响应式跨框架总线','Not an automatic cross-framework reactive bus')])
  e([[645,825],[645,790],[955,790],[955,690]],t('请求入口与资源','request entry/resources'),1080,778)
  e([[235,882],[450,882]],t('调用内核能力','runtime services'),440,810)
  e([[840,882],[860,882]],t('读取','read'),850,870)
  b('components',40,1020,390,140,t('路径 1：组件 / 普通模块','Path 1: components / modules'),['remoteComponent / loadRemote','useLoadRemote (React)',t('不需要页面表或完整应用桥接','No page table or full-app bridge')])
  b('pages',450,1020,390,140,t('路径 2：逐页接入','Path 2: per-page integration'),['definePages / createHostPages','createReactHostPages',t('宿主管理页面表、菜单与路由','Host owns page table, menus, routes')])
  b('bridge',860,1020,380,140,t('路径 3：完整应用桥接','Path 3: full application bridge'),['createVueBridgeApp','createReactBridgeApp',t('子应用保留路由、状态与生命周期','Child owns routing, state, lifecycle')])
  e([[235,1020],[235,980],[580,980],[580,940]],'loadRemote',365,968)
  e([[645,1020],[645,940]],'loadRemote',705,985)
  e([[1050,1020],[1050,960],[770,960],[770,940]],'loadRemote',1090,978)
  b('preload',40,1260,390,140,t('资源预载：可选旁路','Resource preloading: optional'),['preloadRemote',t('不执行业务模块或 setup/onSession','No business execution or setup/onSession'),t('stylesheet 仍可影响全局样式','Stylesheets can still affect global styles')])
  b('environment',450,1260,390,140,t('组件环境与业务状态','Component environment and state'),['globalComponents / pageProviders',t('按实际消费方 app / 渲染应用','Applied per consumer app / render'),t('Pinia 库共享 ≠ 业务 store 自动共享','Shared Pinia library ≠ shared business stores')])
  b('contract',860,1260,380,140,t('契约可复用；挂载实例按 DOM 容器','Contract / DOM mount instances'),['defineApplication / defineBridgeApp',t('每次 mount 内调用业务工厂','Business factory called inside each mount'),t('session / URL 同步按需开启','session / URL sync enabled as needed')])
  e([[840,910],[850,910],[850,1230],[645,1230],[645,1260]],t('组件消费方环境（按需）','Component consumer environment (optional)'),665,1215,'optional')
  e([[1050,1160],[1050,1260]],'mount / unmount',1140,1210)
  e([[235,1260],[235,1230],[10,1230],[10,735],[955,735],[955,690]],t('仅资源提示','resource hints only'),150,1218,'optional')
  text(40,1470,[t('实线：调用/依赖/请求；虚线：生成、部署或可选旁路。资源返回沿请求反向，图中省略返回箭头。','Solid: calls/dependencies/requests. Dashed: generation, deployment or optional paths. Resource responses return along requests.')],'body','start')
  text(40,1530,[t('框架组件不做类型互转；跨 Vue/React UI 使用完整应用桥接。','No framework component conversion: use full-app bridging for Vue/React UI.')],'body','start')
  return d.finish()
}
function loading(lang) {
  const t=(zh,en)=>choose(lang,zh,en)
  const d=drawing(t('模块加载：初始化、会话校验与缓存','Module loading: initialization, sessions and cache'),t('声明 onSession 却缺少 sessionKey 必须报错；同代次不重复执行。','Declaring onSession without sessionKey fails; successful same-generation initialization is not repeated.'),2210,lang)
  const {box:b,edge:e,text}=d
  b('call',290,100,700,100,t('消费方实际发起加载','Consumer starts actual loading'),['remoteComponent / page adapter / bridge → loadRemote(full spec)'])
  b('container',40,285,560,120,t('加载并初始化远程容器','Acquire and initialize container'),['remoteEntry → container.init(shareScopeMap)',t('共享准备由生成的接线与容器完成','Generated wiring/container prepares sharing')])
  b('resources',680,285,560,120,t('并行准备资源（存在清单时）','Prepare resources in parallel (with manifest)'),['preloadRemote(spec)',t('JS 资源提示 + CSS 等待，不执行业务模块','JS hints + stylesheet waiting; no business execution')])
  e([[460,200],[460,240],[320,240],[320,285]])
  e([[820,200],[820,240],[960,240],[960,285]])
  b('setup',290,490,700,120,t('读取 setup 声明；执行可选 default 函数','Read setup declarations; run optional default'),[t('每个远程容器成功执行一次，失败可重试','Once per successful remote-container setup; failures can retry'),t('这里的容器不是 DOM 挂载容器','Remote container, not a DOM mount element')])
  e([[320,405],[320,450],[540,450],[540,490]])
  e([[960,405],[960,450],[740,450],[740,490]])
  b('declared',440,690,400,100,t('是否声明 onSession？','Is onSession declared?'),[t('无初始化模块时也跳过该段','No setup metadata also skips this phase')])
  e([[640,610],[640,690]])
  b('skip',40,860,340,100,t('无需会话钩子','No session hook'),[t('继续模块加载','Continue module loading')],'note')
  b('valid',460,860,360,100,t('sessionKey 是否有效？','Is sessionKey valid?'),[t('必须是非空字符串','Must be a non-empty string')])
  b('missing',900,860,340,130,'MFU-013',[t('声明了钩子却缺有效代次','Hook declared but generation missing'),t('本次加载失败，不继续返回模块','Fail this load; do not return module')],'error')
  e([[440,740],[210,740],[210,860]],t('未声明','not declared'),300,725)
  e([[640,790],[640,860]],t('已声明','declared'),690,827)
  e([[820,910],[900,910]],t('无效','invalid'),860,894,'failure')
  b('dedup',460,1050,360,115,t('同代次已有成功/进行中记录？','Successful/in-flight generation exists?'),[t('已成功：复用；进行中：等待','Success: reuse; pending: await')])
  b('reuse',40,1050,340,115,t('不重复执行 onSession','Do not repeat onSession'),[t('复用同一代次的 Promise','Reuse the same generation Promise')],'note')
  e([[640,960],[640,1050]],t('有效','valid'),685,1010)
  e([[460,1107],[380,1107]],t('是','yes'),420,1090)
  b('session',460,1250,360,130,t('执行本代次 onSession','Run this generation’s onSession'),[t('新代次作废旧信号并串行衔接','Invalidate old signal; serialize generations'),t('异步写业务状态前检查 signal','Check signal before async business writes')])
  e([[640,1165],[640,1250]],t('新代次 / 失败后重试','new generation / failed retry'),825,1212)
  b('environment',290,1465,700,120,t('安装/交付消费方所需环境声明','Install/deliver consumer environment declarations'),[t('Vue 全局组件注册；向适配器交付 pageProviders','Vue global registration; deliver pageProviders to adapter'),t('手动 loadRemote 不自动提供组件树包装','Manual loadRemote does not wrap the rendered component tree')])
  e([[210,960],[210,990],[20,990],[20,1525],[290,1525]],'',0,0,'optional')
  e([[210,1165],[210,1525]],'',0,0)
  e([[640,1380],[640,1465]],t('成功；失败则拒绝本次加载','success; failure rejects this load'),850,1420)
  b('get',290,1665,700,120,t('取得 expose 模块：缓存命中则复用','Get exposed module: reuse successful cache'),["container.get('./expose')",t('缓存命中仍经过前面的会话检查','Cache hits still pass the session checks above')])
  e([[640,1585],[640,1665]])
  b('render',290,1865,700,120,t('返回模块；组件适配器再包装与渲染','Return module; adapter wraps and renders'),[t('remoteComponent 应用所需 Provider 并渲染','remoteComponent applies required Providers and renders'),t('普通 loadRemote 返回命名空间，由业务使用','Plain loadRemote returns the namespace for business code')])
  e([[640,1785],[640,1865]])
  text(40,2065,[t('说明：仅 loadRemote("remote") 只取得容器，不执行 setup/onSession；上述流程针对完整模块 spec。','Bare loadRemote("remote") returns the container without setup/onSession. This flow uses a full module spec.'),t('预载不是初始化；同会话缓存访问不重复下载已成功模块，也不重复执行已成功的 onSession。','Preloading is not initialization. Successful cached modules and same-generation onSession results are reused.'),t('虚线表示可选/跳过路径；异常分支终止本次尝试，恢复取决于具体错误。','Dashed arrows indicate optional/skipped paths. Errors terminate this attempt; recovery depends on the error.')],'body','start')
  return d.finish()
}
function lifecycle(lang) {
  const t=(zh,en)=>choose(lang,zh,en)
  const d=drawing(t('完整应用生命周期：先 mount，再执行工厂','Full-app lifecycle: mount invokes the factory'),t('登出不重挂；换代先实际卸载；卸载失败封锁 DOM 容器。','Logout does not remount. Generation changes first unmount; cleanup failures lock the DOM container.'),1915,lang)
  const {box:b,edge:e,text}=d
  b('definition',290,90,700,100,t('定义并导出应用契约（尚未执行业务工厂）','Define/export contract (business factory not yet called)'),['defineApplication(factory) / defineBridgeApp(factory)'])
  b('bridge',40,260,560,110,t('嵌入运行：宿主加载契约','Embedded: host loads the contract'),['createVueBridgeApp / createReactBridgeApp',t('宿主调用 contract.mount(el)','Host calls contract.mount(el)')])
  b('standalone',680,260,560,110,t('独立运行：统一装配入口','Standalone: unified application entry'),['defineApplication → application.start(target, props)',t('内部调用独立模式对应的 mount','Internally calls the standalone-mode mount')])
  e([[460,190],[460,225],[320,225],[320,260]])
  e([[820,190],[820,225],[960,225],[960,260]])
  b('mount',340,435,600,110,t('mount：检查占用并登记本次 DOM 容器代次','mount: validate occupancy; register DOM generation'),[t('建立 signal、props 快照和实例记录','Create signal, props snapshot and instance record')])
  e([[320,370],[320,400],[540,400],[540,435]])
  e([[960,370],[960,400],[740,400],[740,435]])
  b('factory',340,615,600,110,t('在 mount 内执行本次业务工厂','Invoke this business factory inside mount'),[t('业务创建 app/root、router、store 与插件','Business creates app/root, router, stores, plugins'),t('需要时等待路由准备；异步阶段遵守 signal','Await routing when needed; async work observes signal')])
  e([[640,545],[640,615]])
  b('commit',340,795,600,110,t('首次根提交完成 → 挂载 Promise 成功','First root commit → successful mount Promise'),[t('Vue 根挂载 / React 提交探针','Vue root mount / React commit probe'),t('不代表全部接口、权限及业务异步已完成','Not proof of all API/auth/business async completion')])
  e([[640,725],[640,795]])
  b('event',340,975,600,110,t('受控会话变化，或主动卸载','Controlled session change or explicit unmount'),[t('同身份 token 轮换、普通 appProps 替换不触发重挂','Token rotation / normal appProps replacement does not remount')])
  e([[640,905],[640,975]],t('运行中','running'),715,946)
  b('invalidate',340,1155,600,110,t('作废旧挂载代次，停止旧信号与路由通道','Invalidate old mount generation, signal and routing'),[t('迟到结果丢弃；业务异步写入仍需自身检查','Discard late results; business async writes must also guard')])
  e([[640,1085],[640,1155]])
  e([[340,670],[80,670],[80,1210],[340,1210]],t('初始化途中离开 / 取消','leave / cancel while initializing'),210,1140,'optional')
  b('unmount',340,1335,600,100,'contract.unmount(el)',[t('实际释放本实例 root、router、订阅和业务资源','Actually release this root, router, subscriptions and owned resources')])
  e([[640,1265],[640,1335]])
  b('blocked',980,1495,260,130,t('封锁该 DOM 容器','Lock this DOM container'),[t('不继续重挂','Do not remount'),t('修复后整页刷新恢复','Fix, then refresh page')],'error')
  e([[940,1385],[960,1385],[960,1540],[980,1540]],t('卸载抛错','unmount throws'),1080,1447,'failure')
  b('decision',340,1505,600,110,t('卸载成功：仍需挂载且有有效新代次？','Cleanup succeeded: mount needed and valid generation?'),[t('区分登出/离页与登录新代次','Distinguish logout/removal from a new login generation')])
  e([[640,1435],[640,1505]],t('卸载成功','cleanup succeeded'),725,1475)
  b('stopped',80,1705,470,100,t('保持空容器，不再加载或自动重挂','Remain empty; no loading or automatic remount'),[t('登出 sessionKey=null / 宿主不再显示该应用','sessionKey=null / host no longer shows this app')],'note')
  b('new',650,1705,470,100,t('新代次：重新加载/校验并调用 mount','New generation: load/validate and call mount'),[t('成功模块复用；工厂为新实例重新执行','Reuse successful modules; rerun factory for new instance')])
  e([[460,1615],[460,1660],[315,1660],[315,1705]],t('否：登出 / 离页','no: logout / removal'),320,1647)
  e([[820,1615],[820,1660],[885,1660],[885,1705]],t('是：有效代次','yes: valid generation'),875,1647)
  e([[1120,1755],[1260,1755],[1260,490],[940,490]],t('清理成功后才允许新挂载','remount only after successful cleanup'),1095,456)
  text(40,1865,[t('契约模块可以复用；每次 mount 的实例按 DOM 容器与代次区分。异步失败不能让旧实例复活。','Contract modules can be reused; mount instances are keyed by DOM container and generation. Late failures cannot revive old instances.')],'body','start')
  return d.finish()
}
const names={overview,loading,lifecycle}
const titles={zh:['系统总体架构','模块加载顺序','完整应用生命周期'],en:['System overview','Module loading','Full application lifecycle']}
const files=[]
for (const lang of ['zh','en']) {
  const svgs=Object.entries(names).map(([name,make])=>{
    const svg=make(lang);files.push([`${name}.${lang}.svg`,svg]);return [name,svg]
  })
  const offlineTitle=choose(lang,'fulgurjs 系统架构图','fulgurjs architecture diagrams')
  const html=`<!doctype html><html lang="${lang==='zh'?'zh-CN':'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${offlineTitle}</title><style>${palette}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.65 system-ui,sans-serif}header,main{max-width:1280px;margin:auto;padding:20px}nav{display:flex;gap:18px;flex-wrap:wrap}a{color:var(--text)}button{font:inherit;padding:6px 12px;cursor:pointer}section{margin:32px 0 60px}figure{margin:16px 0;overflow:auto;border:1px solid var(--border);border-radius:12px}.diagram{display:block;width:100%;height:auto;min-width:960px}.links{display:flex;gap:20px;flex-wrap:wrap}svg:fullscreen{background:var(--bg);width:100%;height:100%;min-width:0}p{max-width:1000px}</style></head><body><header><h1>${offlineTitle}</h1><p>${choose(lang,'三种接入路径并列；会话去重、实际卸载与登出分支按实现表达。图不证明具体业务项目已完成验收。','Parallel integration paths, session deduplication, actual unmount and logout branches. These figures do not establish business acceptance.')}</p><nav>${svgs.map(([name],i)=>`<a href="#${name}">${titles[lang][i]}</a>`).join('')}<button id="theme">${choose(lang,'切换明暗','Toggle theme')}</button></nav></header><main>${svgs.map(([name,svg],i)=>{
    // Unique fragment IDs preserve markers and accessible titles when three SVGs share one page.
    const inline=svg.replaceAll('id="',`id="${name}-`).replaceAll('url(#',`url(#${name}-`).replace('aria-labelledby="title description"',`aria-labelledby="${name}-title ${name}-description"`)
    return `<section id="${name}"><h2>${titles[lang][i]}</h2><div class="links"><a download="${name}.${lang}.svg" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">${choose(lang,'下载 SVG','Download SVG')}</a><button data-fullscreen="${name}">${choose(lang,'全屏查看','Fullscreen')}</button></div><figure>${inline}</figure></section>`
  }).join('')}</main><script>document.getElementById('theme').onclick=()=>{const r=document.documentElement;r.dataset.theme=(r.dataset.theme||((matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light'))==='dark'?'light':'dark'};document.querySelectorAll('[data-fullscreen]').forEach(b=>b.onclick=()=>document.querySelector('#'+b.dataset.fullscreen+' svg').requestFullscreen?.());</script></body></html>\n`
  files.push([`architecture.${lang}.html`,html])
}
let failed=false
for(const [name,content] of files){const target=path.join(root,name);if(check){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content){console.error(`Stale generated diagram: ${name}`);failed=true}}else fs.writeFileSync(target,content)}
if(failed)process.exitCode=1
else console.log(`${check?'Checked':'Generated'} ${files.length} SVG/HTML artifacts.`)
