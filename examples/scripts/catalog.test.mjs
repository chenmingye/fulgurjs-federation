import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appLocation, loadScenarios, runCommand, ensureInstalled } from './lib.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('干净检出所需的工程与锁文件完整，校验不依赖调用目录', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fulgurjs-catalog-'))
  try {
    const output = execFileSync(process.execPath, [path.join(root, 'examples/scripts/check-catalog.mjs')], { cwd: dir, encoding: 'utf8' })
    assert.match(output, /场景目录核对通过/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('模板宿主与远程在同一 workspace 安装；Jeecg 保留 pnpm，功能演示保留 npm', () => {
  const scenarios = loadScenarios()
  const basic = scenarios.find((scenario) => scenario.id === 'vue-basic')
  assert.equal(appLocation(basic.apps[0]).installDir, appLocation(basic.apps[1]).installDir)
  assert.equal(appLocation(basic.apps[0]).packageManager, 'pnpm')
  assert.equal(appLocation(scenarios.find((scenario) => scenario.id === 'shared-runtime').apps[0]).packageManager, 'npm')
  assert.equal(appLocation(scenarios.find((scenario) => scenario.id === 'jeecg').apps.find((app) => app.name === 'jeecg-a')).packageManager, 'pnpm')
})

test('失败命令必须拒绝，不能用安装残留继续启动', async () => {
  await assert.rejects(runCommand(process.execPath, ['-e', 'process.exit(7)'], root, () => {}), /退出码 7/)
  await assert.rejects(runCommand('__fulgurjs_missing_command__', [], root, () => {}), { code: 'ENOENT' })
})

test('无 package.json 的演示数据服务不执行包安装', async () => {
  const app = loadScenarios().find((scenario) => scenario.id === 'jeecg').apps.find((item) => item.role === 'service')
  const messages = []
  await ensureInstalled(app, (message) => messages.push(message))
  assert.deepEqual(messages, [])
})
