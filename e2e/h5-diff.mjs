// H5/H6 校验：三环境（dev/prod/qiankun 基线）结果 JSON 逐条 diff
// 用法：node h5-diff.mjs
import fs from 'node:fs'

const DIR = '/Users/Admin/Desktop/ai 杂物/插件/vite-plugin-unifed/docs/func-results'
const load = (f) => JSON.parse(fs.readFileSync(`${DIR}/${f}.json`, 'utf8'))

const flat = (obj, prefix = '') => {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') Object.assign(out, flat(v, prefix + k + '.'))
    else out[prefix + k] = v
  }
  return out
}

const compare = (label, a, b, ignoreKeys = []) => {
  const fa = flat(a)
  const fb = flat(b)
  const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter((k) => !ignoreKeys.some((i) => k.includes(i)))
  const diffs = []
  for (const k of keys) {
    if (JSON.stringify(fa[k]) !== JSON.stringify(fb[k])) diffs.push(`${k}: ${JSON.stringify(fa[k])} vs ${JSON.stringify(fb[k])}`)
  }
  return { label, same: diffs.length === 0, diffs }
}

const report = []

// ---- 功能闭环套件（只比较 ok 布尔与关键断言，忽略耗时类字段） ----
const suiteNames = [
  ['五页CRUD', 'dev', 'prod'],
  ['五页CRUD', 'qiankun-crud', 'dev'],
  ['动作闭环', 'dev-actions', 'prod-actions'],
  ['动作闭环', 'qiankun-actions-actions', 'dev-actions'],
  ['全链路', 'dev-flow', 'prod-flow'],
  ['全链路', 'qiankun-flow-flow', 'dev-flow'],
]

const pickOk = (d) => {
  const out = {}
  for (const [k, v] of Object.entries(d.results ?? d)) {
    if (v && typeof v === 'object' && 'ok' in v) out[k] = v.ok
  }
  return out
}

for (const [label, fa, fb] of suiteNames) {
  try {
    const A = pickOk(load(fa))
    const B = pickOk(load(fb))
    const r = compare(label, A, B)
    const allGreenA = Object.values(A).every((x) => x === true)
    const allGreenB = Object.values(B).every((x) => x === true)
    report.push({ suite: label, pair: `${fa} vs ${fb}`, h5一致: r.same, 双方全绿: allGreenA && allGreenB, diffs: r.diffs })
  } catch (e) {
    report.push({ suite: label, pair: `${fa} vs ${fb}`, error: String(e).slice(0, 120) })
  }
}

// ---- 控制台报错（H1）----
for (const env of ['dev', 'prod']) {
  try {
    const d = load(`${env}-console-errors`)
    const total = Object.values(d).reduce((a, b) => a + b.count, 0)
    report.push({ suite: 'H1控制台报错', env, 总数: total, 达标: total === 0 })
  } catch {}
}

fs.writeFileSync(`${DIR}/h5-h6-diff.json`, JSON.stringify(report, null, 2))
for (const r of report) {
  console.log(JSON.stringify(r))
}
