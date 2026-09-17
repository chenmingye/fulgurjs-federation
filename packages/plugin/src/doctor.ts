/**
 * W2 doctor：部署/配置层自动体检（对齐「开箱即用差距分析」W2 方案）。
 *
 * 检查项（每项三段式：PASS/FAIL/WARN + 现象/根因/修法）：
 * - remoteEntry / manifest / index.html 200 且 Cache-Control=no-cache（immutable 即 FAIL，
 *   复刻 2026-09-17 用户实测踩坑：immutable 持旧 remoteEntry → 重部署后旧 hash chunk 404）
 * - remoteEntry 内容形态校验（JS 而非 HTML——深链回退/路由错配时 nginx 会回 HTML）
 * - CORS（Access-Control-Allow-Origin，跨源联邦必需）
 * - hash chunk 抽样可达（manifest exposes[].file + remoteEntry 内 import 引用，
 *   覆盖「删一个 chunk」故障注入）
 * - 版本协商 skew 预演（各应用 manifest.shared 同键版本对比，singleton 漂移预警）
 * - dev 模式（--dev）：@fulgur-entry.js 直出 JS、manifest.devServer、端口监听
 *
 * 配置合法性（name@ 对象形式、shared 非法组合等）在 normalizeOptions 配置期以 CFG 码
 * 拦截（见 options.ts），doctor 不重复读取 vite 配置，职责保持在部署面。
 */
import http from 'node:http'
import https from 'node:https'

export interface DoctorCheck {
  app: string
  item: string
  level: 'PASS' | 'FAIL' | 'WARN'
  symptom: string
  cause?: string
  fix?: string
}

export interface DoctorOptions {
  /** 站点根，如 http://localhost:8662 */
  base: string
  /** 应用路径列表（相对站点根），如 ['main', 'flowable', 'lowcode'] */
  apps: string[]
  /** dev 体检（检查 @fulgur-entry.js 与端口监听） */
  dev?: boolean
  /** remoteEntry 内 chunk 抽样上限（默认 8） */
  chunkSample?: number
}

function fetchHeadOrGet(url: string, method: 'HEAD' | 'GET' = 'GET'): Promise<{
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http
    const req = mod.request(url, { method, headers: { accept: '*/*' } }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => {
        // body 仅用于形态/引用抽取，上限 2MB 防大 chunk 撑内存
        if (chunks.reduce((n, b) => n + b.length, 0) < 2 * 1024 * 1024) chunks.push(c)
      })
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      )
    })
    req.on('error', reject)
    req.setTimeout(8000, () => req.destroy(new Error('timeout after 8000ms')))
    req.end()
  })
}

function header(res: { headers: Record<string, string | string[] | undefined> }, name: string): string | undefined {
  const v = res.headers[name]
  return Array.isArray(v) ? v[0] : v
}

