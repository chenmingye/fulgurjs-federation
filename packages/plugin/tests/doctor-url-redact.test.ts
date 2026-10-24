import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * D16 回归：doctor --base 输出中的 URL 必须脱敏 userinfo/query/hash。
 * 复现：--base http://user:secret@localhost:<dead-port> 时，
 * 旧实现把 user:secret@ 原样回显在“不可达”症状里（3 处）。
 */
const cli = join(__dirname, '..', 'dist', 'cli.js')
let root: string

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [cli, ...args], { encoding: 'utf8', cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'fg-doctor-redact-'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('doctor --base：URL 敏感信息脱敏（D16）', () => {
  it('URL userinfo 不出现在可达性诊断输出（现象行）', () => {
    const r = run(['doctor', '--base', 'http://user:secretpw@localhost:9', '--apps', 'main'])
    expect(r.code).toBe(1)
    const text = r.stdout + r.stderr
    expect(text, 'userinfo 不得泄露到 CLI 输出').not.toContain('secretpw')
    expect(text, '保留 host:port 便于定位').toContain('localhost:9')
  })

  it('--json 模式同样脱敏', () => {
    const r = run(['doctor', '--base', 'http://u:p@localhost:9', '--apps', 'main', '--json'])
    const text = r.stdout + r.stderr
    expect(text).not.toContain('u:p@')
  })
})
