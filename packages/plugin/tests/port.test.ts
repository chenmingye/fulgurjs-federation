import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyPortChange, formatPortPlan, planPortChange } from '../src/port'

/** 最小模板工程夹具（dev.config.json + 应用 package.json + 宿主配置 + README） */
function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-port-'))
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(root, 'remote'), { recursive: true })
  fs.mkdirSync(path.join(root, 'host'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'scripts/dev.config.json'),
    JSON.stringify({ apps: [
      { name: 'remote', dir: 'remote', port: 5333 },
      { name: 'host', dir: 'host', port: 5334, host: true },
    ] }, null, 2),
  )
  fs.writeFileSync(
    path.join(root, 'remote/package.json'),
    JSON.stringify({ name: 'remote', scripts: { dev: 'vite --port 5333 ', preview: 'vite preview --port 5333 ' } }),
  )
  fs.writeFileSync(
    path.join(root, 'host/package.json'),
    JSON.stringify({ name: 'host', scripts: { dev: 'vite --port 5334 ' } }),
  )
  fs.writeFileSync(
    path.join(root, 'host/fulgurjs.config.ts'),
    "remotes: { remote: { dev: 'http://localhost:5333/remote', prod: '/remote' } }",
  )
  fs.writeFileSync(path.join(root, 'README.md'), '| remote | 5333 |\n| host | 5334 |\n')
  return root
}

describe('fulgurjs port', () => {
  it('计划覆盖四处且默认不写盘；--write 后全部更新、其他端口不受影响', () => {
    const root = makeProject()
    const plan = planPortChange(root, 'remote', 5340)
    expect(plan.from).toBe(5333)
    const byFile = new Map(plan.plans.map((p) => [path.basename(p.file), p]))
    expect(byFile.get('package.json')?.status).toBe('planned') // remote 自己的
    expect(byFile.get('dev.config.json')?.status).toBe('planned')
    expect(byFile.get('fulgurjs.config.ts')?.status).toBe('planned')
    expect(byFile.get('README.md')?.status).toBe('planned')
    // 预览不写盘
    expect(fs.readFileSync(path.join(root, 'remote/package.json'), 'utf8')).toContain('5333')
    // 写入
    const written = applyPortChange(root, plan)
    expect(written).toBe(4)
    expect(fs.readFileSync(path.join(root, 'remote/package.json'), 'utf8')).toContain('--port 5340 ')
    expect(fs.readFileSync(path.join(root, 'scripts/dev.config.json'), 'utf8')).toContain('5340')
    expect(fs.readFileSync(path.join(root, 'host/fulgurjs.config.ts'), 'utf8')).toContain('localhost:5340/remote')
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toContain('| 5340 |')
    // 其他应用的端口与宿主脚本不动
    expect(fs.readFileSync(path.join(root, 'host/package.json'), 'utf8')).toContain('5334')
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toContain('| 5334 |')
    // 词边界：15333 不受 5333 替换影响
    fs.writeFileSync(path.join(root, 'remote/package.json'), '{"x": 15333}')
    const plan2 = planPortChange(root, 'remote', 5341)
    expect(plan2.plans.find((p) => p.file.endsWith('remote/package.json'))?.hits).toBe(0)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('未知应用 / 相同端口 / 全部未命中 → 明确报错；格式化输出可读', () => {
    const root = makeProject()
    expect(() => planPortChange(root, 'nope', 5340)).toThrow(/没有应用/)
    expect(() => planPortChange(root, 'remote', 5333)).toThrow(/已是端口/)
    const missing = makeProject()
    fs.rmSync(path.join(missing, 'README.md'))
    fs.rmSync(path.join(missing, 'host'), { recursive: true, force: true })
    // 根 fulgurjs.config.ts 存在但无旧端口 → not-found 进入 notes
    fs.writeFileSync(path.join(missing, 'fulgurjs.config.ts'), 'export default {}')
    const plan = planPortChange(missing, 'remote', 5340)
    expect(plan.notes.join('\n')).toMatch(/未发现旧端口|不存在/)
    expect(formatPortPlan(missing, plan)).toMatch(/预览模式未写盘/)
    fs.rmSync(missing, { recursive: true, force: true })
    fs.rmSync(root, { recursive: true, force: true })
  })
})
