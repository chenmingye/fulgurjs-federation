/** 发布形态 CLI 冒烟：通过 node dist/cli.js 实际预览/写入与 JSON 失败合同。 */
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

const cli = path.resolve(__dirname, '../dist/cli.js')
const roots: string[] = []
function project() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-init-cli-')); roots.push(cwd)
  fs.mkdirSync(path.join(cwd, 'src'))
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'consumer', dependencies: { vue: '*', '@fulgurjs/federation': '*' } }))
  // 若预览试图加载 Vite/业务模块，会触发 throw；读和改写依然应成功。
  fs.writeFileSync(path.join(cwd, 'vite.config.ts'), "throw new Error('不应执行配置'); export default {plugins: []}")
  return cwd
}
function run(cwd: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [cli, 'init', ...args], { cwd, encoding: 'utf8', timeout: 15000 })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}
afterEach(() => { for (const cwd of roots.splice(0)) fs.rmSync(cwd, { recursive: true, force: true }) })

describe('init 发布形态', () => {
  it('CLI 实际预览/应用/幂等：不运行配置，stdout 纯 JSON，结束无临时记录', () => {
    const cwd = project(), args = ['--plan', '--role', 'consumer', '--remote', 'remote-a=http://localhost:5174/remote-a', '--json']
    const preview = run(cwd, ...args)
    expect(preview.code, preview.stderr).toBe(0)
    const p = JSON.parse(preview.stdout)
    expect(p.written).toBe(false); expect(p.edits).toHaveLength(2)
    expect(fs.existsSync(path.join(cwd, 'fulgurjs.config.ts'))).toBe(false)
    const applied = run(cwd, ...args, '--write')
    expect(applied.code, applied.stderr).toBe(0); expect(JSON.parse(applied.stdout).written).toBe(true)
    expect(fs.existsSync(path.join(cwd, '.fulgurjs-init-pending.json'))).toBe(false)
    expect(JSON.parse(run(cwd, ...args).stdout).edits).toEqual([])
  })
  it('缺 remote 时 --write 退出 1，保留完整待办 JSON，零写入', () => {
    const cwd = project(), result = run(cwd, '--write', '--role', 'consumer', '--json')
    expect(result.code).toBe(1)
    const p = JSON.parse(result.stdout)
    expect(p.written).toBe(false); expect(p.tasks.some((t: {blocking: boolean}) => t.blocking)).toBe(true)
    expect(fs.existsSync(path.join(cwd, 'fulgurjs.config.ts'))).toBe(false)
  })
  it.each([
    ['--plan', '--entry'], ['--plan', '--name'], ['--plan', '--remote', 'bad'],
    ['--plan', '--kind', 'unknown'], ['--plan', '--role', 'provider', '--remote', 'a=http://localhost:1'],
    ['--plan', '--force'], ['--plan', '--typo'],
  ])('缺值、角色冲突与错误参数不能静默成功：%j', (...args) => {
    const result = run(project(), ...args, '--json')
    expect(result.code).not.toBe(0)
    expect(JSON.parse(result.stdout).written).toBe(false)
  })
})
