/**
 * 负向校验管理脚本：运行 tsc --noEmit，断言「编译失败 + 错误信息包含预期关键字」。
 *
 * 本工程长期处于「预期编译失败」状态（src/negative.ts 的三类负向用例）：
 * - tsc 意外通过          → verify 失败（负向用例失效，说明类型面变松，需要更新用例）
 * - tsc 失败但缺预期关键字 → verify 失败（报错形态漂移，需要核对插件类型面）
 * - tsc 失败且关键字齐全   → verify 通过（退出码 0 = 负向验证通过）
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tscBin = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')

/** 每条负向用例：说明 + 必须同时命中的关键字（正则，对合并后的 tsc 输出匹配） */
const CASES = [
  {
    name: '引用不存在的远程模块类型（pc-remote/pages/ghost）',
    keywords: [/pc-remote\/pages\/ghost/, /TS2307|Cannot find module/],
  },
  {
    name: '引用存在 expose 上不存在的导出（fetchOrderss）',
    keywords: [/fetchOrderss/, /TS2305|TS2724|has no exported member/],
  },
  {
    name: 'definePages 传非法结构（route: 404 / remotes: 字符串）',
    keywords: [/not assignable|does not satisfy|TS2322|TS2344/],
  },
]

const run = spawnSync(process.execPath, [tscBin, '--noEmit', '--pretty', 'false', '-p', 'tsconfig.json'], {
  cwd: projectRoot,
  encoding: 'utf8',
})
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`

if (run.status === 0) {
  console.error('[negative:verify] FAIL——tsc --noEmit 意外通过：负向用例失效（预期编译失败未发生）。')
  console.error('src/negative.ts 必须保持「预期编译失败」状态；若插件类型面已变化，请同步更新用例与关键字。')
  process.exit(1)
}

let failed = false
for (const c of CASES) {
  const ok = c.keywords.every((re) => re.test(output))
  console.log(`[negative:verify] ${ok ? 'PASS' : 'FAIL'}——${c.name}`)
  if (!ok) failed = true
}

console.log('[negative:verify] tsc 退出码（预期非 0）：%s', run.status)
console.log('[negative:verify] tsc 错误输出摘录（前 40 行）：')
for (const line of output.split('\n').filter(Boolean).slice(0, 40)) {
  console.log(`  ${line}`)
}

if (failed) {
  console.error('[negative:verify] FAIL——tsc 如期失败，但错误输出缺少预期关键字（报错形态漂移，需核对）。')
  process.exit(1)
}
console.log('[negative:verify] 全部负向断言通过：编译如预期失败，且三类错误关键字齐全（verify 退出码 0 = 负向验证通过）。')
