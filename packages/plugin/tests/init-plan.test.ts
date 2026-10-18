/** 接入向导回归：验证真实文件变化、重复执行、语法边界与失败保护；不执行应用模块。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyIntegration, planIntegration, rollbackIntegration } from '../src/init-plan'

const roots: string[] = []
function project(framework: 'vue' | 'react' = 'vue', vite = "import { defineConfig } from 'vite'\nexport default defineConfig({ plugins: [], server: { port: 5173 } })\n") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-init-plan space-')); roots.push(root)
  fs.mkdirSync(path.join(root, 'src'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'example', dependencies: { [framework]: '*', '@fulgurjs/federation': '*' } }))
  fs.writeFileSync(path.join(root, 'vite.config.ts'), vite)
  fs.writeFileSync(path.join(root, 'src/math.ts'), 'export const add = (a: number, b: number) => a + b\n')
  return root
}
const provider = (cwd: string) => ({ cwd, role: 'provider' as const, exposes: { './math': './src/math.ts' } })
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

describe('init 接入计划', () => {
  it('预览不写；应用配置保留原插件/端口/注释；模块模式不生成应用和会话文件', async () => {
    const cwd = project('vue', "import { defineConfig } from 'vite'\n// 保留业务说明\nexport default defineConfig({ plugins: [vue()], server: { port: 5173 } })")
    const p = await planIntegration(provider(cwd))
    expect(p.tasks.filter(t => t.blocking)).toEqual([])
    expect(fs.existsSync(path.join(cwd, 'fulgurjs.config.ts'))).toBe(false)
    applyIntegration(p)
    const vite = fs.readFileSync(path.join(cwd, 'vite.config.ts'), 'utf8')
    expect(vite).toContain('vue()'); expect(vite.indexOf('vue()')).toBeLessThan(vite.indexOf('fulgurjsFederation(fulgurjsConfig)')); expect(vite).toContain('port: 5173'); expect(vite).toContain('// 保留业务说明')
    expect(p.edits.map(e => e.file).sort()).toEqual(['fulgurjs.config.ts', 'vite.config.ts'])
    expect(fs.existsSync(path.join(cwd, '.fulgurjs-init-pending.json'))).toBe(false)
    const second = await planIntegration(provider(cwd))
    expect(second.edits).toEqual([]); applyIntegration(second)
  })
  it.each([
    "export default { server: { port: 5173 } }",
    "import {defineConfig as config} from 'vite'; export default config({ 'plugins': [] })",
    "export default {plugins: [...otherPlugins], server: { nested: [{x: ']'}] }}",
    "export default {plugins: makePlugins()}",
    "import {defineConfig} from 'vite'; export default defineConfig(() => ({plugins: []}))",
    "import {defineConfig} from 'vite'; export default defineConfig(({mode}) => { const root = process.cwd(); return {root, plugins: makePlugins(mode), resolve: { alias: [{find: /^@\\//, replacement: '/src'}] } } })",
    "import type {ConfigEnv,UserConfig} from 'vite'; export default ({mode}: ConfigEnv): UserConfig => { const root = process.cwd(); return {root, plugins: makePlugins(mode)} }",
  ])('识别明确对象与带引号键/嵌套字符串，不破坏语法：%s', async vite => {
    const cwd = project('vue', vite), p = await planIntegration(provider(cwd))
    expect(p.tasks.filter(t => t.blocking)).toEqual([]); applyIntegration(p)
  })
  it.each([
        "export default {plugins: [], ...extra}",
    "export default {plugins: [], plugins: []}",
        "const config = { plugins: [] }; export default config",
    "import {defineConfig} from 'vite'; export default defineConfig(({mode}) => ({ plugins: [] }, other))",
    "import {defineConfig} from 'vite'; export default defineConfig({ plugins: [] } && other)",
    "export default ({mode}) => { if(mode) return {}; return {plugins: []} }",
    "export default { label: `${name}`, plugins: [] }",
  ])('无法证明的结构整批拒绝写入：%s', async vite => {
    const cwd = project('vue', vite), p = await planIntegration(provider(cwd))
    expect(p.tasks.some(t => t.blocking)).toBe(true)
    expect(() => applyIntegration(p)).toThrow('未写入任何文件')
    expect(fs.existsSync(path.join(cwd, 'fulgurjs.config.ts'))).toBe(false)
    expect(fs.readFileSync(path.join(cwd, 'vite.config.ts'), 'utf8')).toBe(vite)
  })
  it('不覆盖预览后 IDE 编辑', async () => {
    const cwd = project(), p = await planIntegration(provider(cwd))
    fs.appendFileSync(path.join(cwd, 'vite.config.ts'), '// IDE 修改')
    expect(() => applyIntegration(p)).toThrow('预览后文件已变化')
    expect(fs.existsSync(path.join(cwd, 'fulgurjs.config.ts'))).toBe(false)
  })
  it('缺真实 expose/remote、框架歧义与目录外路径不生成假配置', async () => {
    const cwd = project()
    expect((await planIntegration({ cwd })).tasks.filter(t => t.blocking)).toHaveLength(2)
    expect((await planIntegration({ ...provider(cwd), exposes: { './x': './missing.ts' } })).tasks.some(t => t.file === 'missing.ts' && t.blocking)).toBe(true)
    await expect(planIntegration({ ...provider(cwd), exposes: { './x': './../outside.ts' } })).rejects.toThrow('路径必须在当前应用内')
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { vue: '*', react: '*' } }))
    expect((await planIntegration(provider(cwd))).framework).toBeNull()
  })
  it('Vue 最小入口提取后与独立 start 共用，重跑不重复提取', async () => {
    const cwd = project()
    fs.writeFileSync(path.join(cwd, 'src/main.ts'), "/** 原作者与创建时间保留在 main */\nimport { createApp } from 'vue'\nimport App from './App.vue'\nimport './style.css'\ncreateApp(App).mount('#app')\n")
    const args = { cwd, role: 'provider' as const, kind: 'app' as const }
    const p = await planIntegration(args)
    expect(p.tasks.filter(t => t.blocking)).toEqual([]); applyIntegration(p)
    expect(fs.readFileSync(path.join(cwd, 'src/fulgurjs/exposes/application.ts'), 'utf8')).toContain("import '../../style.css'")
    expect(fs.readFileSync(path.join(cwd, 'src/fulgurjs/exposes/application.ts'), 'utf8')).toContain("import App from '../../App.vue'")
    expect(fs.existsSync(path.join(cwd, 'src/application.ts'))).toBe(false)
    expect(fs.readFileSync(path.join(cwd, 'src/main.ts'), 'utf8')).toContain("from './fulgurjs/exposes/application'")
    expect(fs.readFileSync(path.join(cwd, 'src/main.ts'), 'utf8')).toContain('application.start("#app")')
    expect(fs.readFileSync(path.join(cwd, 'src/main.ts'), 'utf8')).toContain('原作者与创建时间保留在 main')
    expect(fs.readFileSync(path.join(cwd, 'fulgurjs.config.ts'), 'utf8')).toContain('./bridge')
    expect((await planIntegration(args)).edits).toEqual([])
  })
  it('嵌套入口移动后仍解析到原 App/样式文件，保留别名和裸包名；已有集中装配不覆盖', async () => {
    const cwd = project()
    fs.mkdirSync(path.join(cwd, 'src/startup'))
    fs.writeFileSync(path.join(cwd, 'src/App.vue'), '<template>应用</template>')
    fs.writeFileSync(path.join(cwd, 'src/startup/style.css'), 'body { margin: 0 }')
    fs.writeFileSync(path.join(cwd, 'src/startup/main.ts'), "import {createApp} from 'vue'\nimport App from '../App.vue'\nimport './style.css'\nimport '@/theme.css'\ncreateApp(App).mount('#app')")
    const args = { cwd, role: 'provider' as const, kind: 'app' as const, entry: 'src/startup/main.ts' }
    applyIntegration(await planIntegration(args))
    const appFile = path.join(cwd, 'src/fulgurjs/exposes/application.ts')
    const app = fs.readFileSync(appFile, 'utf8')
    expect(app).toContain("from 'vue'"); expect(app).toContain("import '@/theme.css'")
    const relativeImports = [...app.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)].map(m => path.resolve(path.dirname(appFile), m[1]))
    expect(relativeImports.sort()).toEqual([path.join(cwd, 'src/App.vue'), path.join(cwd, 'src/startup/style.css')].sort())
    expect(relativeImports.every(p => fs.existsSync(p))).toBe(true)
    expect(fs.readFileSync(path.join(cwd, args.entry), 'utf8')).toContain("from '../fulgurjs/exposes/application'")
    expect((await planIntegration(args)).edits).toEqual([])
    fs.writeFileSync(appFile, '// 用户独立维护的装配，不可替换')
    const conflict = await planIntegration(args)
    expect(conflict.tasks.some(t => t.file === 'src/fulgurjs/exposes/application.ts' && t.blocking)).toBe(true)
    expect(() => applyIntegration(conflict)).toThrow('未写入任何文件')
  })
  it('React JSX/StrictMode 保留，renderer 不重复创建', async () => {
    const cwd = project('react')
    fs.writeFileSync(path.join(cwd, 'src/main.tsx'), "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport App from './App'\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>,)\n")
    const p = await planIntegration({ cwd, role: 'provider', kind: 'app' })
    expect(p.tasks.filter(t => t.blocking)).toEqual([]); applyIntegration(p)
    const app = fs.readFileSync(path.join(cwd, 'src/fulgurjs/exposes/application.tsx'), 'utf8')
    expect(app).toContain("import App from '../../App'"); expect(app).toContain('<StrictMode><App /></StrictMode>'); expect(app).not.toContain('react-dom/client')
  })
  it('复杂业务初始化不能误当最小入口覆盖', async () => {
    const cwd = project()
    const original = "import {createApp} from 'vue'\nimport App from './App.vue'\nimport router from './router'\nconst app=createApp(App); app.use(router); app.mount('#app')"
    fs.writeFileSync(path.join(cwd, 'src/main.ts'), original)
    const p = await planIntegration({ cwd, kind: 'app', role: 'provider' })
    expect(p.tasks.some(t => t.blocking && t.message.includes('路由或状态'))).toBe(true)
    expect(() => applyIntegration(p)).toThrow(); expect(fs.readFileSync(path.join(cwd, 'src/main.ts'), 'utf8')).toBe(original)
  })
  it('宿主只生成挂载视图，不猜路由/会话；已有手改视图不覆盖', async () => {
    const cwd = project(), args = { cwd, role: 'consumer' as const, kind: 'app' as const, remotes: { 'remote-a': 'http://localhost:5174/remote-a' } }
    const p = await planIntegration(args)
    expect(p.tasks.filter(t => t.blocking)).toEqual([]); applyIntegration(p)
    expect(p.edits.some(e => e.file.endsWith('session.ts'))).toBe(false)
    const file = path.join(cwd, 'src/fulgurjs/host/RemoteApplication.vue')
    fs.appendFileSync(file, '\n<!-- 手工路由装配 -->')
    expect((await planIntegration(args)).tasks.some(t => t.blocking && t.file.endsWith('RemoteApplication.vue'))).toBe(true)
  })
  it('中断恢复只还原本次内容，人工编辑受保护', async () => {
    const cwd = project(), p = await planIntegration(provider(cwd)), first = p.edits[0]
    fs.writeFileSync(path.join(cwd, first.file), first.after)
    fs.writeFileSync(path.join(cwd, '.fulgurjs-init-pending.json'), JSON.stringify({ root: p.root, edits: p.edits }))
    expect((await planIntegration(provider(cwd))).tasks.some(t => t.file.includes('pending') && t.blocking)).toBe(true)
    fs.appendFileSync(path.join(cwd, first.file), '// 外部修改')
    expect(() => rollbackIntegration(cwd)).toThrow('文件有后续编辑')
    fs.writeFileSync(path.join(cwd, first.file), first.after)
    rollbackIntegration(cwd)
    expect(fs.readFileSync(path.join(cwd, first.file), 'utf8')).toBe(first.before)
    expect(fs.existsSync(path.join(cwd, '.fulgurjs-init-pending.json'))).toBe(false)
  })
  it('写入中途失败回退已改内容并移除恢复记录', async () => {
    const cwd = project(), p = await planIntegration(provider(cwd))
    const original = fs.readFileSync(path.join(cwd, 'vite.config.ts'), 'utf8')
    vi.spyOn(fs, 'linkSync').mockImplementationOnce(() => { throw new Error('模拟磁盘写入失败') })
    expect(() => applyIntegration(p)).toThrow('模拟磁盘写入失败')
    expect(fs.readFileSync(path.join(cwd, 'vite.config.ts'), 'utf8')).toBe(original)
    expect(fs.existsSync(path.join(cwd, 'fulgurjs.config.ts'))).toBe(false)
    expect(fs.existsSync(path.join(cwd, '.fulgurjs-init-pending.json'))).toBe(false)
    expect(fs.readdirSync(cwd).some(f => f.endsWith('.tmp'))).toBe(false)
  })
  it('拒绝借符号链接改写应用外源码', async () => {
    const cwd = project(), outside = project()
    fs.unlinkSync(path.join(cwd, 'vite.config.ts'))
    fs.symlinkSync(path.join(outside, 'vite.config.ts'), path.join(cwd, 'vite.config.ts'))
    await expect(planIntegration(provider(cwd))).rejects.toThrow('符号链接')
  })

})
