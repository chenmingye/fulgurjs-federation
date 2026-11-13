import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadAppConfig } from '../src/app-config'
import { checkPages } from '../src/commands'

/** 验证真正随包的模板配置，不用另写一份正确配置代替模板。 */
describe('完整模板的运行时与CLI页面合同', () => {
  for (const [template, remote] of [['vue-vue', 'vue-remote'], ['react-react', 'react-remote']]) {
    it(`${template} 的真实页面表可核对，缺少远程详情时必须拒绝`, async () => {
      const root = path.resolve(import.meta.dirname, '../../../examples/templates', template)
      const config = path.join(root, 'host/fulgurjs.config.ts')
      const remoteConfig = await loadAppConfig(path.join(root, 'remote/fulgurjs.config.ts'))
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-template-pages-'))
      try {
        const file = path.join(dir, 'fulgurjs-manifest.json')
        const exposes = Object.fromEntries(Object.keys(remoteConfig.options.exposes ?? {}).map(key => [key, { file: './chunk.js' }]))
        const manifest = { schemaVersion: 1, name: remote, entry: 'fulgurjs-remoteEntry.js', exposes }
        fs.writeFileSync(file, JSON.stringify(manifest))
        const verified = await checkPages(config, { manifests: { [remote]: file }, requireVerified: true })
        expect(verified.checked).toBe(2)
        expect(verified.issues).toEqual([])
        expect(verified.failed || verified.unverifiedFailed).toBe(false)
        delete exposes['./pages/DetailPage']
        fs.writeFileSync(file, JSON.stringify(manifest))
        const missing = await checkPages(config, { manifests: { [remote]: file }, requireVerified: true })
        expect(missing.failed).toBe(true)
        expect(missing.issues.some(issue => issue.level === 'error' && issue.message.includes('pages/DetailPage'))).toBe(true)
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})
