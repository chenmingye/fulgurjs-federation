/**
 * 把规范源 examples/scripts/dev-runner.mjs 同步到五个模板的 scripts/dev.mjs。
 * 只在规范源或模板脚本变更后手动执行一次；check-catalog.mjs 会校验逐字节一致，
 * 单独改模板副本而不同步规范源（或反之）会在 `npm run test:examples` 失败。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const examplesRoot = path.dirname(fileURLToPath(import.meta.url))
const templatesRoot = path.join(examplesRoot, '..', 'templates')
const source = path.join(examplesRoot, 'dev-runner.mjs')
const templates = ['vue-vue', 'react-react', 'vue-host-react-remote', 'react-host-vue-remote', 'showcase']

for (const name of templates) {
  const target = path.join(templatesRoot, name, 'scripts', 'dev.mjs')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
  console.log(`synced ${path.relative(examplesRoot, target)}`)
}
