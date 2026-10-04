/**
 * `fulgurjs create` 单测：复制排除/非空保护/完整性校验/入口提示/目录名/交互缺失。
 * 全部经注入 io 与 templatesRoot 驱动，不联网、不执行 pnpm。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TEMPLATE_CATALOG,
  copyTemplate,
  copyMissingFiles,
  scanTemplateConflicts,
  isExcluded,
  readDevConfig,
  resolveTemplatesRoot,
  createProject,
  nodeVersionWarning,
  type CreateIo,
} from '../src/create'

function makeTemplatesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-tpl-'))
  const tpl = path.join(root, 'vue-vue')
  fs.mkdirSync(path.join(tpl, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(tpl, 'package.json'), JSON.stringify({ private: true }))
  // dev.config.json 引用的两个子应用：插件依赖声明在子应用 package.json（workspace 根不声明）
  for (const app of ['remote', 'host']) {
    fs.mkdirSync(path.join(tpl, app), { recursive: true })
    fs.writeFileSync(
      path.join(tpl, app, 'package.json'),
      JSON.stringify({ name: `demo-${app}`, dependencies: { '@fulgurjs/federation': '5.8.0' } }),
    )
  }
  fs.writeFileSync(path.join(tpl, 'pnpm-workspace.yaml'), 'packages:\n  - host\n  - remote\n')
  fs.writeFileSync(path.join(tpl, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
  fs.writeFileSync(path.join(tpl, 'scripts/dev.mjs'), '// runner\n')
  fs.writeFileSync(
    path.join(tpl, 'scripts/dev.config.json'),
    JSON.stringify({ apps: [{ name: 'remote', dir: 'remote', port: 5213 }, { name: 'host', dir: 'host', port: 5214 }] }),
  )
  fs.writeFileSync(path.join(tpl, 'README.md'), '# demo\n')
  // 应被排除的安装痕迹
  fs.mkdirSync(path.join(tpl, 'node_modules/.pnpm'), { recursive: true })
  fs.writeFileSync(path.join(tpl, 'node_modules/.pnpm/x.js'), 'x')
  fs.mkdirSync(path.join(tpl, 'host/dist'), { recursive: true })
  fs.writeFileSync(path.join(tpl, 'host/dist/index.html'), 'x')
  fs.writeFileSync(path.join(tpl, 'host/.DS_Store'), 'x')
  fs.writeFileSync(path.join(tpl, 'debug.log'), 'x')
  return root
}

function makeIo(installCode = 0): { io: CreateIo; prompts: string[]; logs: string[] } {
  const logs: string[] = []
  const prompts: string[] = []
  return {
    prompts,
    logs,
    io: {
      log: (m) => logs.push(m),
      out: (m) => logs.push('OUT:' + m),
      error: (m) => logs.push('ERR:' + m),
      prompt: async (q) => {
        prompts.push(q)
        return 'vue-vue'
      },
      install: async () => installCode,
    },
  }
}

const baseOpts = (templatesRoot: string, cwd: string, extra: Partial<Parameters<typeof createProject>[0]> = {}) => ({
  templatesRoot,
  cwd,
  install: false,
  ...extra,
})

describe('fulgurjs create', () => {
  it('目录名清单与仓库五模板一致', () => {
    expect(TEMPLATE_CATALOG.map((t) => t.name)).toEqual([
      'vue-vue',
      'react-react',
      'vue-host-react-remote',
      'react-host-vue-remote',
      'showcase',
    ])
  })

  it('复制排除 node_modules/dist/.vite/.run/.DS_Store/*.log，保留锁文件与脚本', () => {
    expect(isExcluded('node_modules')).toBe(true)
    expect(isExcluded('dist')).toBe(true)
    expect(isExcluded('.vite')).toBe(true)
    expect(isExcluded('.run')).toBe(true)
    expect(isExcluded('.DS_Store')).toBe(true)
    expect(isExcluded('error.log')).toBe(true)
    expect(isExcluded('pnpm-lock.yaml')).toBe(false)
    expect(isExcluded('dev.config.json')).toBe(false)

    const root = makeTemplatesRoot()
    const dest = path.join(root, 'out')
    copyTemplate(path.join(root, 'vue-vue'), dest)
    expect(fs.existsSync(path.join(dest, 'pnpm-lock.yaml'))).toBe(true)
    expect(fs.existsSync(path.join(dest, 'scripts/dev.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(dest, 'node_modules'))).toBe(false)
    expect(fs.existsSync(path.join(dest, 'host/dist'))).toBe(false)
    expect(fs.existsSync(path.join(dest, 'host/.DS_Store'))).toBe(false)
    expect(fs.existsSync(path.join(dest, 'debug.log'))).toBe(false)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('完整创建：默认目录 = 模板名，输出含 cd/入口/端口/构建提示；install 可跳过', async () => {
    const root = makeTemplatesRoot()
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-create-'))
    const { io, logs } = makeIo()
    const r = await createProject(baseOpts(root, cwd), io)
    expect(r.template).toBe('vue-vue')
    expect(r.target).toBe(path.join(cwd, 'vue-vue'))
    expect(r.pluginVersion).toBe('5.8.0')
    expect(r.installRan).toBe(false)
    expect(r.apps.map((a) => a.port)).toEqual([5213, 5214])
    const text = logs.join('\n')
    expect(text).toContain(`cd ${path.join(cwd, 'vue-vue')}`)
    expect(text).toContain('pnpm install --frozen-lockfile')
    expect(text).toContain('pnpm dev')
    expect(text).toContain('http://localhost:5214/')
    expect(text).toContain('pnpm build')
    expect(text).toContain('部署子目录')
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('--dir 自定义目标 + 默认安装；安装失败抛错且带退出码', async () => {
    const root = makeTemplatesRoot()
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-create-'))
    const failing = makeIo(7)
    await expect(createProject(baseOpts(root, cwd, { dir: 'my-app', install: true }), failing.io)).rejects.toThrow(/退出码 7/)
    // 失败不冒充成功：目录已复制但输出不包含成功提示
    expect(failing.logs.join('\n')).not.toContain('后续步骤')
    const ok = makeIo(0)
    const r = await createProject(baseOpts(root, cwd, { dir: 'my-app2', install: true }), ok.io)
    expect(r.target).toBe(path.join(cwd, 'my-app2'))
    expect(r.installRan).toBe(true)
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('非空目标默认拒绝；--force 只增不删', async () => {
    const root = makeTemplatesRoot()
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-create-'))
    const target = path.join(cwd, 'existing')
    fs.mkdirSync(target)
    fs.writeFileSync(path.join(target, 'user-file.txt'), 'keep me')
    const { io } = makeIo()
    await expect(createProject(baseOpts(root, cwd, { dir: 'existing' }), io)).rejects.toThrow(/非空.*--force/s)
    await createProject(baseOpts(root, cwd, { dir: 'existing', force: true }), io)
    expect(fs.readFileSync(path.join(target, 'user-file.txt'), 'utf8')).toBe('keep me')
    expect(fs.existsSync(path.join(target, 'pnpm-lock.yaml'))).toBe(true)
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('--force 同名冲突不改写：package.json / 锁文件内容保持用户版本，冲突逐项列出', async () => {
    const root = makeTemplatesRoot()
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-create-'))
    const target = path.join(cwd, 'conflict')
    fs.mkdirSync(target, { recursive: true })
    const userPkg = JSON.stringify({ name: 'user-project', private: true, custom: 'mine' })
    fs.writeFileSync(path.join(target, 'package.json'), userPkg)
    const userLock = 'lockfileVersion: USER-LOCK'
    fs.writeFileSync(path.join(target, 'pnpm-lock.yaml'), userLock)
    const { io, logs } = makeIo()
    const r = await createProject(baseOpts(root, cwd, { dir: 'conflict', force: true, json: true }), io)
    // 用户文件内容逐字节保留（不是只看存在性）
    expect(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).toBe(userPkg)
    expect(fs.readFileSync(path.join(target, 'pnpm-lock.yaml'), 'utf8')).toBe(userLock)
    // 模板里用户没有的文件补齐
    expect(fs.existsSync(path.join(target, 'scripts/dev.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(target, 'remote/package.json'))).toBe(true)
    expect(r.copiedCount).toBeGreaterThan(0)
    expect(r.skippedConflicts.map((c) => c.rel).sort()).toEqual(['package.json', 'pnpm-lock.yaml'])
    const out = logs.filter((l) => l.startsWith('OUT:')).join('\n')
    expect(out).toContain('pnpm-lock.yaml')
    expect(out).toContain('保留你的版本')
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('--force 文件/目录类型冲突与符号链接目标：跳过并列出，不写入不穿透', async () => {
    const root = makeTemplatesRoot()
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-create-'))
    const target = path.join(cwd, 'typedir')
    fs.mkdirSync(target, { recursive: true })
    // 模板 scripts 是目录 → 目标 scripts 放成文件：类型冲突，整个子树不写
    fs.writeFileSync(path.join(target, 'scripts'), 'i am a file')
    // 模板 host/package.json 是文件 → 目标同路径放符号链接：不穿透写入
    fs.mkdirSync(path.join(target, 'host'), { recursive: true })
    fs.symlinkSync('/etc/hostname', path.join(target, 'host', 'package.json'))
    // 单元层：预检完整列出两类冲突，copyMissingFiles 不写这些路径
    const conflicts = scanTemplateConflicts(path.join(root, 'vue-vue'), target)
    const rels = conflicts.map((c) => c.rel)
    expect(rels).toContain('scripts')
    expect(rels).toContain('host/package.json')
    const outcome = copyMissingFiles(path.join(root, 'vue-vue'), target, conflicts)
    expect(fs.readFileSync(path.join(target, 'scripts'), 'utf8')).toBe('i am a file')
    expect(fs.readlinkSync(path.join(target, 'host', 'package.json'))).toBe('/etc/hostname')
    expect(outcome.skipped.map((c) => c.rel).sort()).toEqual(['host/package.json', 'scripts'])
    expect(outcome.copied).toContain('pnpm-workspace.yaml')
    // 工程层：类型冲突挡住 scripts/dev.mjs 关键文件 → 明确报错，用户文件原样
    const { io } = makeIo()
    await expect(createProject(baseOpts(root, cwd, { dir: 'typedir', force: true }), io)).rejects.toThrow(/scripts\/dev\.mjs/)
    expect(fs.readFileSync(path.join(target, 'scripts'), 'utf8')).toBe('i am a file')
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('目标路径是文件 → 拒绝；全存在的 --force 重跑 = 幂等零改写', async () => {
    const root = makeTemplatesRoot()
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-create-'))
    const asFile = path.join(cwd, 'occupied')
    fs.writeFileSync(asFile, 'not a dir')
    const { io } = makeIo()
    await expect(createProject(baseOpts(root, cwd, { dir: 'occupied', force: true }), io)).rejects.toThrow(/目标路径已存在且是文件/)
    // 幂等：完整工程上重跑 --force → copiedCount 0、内容不变
    const target = path.join(cwd, 'again')
    await createProject(baseOpts(root, cwd, { dir: 'again' }), io)
    const before = fs.readFileSync(path.join(target, 'package.json'), 'utf8')
    const r2 = await createProject(baseOpts(root, cwd, { dir: 'again', force: true }), io)
    expect(r2.copiedCount).toBe(0)
    expect(r2.skippedConflicts.length).toBeGreaterThan(0)
    expect(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).toBe(before)
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('copyTemplate 直遇冲突 → 抛错且不写任何文件', () => {
    const root = makeTemplatesRoot()
    const dest = path.join(root, 'blocked')
    fs.mkdirSync(dest)
    fs.writeFileSync(path.join(dest, 'package.json'), 'user')
    expect(() => copyTemplate(path.join(root, 'vue-vue'), dest)).toThrow(/同名冲突/)
    expect(fs.readFileSync(path.join(dest, 'package.json'), 'utf8')).toBe('user')
    expect(fs.existsSync(path.join(dest, 'pnpm-lock.yaml'))).toBe(false)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('未知模板 / 包内模板缺失 / 复制后缺关键文件 → 明确报错', async () => {
    const root = makeTemplatesRoot()
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-create-'))
    const { io } = makeIo()
    await expect(createProject(baseOpts(root, cwd, { template: 'nope' }), io)).rejects.toThrow(/未知模板/)
    await expect(createProject(baseOpts(root, cwd, { template: 'showcase' }), io)).rejects.toThrow(/模板不完整/)
    // 缺 scripts/dev.config.json → 完整性校验失败
    fs.rmSync(path.join(root, 'vue-vue/scripts/dev.config.json'))
    await expect(createProject(baseOpts(root, cwd), io)).rejects.toThrow(/dev\.config\.json/)
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('缺参且非 TTY：CLI 不应走到交互——createProject 的 prompt 抛错会传播', async () => {
    const root = makeTemplatesRoot()
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-create-'))
    const io: CreateIo = {
      log: () => {},
      error: () => {},
      prompt: async () => {
        throw new Error('非交互环境必须显式传模板')
      },
      install: async () => 0,
    }
    await expect(createProject(baseOpts(root, cwd), io)).rejects.toThrow(/非交互/)
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('readDevConfig 拒绝缺字段/空 apps；nodeVersionWarning 只对 <20 提示', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-devcfg-'))
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'scripts/dev.config.json'), JSON.stringify({ apps: [{ name: 'a', dir: 'a' }] }))
    expect(() => readDevConfig(dir)).toThrow(/port/)
    fs.writeFileSync(path.join(dir, 'scripts/dev.config.json'), JSON.stringify({ apps: [] }))
    expect(() => readDevConfig(dir)).toThrow(/apps/)
    expect(nodeVersionWarning('v24.19.0')).toBeUndefined()
    expect(nodeVersionWarning('v18.0.0')).toMatch(/低于模板要求/)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('仓库真实模板目录可通过 dev.config 校验（五模板端口与 scenarios 同源）', () => {
    // 从 tests/ 回溯仓库根：packages/plugin/tests → ../../..
    const repoTemplates = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../examples/templates')
    if (!fs.existsSync(repoTemplates)) return // 包消费场景无仓库目录时跳过
    for (const t of TEMPLATE_CATALOG) {
      const apps = readDevConfig(path.join(repoTemplates, t.name)).apps
      expect(apps.length).toBeGreaterThan(0)
    }
  })

  it('resolveTemplatesRoot 基于包根解析并给出可执行修法', () => {
    const fakeModuleUrl = 'file:///tmp/fake-pkg/dist/cli.js'
    try {
      expect(resolveTemplatesRoot(fakeModuleUrl)).toBe('/tmp/fake-pkg/examples/templates')
    } catch (e) {
      expect(String((e as Error).message)).toMatch(/run build/)
    }
  })
})
