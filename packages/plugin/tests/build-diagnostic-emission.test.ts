/** 实际 Vite 构建验证错误码与修复后的恢复，不手动构造诊断异常冒充发射路径。 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, createLogger } from 'vite'
import { expect, it } from 'vitest'
import { federation } from '../src/index'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

it('缺失 expose 源文件触发 BLD-001，修正路径后构建恢复', { timeout: 30_000 }, async () => {
  const root = fs.mkdtempSync(path.join(pluginRoot, '.diagnostic-build-'))
  try {
    fs.writeFileSync(path.join(root, 'main.js'), 'export const value = 1')
    const run = (source: string) => build({
      root, configFile: false, logLevel: 'silent',
      plugins: [federation({ name: 'diagnostic-provider', exposes: { './value': source }, dts: false })],
      build: { target: 'es2022', minify: false, write: false, rollupOptions: { input: path.join(root, 'main.js') } },
    })
    await expect(run('./missing.js')).rejects.toThrow(/BLD-001[\s\S]*missing\.js/)
    await expect(run('./main.js')).resolves.toBeDefined()
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('低于 es2022 的真实构建提示 BLD-002，提高目标后不再提示', { timeout: 30_000 }, async () => {
  const root = fs.mkdtempSync(path.join(pluginRoot, '.diagnostic-build-'))
  try {
    fs.writeFileSync(path.join(root, 'main.js'), 'export const value = 1')
    const warnings: string[] = []
    const logger = createLogger('silent')
    logger.warn = message => { warnings.push(message) }
    const run = (target: string) => build({
      root, configFile: false, customLogger: logger,
      plugins: [federation({ name: 'diagnostic-host', remotes: { other: '/other' }, dts: false })],
      build: { target, minify: false, write: false, rollupOptions: { input: path.join(root, 'main.js') } },
    })
    await run('es2021')
    expect(warnings.some(message => /BLD-002[\s\S]*es2021/.test(message))).toBe(true)
    warnings.length = 0
    await run('es2022')
    expect(warnings.some(message => message.includes('BLD-002'))).toBe(false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
