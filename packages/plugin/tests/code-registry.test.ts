/**
 * 错误码三方一致性（防漂移）：源码定义 ⊆ 登记表 CODE_REGISTRY = README「错误码总表」。
 * 校验逻辑单一实现于 scripts/check-manual-codes.mjs（build 门禁同源），本测试 spawn 它，
 * 避免测试与门禁两套实现各自漂移。
 * 背景（2026-09-22 修复）：CC 段曾只写进 README 未登记进 CODE_REGISTRY，旧脚本正则不含
 * CC 段、只做单向校验，且从未接进 CI——漂移长期无人发现（下文用例 2 即该事故复现）。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const pkgRoot = path.resolve(__dirname, '..')
const scriptRel = 'scripts/check-manual-codes.mjs'
const repoRoot = path.resolve(pkgRoot, '../..')
const tmpDirs: string[] = []

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true })
})

/**
 * 门禁脚本按自身所在位置推导仓库根，故隔离环境必须复制成同样的相对结构，
 * 返回该环境下的脚本路径与可编辑的副本路径。
 */
function mirrorFixtureToTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-codes-'))
  tmpDirs.push(dir)
  const pluginDir = path.join(dir, 'packages/plugin')
  const mirror = (rel: string) => {
    const dest = path.join(pluginDir, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(path.join(pkgRoot, rel), dest)
    return dest
  }
  mirror(scriptRel)
  mirror('src/context.ts')
  mirror('src/runtime/errors.ts')
  fs.copyFileSync(path.join(repoRoot, 'README.md'), path.join(dir, 'README.md'))
  return {
    dir,
    script: path.join(pluginDir, scriptRel),
    registry: mirror('src/diagnostics.ts'),
    readme: path.join(dir, 'README.md'),
  }
}

function runGate(script: string) {
  // stderr 显式管道化：execFileSync 默认会把子进程 stderr 直接漏到父进程终端，污染测试输出
  const stdio: ['ignore', 'pipe', 'pipe'] = ['ignore', 'pipe', 'pipe']
  try {
    return { ok: true, output: execFileSync('node', [script], { encoding: 'utf8', stdio }) }
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string }
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

describe('错误码三方一致性（防漂移门禁）', () => {
  it('当前仓库通过，且脚本报出的登记数与 CODE_REGISTRY 实际条目数一致（防扫描空转）', () => {
    const registry = fs.readFileSync(path.join(pkgRoot, 'src/diagnostics.ts'), 'utf8')
    const actual = [...registry.matchAll(/code: '[A-Z]{2,4}-\d{3}'/g)].length
    expect(actual).toBeGreaterThan(0)

    const { ok, output } = runGate(path.join(pkgRoot, scriptRel))
    expect(output, '门禁未通过').toContain('错误码三方一致')
    expect(ok).toBe(true)
    expect(Number(output.match(/登记 (\d+) =/)?.[1])).toBe(actual)
  })

  it('登记表漏登记 CC-001 → 非零退出并同时报出源码定义侧与 README 侧（原事故复现）', () => {
    const f = mirrorFixtureToTmp()
    expect(runGate(f.script).ok, '未注入漂移时不应失败').toBe(true)

    fs.writeFileSync(f.registry, fs.readFileSync(f.registry, 'utf8').replace(/^.*\{ code: 'CC-001'.*$/m, ''))

    const { ok, output } = runGate(f.script)
    expect(ok).toBe(false)
    expect(output).toContain('CC-001 源码已定义但未登记进 CODE_REGISTRY')
    expect(output).toContain('CC-001 README 错误码总表有条目但未登记进 CODE_REGISTRY')
  })

  it('README 码表出现未登记的码 → 非零退出', () => {
    const f = mirrorFixtureToTmp()
    const readme = fs.readFileSync(f.readme, 'utf8')
    fs.writeFileSync(
      f.readme,
      readme.replace(/(###\s*6\.\s*错误码总表[\s\S]*?)(\n###\s)/, '$1\n| | `MFU-099` | 注入测试条目 |$2'),
    )

    const { ok, output } = runGate(f.script)
    expect(ok).toBe(false)
    expect(output).toContain('MFU-099 README 错误码总表有条目但未登记进 CODE_REGISTRY')
  })
})
