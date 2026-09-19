import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { syncViteCacheMarker } from '../src/vite-cache'

describe('DEV-009 自动化：syncViteCacheMarker', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-cache-'))

  it('无 .vite 时仅写版本标记，不清任何东西', () => {
    const root = tmp()
    const logs: string[] = []
    syncViteCacheMarker(root, '0.4.1', (m) => logs.push(m))
    expect(fs.readFileSync(path.join(root, 'node_modules/.vite/fulgurjs-version.txt'), 'utf8')).toBe('0.4.1')
    expect(logs).toHaveLength(0)
  })

  it('版本未变 → 不清缓存、无日志', () => {
    const root = tmp()
    syncViteCacheMarker(root, '0.4.1', () => {})
    fs.writeFileSync(path.join(root, 'node_modules/.vite/sentinel'), 'x')
    const logs: string[] = []
    syncViteCacheMarker(root, '0.4.1', (m) => logs.push(m))
    expect(fs.existsSync(path.join(root, 'node_modules/.vite/sentinel'))).toBe(true)
    expect(logs).toHaveLength(0)
  })

  it('版本变化 → 清空 .vite 并写新标记（DEV-009 手工步骤自动化）', () => {
    const root = tmp()
    syncViteCacheMarker(root, '0.4.0', () => {})
    fs.writeFileSync(path.join(root, 'node_modules/.vite/deps-old.js'), 'stale')
    const logs: string[] = []
    syncViteCacheMarker(root, '0.4.1', (m) => logs.push(m))
    expect(fs.existsSync(path.join(root, 'node_modules/.vite/deps-old.js'))).toBe(false)
    expect(fs.readFileSync(path.join(root, 'node_modules/.vite/fulgurjs-version.txt'), 'utf8')).toBe('0.4.1')
    expect(logs[0]).toContain('0.4.0 → 0.4.1')
    expect(logs[0]).toContain('DEV-009')
  })

  it('损坏的标记文件按无记录处理并自愈', () => {
    const root = tmp()
    fs.mkdirSync(path.join(root, 'node_modules/.vite'), { recursive: true })
    const logs: string[] = []
    syncViteCacheMarker(root, '0.4.1', (m) => logs.push(m))
    expect(logs[0]).toContain('无记录')
    expect(fs.readFileSync(path.join(root, 'node_modules/.vite/fulgurjs-version.txt'), 'utf8')).toBe('0.4.1')
  })
})
