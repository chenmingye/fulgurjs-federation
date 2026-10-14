/**
 * doctor --config CLI 层合同：参数校验退出码、JSON stdout 可机读、FAIL 退出 1。
 * 经真实 node dist/cli.js 子进程执行（发布形态）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js')
let root = ''

beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'fg-doctor-cli-')) })
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

function run(args: string[], cwd = root): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [cli, ...args], { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

describe('doctor --config：CLI 参数与输出合同', () => {
  it('D5 --config 缺值 / 空值 → 退出 2（用法错误）', () => {
    expect(run(['doctor', '--config']).code).toBe(2)
    expect(run(['doctor', '--config', '']).code).toBe(2)
    expect(run(['doctor', '--config', '']).stderr).toContain('缺少路径')
  })

  it('D5 与 --base / --apps 混用（含空值）→ 退出 2', () => {
    expect(run(['doctor', '--config', 'x', '--base', 'http://s']).code).toBe(2)
    expect(run(['doctor', '--config', 'x', '--apps', 'a']).code).toBe(2)
    expect(run(['doctor', '--config', 'x', '--base', '']).code).toBe(2)
    expect(run(['doctor', '--config', 'x', '--apps', '']).code).toBe(2)
  })

  it('D1/D4 缺 expose 文件：--json 输出可机读的 FAIL 报告，退出 1', () => {
    writeFileSync(join(root, 'fulgurjs.config.ts'),
      "export default { name: 'cli-app', exposes: { './bridge': './src/missing.ts' } }\n")
    const r = run(['doctor', '--config', './fulgurjs.config.ts', '--json'])
    expect(r.code, '确定缺文件 → FAIL 退出 1（不是用法错误 2）').toBe(1)
    const parsed = JSON.parse(r.stdout) as {
      mode: string; failed: boolean
      checks: { item: string; level: string; symptom: string }[]
    }
    expect(parsed.mode).toBe('source')
    expect(parsed.failed).toBe(true)
    expect(parsed.checks.some(c => c.level === 'FAIL' && /不存在/.test(c.symptom))).toBe(true)
  })

  it('D4 有效配置：--json 退出 0；stdout 是纯 JSON（诊断走 stderr 或不含杂质）', () => {
    writeFileSync(join(root, 'src-main.ts'), 'export default 1\n')
    writeFileSync(join(root, 'fulgurjs.config.ts'),
      "export default { name: 'cli-ok', exposes: { './a': './src-main.ts' } }\n")
    const r = run(['doctor', '--config', './fulgurjs.config.ts', '--json'])
    expect(r.code).toBe(0)
    const parsed = JSON.parse(r.stdout) as { failed: boolean; complete: boolean }
    expect(parsed.failed).toBe(false)
  })

  it('D10 原 --base 站点 doctor 用法不受影响（参数校验层面）', () => {
    const r = run(['doctor'])
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('--base')
  })
})