async function checkStatus(
  url: string,
  app: string,
  item: string,
  opts: { method?: 'HEAD' | 'GET'; expectNoCache?: boolean; expectJs?: boolean } = {},
): Promise<{ res?: Awaited<ReturnType<typeof fetchHeadOrGet>>; check?: DoctorCheck }> {
  let res
  try {
    res = await fetchHeadOrGet(url, opts.method ?? 'GET')
  } catch (e) {
    return {
      check: {
        app,
        item,
        level: 'FAIL',
        symptom: `${item} 不可达：${url}（${String((e as Error).message ?? e)}）`,
        cause: '静态资源未部署、nginx 站点未起或路径错位',
        fix: '核对部署目录（rsync dist/{app}/）与 nginx location 回退规则；curl 该 URL 确认可达',
      },
    }
  }
  if (res.status !== 200) {
    return {
      check: {
        app,
        item,
        level: 'FAIL',
        symptom: `${item} 返回 ${res.status}：${url}`,
        cause: '文件缺失（未部署/已被清）或 nginx 回退到了宿主 index.html（深链回退过宽）',
        fix: '重新部署该应用产物；核对 nginx location 精确匹配 remoteEntry 的规则',
      },
      res,
    }
  }
  if (opts.expectJs) {
    const head = res.body.slice(0, 200).trimStart()
    if (head.startsWith('<')) {
      return {
        res,
        check: {
          app,
          item,
          level: 'FAIL',
          symptom: `${item} 返回的是 HTML 而非 JS：${url}`,
          cause: 'nginx try_files/深链回退把入口请求兜到了 index.html（联邦宿主会把它当模块解析直接失败）',
          fix: '为 remoteEntry/入口增加精确 location 原样返回 JS',
        },
      }
    }
  }
  if (opts.expectNoCache) {
    const cc = header(res, 'cache-control') ?? ''
    if (/immutable/i.test(cc)) {
      return {
        res,
        check: {
          app,
          item,
          level: 'FAIL',
          symptom: `${item} 的 Cache-Control=${cc}（immutable）：${url}`,
          cause: '文件名固定而内容每次构建变化——浏览器会长期持有旧版本，重部署后旧 hash chunk 被清理即全 404（2026-09-17 用户实测踩坑）',
          fix: 'nginx 改为 Cache-Control "no-cache"（协商缓存）；带 hash 的 assets 才配长缓存',
        },
      }
    }
    if (!/no-cache|max-age=0/i.test(cc) && !/no-store/i.test(cc)) {
      return {
        res,
        check: {
          app,
          item,
          level: 'WARN',
          symptom: `${item} 缺少 no-cache 缓存头（Cache-Control=${cc || '无'}）：${url}`,
          cause: '浏览器/中间层可能持有旧版本，重部署后行为不可预期',
          fix: 'nginx 为 remoteEntry/manifest/index.html 显式 add_header Cache-Control "no-cache"',
        },
      }
    }
  }
  return { res }
}

