/**
 * `fulgurjs port <应用> <新端口>` —— 模板工程的端口统一变更（UX-05）。
 *
 * 端口在模板工程里作用于四处：应用 package.json 的 dev/preview 脚本、宿主
 * fulgurjs.config.ts 里该远程的 dev 地址、scripts/dev.config.json 的探活端口、
 * 模板 README 的端口表。手工改四处容易漏——本命令一次计划、逐文件核对、
 * 默认只预览（--write 才写入），写入前后内容可由 git 回退。
 *
 * 只改与旧端口精确相关的片段（`:<旧端口>` 的词边界匹配），不触碰其他端口与生产地址。
 */
import fs from 'node:fs'
import path from 'node:path'

export interface PortPlan {
  file: string
  /** 旧端口在本文件的出现次数 */
  hits: number
  status: 'planned' | 'not-found' | 'missing-file'
}

export interface PortPlanResult {
  app: string
  dir: string
  from: number
  to: number
  plans: PortPlan[]
  /** 必须人工确认的提示（README 无法安全定位表格时的指引等） */
  notes: string[]
}

interface DevAppConfig {
  apps: Array<{ name: string; dir: string; port: number; host?: boolean }>
}

function readDevConfig(root: string): DevAppConfig {
  const file = path.join(root, 'scripts', 'dev.config.json')
  if (!fs.existsSync(file)) {
    throw new Error(
      '[fulgurjs:port] 未找到 scripts/dev.config.json——本命令用于模板工程（create 生成）。\n' +
        '  修法：在模板工程根目录运行；自建工程请按文档四处清单手工改端口',
    )
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as DevAppConfig
}

/** 词边界替换端口（避免 5333 → 15333 的子串误伤；markdown/JSON/脚本通用） */
function replacePort(text: string, from: number, to: number): { text: string; hits: number } {
  const re = new RegExp(`(?<![0-9])${from}(?![0-9])`, 'g')
  let hits = 0
  const out = text.replace(re, () => {
    hits++
    return String(to)
  })
  return { text: out, hits }
}

/** 生成端口变更计划（默认；不写盘）。README 存在时纳入计划，由词边界替换保证安全。 */
export function planPortChange(root: string, app: string, to: number): PortPlanResult {
  const cfg = readDevConfig(root)
  const target = cfg.apps.find((a) => a.name === app || a.dir === app)
  if (!target) {
    throw new Error(
      `[fulgurjs:port] dev.config.json 中没有应用「${app}」。现有应用：${cfg.apps.map((a) => a.name).join('、')}`,
    )
  }
  const from = target.port
  if (from === to) {
    throw new Error(`[fulgurjs:port] ${app} 已是端口 ${to}，无需变更`)
  }
  const notes: string[] = []
  const candidates: Array<{ file: string; required: boolean }> = [
    { file: path.join(root, target.dir, 'package.json'), required: true },
    { file: path.join(root, 'scripts', 'dev.config.json'), required: true },
    { file: path.join(root, 'fulgurjs.config.ts'), required: false },
    { file: path.join(root, 'README.md'), required: false },
  ]
  // 多应用模板：宿主 fulgurjs.config.ts 在宿主子目录
  for (const a of cfg.apps) {
    if (a.host && a.dir !== target.dir) {
      candidates.push({ file: path.join(root, a.dir, 'fulgurjs.config.ts'), required: false })
    }
  }
  const plans: PortPlan[] = []
  for (const c of candidates) {
    if (!fs.existsSync(c.file)) {
      if (c.required) plans.push({ file: c.file, hits: 0, status: 'missing-file' })
      continue
    }
    const text = fs.readFileSync(c.file, 'utf8')
    const { hits } = replacePort(text, from, to)
    plans.push({ file: c.file, hits, status: hits > 0 ? 'planned' : 'not-found' })
  }
  if (!plans.some((p) => p.status === 'planned')) {
    throw new Error(
      `[fulgurjs:port] 旧端口 ${from} 未在任何受影响文件中出现——工程可能已手工改过。请核对 scripts/dev.config.json 与文档`,
    )
  }
  const notFound = plans.filter((p) => p.status === 'not-found' || p.status === 'missing-file')
  if (notFound.length) {
    notes.push(`以下文件未发现旧端口 ${from}（可能已改或形态不同，请人工确认）：${notFound.map((p) => path.relative(root, p.file)).join('、')}`)
  }
  return { app: target.name, dir: target.dir, from, to, plans, notes }
}

/** 应用计划：仅写入 hits>0 的文件；返回写入文件数 */
export function applyPortChange(root: string, plan: PortPlanResult): number {
  let written = 0
  for (const p of plan.plans) {
    if (p.status !== 'planned' || p.hits === 0) continue
    const text = fs.readFileSync(p.file, 'utf8')
    const { text: out, hits } = replacePort(text, plan.from, plan.to)
    if (hits > 0) {
      fs.writeFileSync(p.file, out)
      written++
    }
  }
  return written
}

export function formatPortPlan(root: string, plan: PortPlanResult): string {
  const lines: string[] = []
  lines.push(`[fulgurjs:port] 计划：${plan.app}（目录 ${plan.dir}）端口 ${plan.from} → ${plan.to}`)
  for (const p of plan.plans) {
    const rel = path.relative(root, p.file)
    if (p.status === 'planned') lines.push(`  改写 ${rel}（${p.hits} 处）`)
    else if (p.status === 'not-found') lines.push(`  跳过 ${rel}（未发现旧端口 ${plan.from}）`)
    else lines.push(`  跳过 ${rel}（文件不存在）`)
  }
  for (const n of plan.notes) lines.push(`  注：${n}`)
  lines.push('预览模式未写盘；确认无误后加 --write 执行。写入可用 git checkout <file> 回退。')
  return lines.join('\n')
}
