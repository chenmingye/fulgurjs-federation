/** npm 包只附带可复制模板；大型演示与门户通过 GitHub 统一入口提供。 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(packageRoot, '../..')
const target = path.join(packageRoot, 'examples')
fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })
fs.cpSync(path.join(repositoryRoot, 'examples/templates'), path.join(target, 'templates'), {
  recursive: true,
  filter: (source) => !['node_modules', 'dist', '.vite', '.DS_Store'].includes(path.basename(source)),
})
fs.writeFileSync(path.join(target, 'README.md'), `# 可复制模板\n\n本 npm 包附带五个完整模板，见 [模板指南](templates/README.md)。复制整个模板目录，在模板根执行 pnpm install --frozen-lockfile，再执行 pnpm dev。\n\n功能演示、大型应用集成和展示门户见 [GitHub 统一示例入口](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples)。\n`)

const templateGuide = path.join(target, 'templates/README.md')
fs.writeFileSync(templateGuide, fs.readFileSync(templateGuide, 'utf8')
  .replaceAll('(../demos/README.md)', '(https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos)')
  .replaceAll('(../demos/)', '(https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos)')
  .replaceAll('(../integrations/)', '(https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/integrations)'))