/** 从 remoteEntry/manifest/index.html 抽取需抽样验证的 chunk 引用（相对解析，统一去 ./ 前缀） */
export function extractChunkRefs(...sources: string[]): string[] {
  const refs = new Set<string>()
  const add = (raw: string) => refs.add(raw.replace(/^\.\//, ''))
  for (const body of sources) {
    if (!body) continue
    for (const m of body.matchAll(/\.\/([\w./-]+\.js)/g)) add(m[1])
    for (const m of body.matchAll(/"([\w./-]+\.js)"/g)) add(m[1])
    for (const m of body.matchAll(/(?:src|href)="([\w./-]+\.js)"/g)) add(m[1])
  }
  return [...refs]
}

/** 版本协商 skew 预演：同 shareKey 在多应用间版本不一致 → WARN */
export function compareSharedVersions(perAppShared: Array<{ app: string; shared: Array<{ name: string; version: string; singleton?: boolean }> }>): DoctorCheck[] {
  const out: DoctorCheck[] = []
  const byKey = new Map<string, Map<string, Set<string>>>()
  for (const { app, shared } of perAppShared) {
    for (const s of shared ?? []) {
      if (!byKey.has(s.name)) byKey.set(s.name, new Map())
      const byVer = byKey.get(s.name)!
      if (!byVer.has(s.version)) byVer.set(s.version, new Set())
      byVer.get(s.version)!.add(app)
    }
  }
  for (const [key, byVer] of byKey) {
    if (byVer.size <= 1) continue
    const dist = [...byVer.entries()].map(([v, apps]) => `${v}(${[...apps].join('/')})`).join(' vs ')
    out.push({
      app: '*',
      item: `shared 版本 skew：${key}`,
      level: 'WARN',
      symptom: `共享键 "${key}" 在多应用间版本不一致：${dist}`,
      cause: '非 singleton 时页面将按最高版本协商（各应用拿到的实例可能不同）；singleton 时全部收敛到已加载实例——行为需要被知晓而不是撞上',
      fix: '统一各应用依赖版本；singleton 场景确认 skew 告警（MFU-010）可接受',
    })
  }
  return out
}

export async function runDoctor(opts: DoctorOptions): Promise<{ checks: DoctorCheck[]; failed: boolean }> {
  const checks: DoctorCheck[] = []
  const perAppShared: Array<{ app: string; shared: any[] }> = []
  const chunkSample = opts.chunkSample ?? 16

  for (const app of opts.apps) {
    const root = `${opts.base.replace(/\/$/, '')}/${app.replace(/^\//, '')}`

    // 1) remoteEntry：200 + JS 形态 + no-cache
    const entry = await checkStatus(`${root}/fulgur-remoteEntry.js`, app, 'fulgur-remoteEntry.js', {
      expectJs: true,
      expectNoCache: !opts.dev,
    })
    if (entry.check) checks.push(entry.check)
    if (entry.res && !opts.dev) {
      const acao = header(entry.res, 'access-control-allow-origin')
      checks.push({
        app,
        item: 'remoteEntry CORS',
        level: acao ? 'PASS' : 'WARN',
        symptom: acao
          ? `Access-Control-Allow-Origin: ${acao}`
          : 'remoteEntry 未带 Access-Control-Allow-Origin',
        cause: acao ? undefined : '跨源联邦（dev 双端口/异域部署）会被 CORS 拦截；同源部署不受影响',
        fix: acao ? undefined : 'nginx 对 remoteEntry add_header Access-Control-Allow-Origin "*"',
      })
    }

    // 2) manifest：200 + 可解析 + no-cache
    const manifestRes = await checkStatus(`${root}/fulgur-manifest.json`, app, 'fulgur-manifest.json', {
      expectNoCache: !opts.dev,
    })
    if (manifestRes.check) checks.push(manifestRes.check)
    let manifest: any
    if (manifestRes.res?.status === 200) {
      try {
        manifest = JSON.parse(manifestRes.res.body)
        perAppShared.push({ app, shared: manifest.shared ?? [] })
      } catch {
        checks.push({
          app,
          item: 'manifest 解析',
          level: 'FAIL',
          symptom: 'fulgur-manifest.json 不是合法 JSON',
          cause: '产物不完整或被中间层改写',
          fix: '重新构建部署；确认 nginx 未对该路径做 sub/拼接改写',
        })
      }
    }

    // 3) index.html：200 + no-cache（prod；dev 由 vite 自管）；同时作为 chunk 引用抽取源
    let htmlBody = ''
    if (!opts.dev) {
      const html = await checkStatus(`${root}/index.html`, app, 'index.html', { expectNoCache: true })
      if (html.check) checks.push(html.check)
      htmlBody = html.res?.body ?? ''
    }

    // 4) dev：@fulgur-entry.js 直出 JS
    if (opts.dev) {
      const devEntry = await checkStatus(`${root}/@fulgur-entry.js`, app, '@fulgur-entry.js（dev 容器入口）', {
        expectJs: true,
      })
      if (devEntry.check) checks.push(devEntry.check)
    }

    // 5) chunk 抽样可达（覆盖「删一个 chunk」/「重部署清旧 chunk」故障）。
    // 引用面 = remoteEntry imports + manifest exposes 文件 + index.html 脚本/预载 +
    // 首批 chunk 的一跳传递 import（入口 chunk 常只被 index.html 引用，必须下钻一层才能探到）
    if (!opts.dev && manifest) {
      const manifestRefs: string[] = []
      const exposes = manifest.exposes ?? {}
      for (const key of Object.keys(exposes)) {
        const f = exposes[key]?.file
        if (f) manifestRefs.push(String(f).replace(/^\.\//, ''))
      }
      // 顺序即采样优先级：index.html 首屏引用（modulepreload/入口脚本，缺失即白屏）
      // > manifest exposes 文件（联邦页面加载必经）> remoteEntry imports（共享协商面）。
      // nginx 深链回退会把缺失资源兜成 200 HTML，HEAD 状态码不可信——首层必须 GET 查形态
      const htmlRefs = extractChunkRefs(htmlBody)
      const entryRefs = extractChunkRefs(entry.res?.body ?? '')
      const refs = [...new Set([...htmlRefs, ...manifestRefs, ...entryRefs])]
      const resolveUrl = (ref: string) => {
        if (/^(https?:)?\/\//.test(ref)) return ref
        // html 里的引用是站点绝对路径（/app/static/x.js）——从 origin 解析；
        // remoteEntry/manifest 里是应用内相对路径——从应用根解析
        if (ref.startsWith('/')) return new URL(ref, opts.base).href
        return `${root}/${ref}`
      }
      const maskedByFallback = (body: string) => body.trimStart().startsWith('<')
      for (const ref of refs.slice(0, chunkSample)) {
        const url = resolveUrl(ref)
        try {
          const r = await fetchHeadOrGet(url, 'GET')
          if (r.status !== 200) {
            checks.push({
              app,
              item: `chunk 可达：${ref}`,
              level: 'FAIL',
              symptom: `入口/manifest 引用的 chunk 返回 ${r.status}：${url}`,
              cause: '产物不完整或部署后 partial 清理——浏览器持旧 remoteEntry 时典型症状（immutable 坑）',
              fix: '重新完整部署该应用（rsync -a --delete dist/<app>/）；确认缓存头为 no-cache',
            })
          } else if (maskedByFallback(r.body)) {
            checks.push({
              app,
              item: `chunk 可达：${ref}`,
              level: 'FAIL',
              symptom: `chunk 请求返回 200 但内容是 HTML（nginx 深链回退掩盖了资源缺失）：${url}`,
              cause: 'try_files 回退过宽：缺失的静态资源被兜到宿主 index.html，浏览器把它当模块解析直接报错',
              fix: '为静态 assets 目录增加精确匹配（try_files $uri =404 或独立 location），避免 JS 请求被回退成 HTML',
            })
          } else {
            for (const sub of extractChunkRefs(r.body)) if (!refs.includes(sub)) refs.push(sub)
          }
        } catch (e) {
          checks.push({
            app,
            item: `chunk 可达：${ref}`,
            level: 'FAIL',
            symptom: `chunk 请求失败：${url}（${String((e as Error).message ?? e)}）`,
            cause: '网络/部署面异常',
            fix: 'curl 复核该 URL；核对部署完整性',
          })
        }
      }
      for (const ref of refs.slice(chunkSample, chunkSample * 4)) {
        const url = resolveUrl(ref)
        try {
          const r = await fetchHeadOrGet(url, 'HEAD')
          if (r.status !== 200 && r.status !== 404) {
            // 404 视为缺失（首层 GET 已覆盖关键面并区分回退掩盖）；其余非 200 仍报
            checks.push({
              app,
              item: `chunk 可达：${ref}`,
              level: 'FAIL',
              symptom: `chunk 引用返回 ${r.status}：${url}`,
              cause: '产物不完整或部署后 partial 清理',
              fix: '重新完整部署该应用（rsync -a --delete dist/<app>/）',
            })
          }
        } catch {
          /* 深层抽样失败不重复报（首层已覆盖关键面） */
        }
      }
    }
  }

  checks.push(...compareSharedVersions(perAppShared))
  return { checks, failed: checks.some((c) => c.level === 'FAIL') }
}

export function formatDoctorReport(checks: DoctorCheck[]): string {
  const lines: string[] = []
  for (const c of checks) {
    const head = `[fulgur:doctor] ${c.level} [${c.app}] ${c.item}`
    lines.push(c.level === 'PASS' ? `${head} — ${c.symptom}` : `${head}\n  现象：${c.symptom}`)
    if (c.cause) lines.push(`  根因：${c.cause}`)
    if (c.fix) lines.push(`  修法：${c.fix}`)
  }
  const fail = checks.filter((c) => c.level === 'FAIL').length
  const warn = checks.filter((c) => c.level === 'WARN').length
  const pass = checks.filter((c) => c.level === 'PASS').length
  lines.push(`[fulgur:doctor] 汇总：${pass} PASS / ${warn} WARN / ${fail} FAIL`)
  return lines.join('\n')
}
