import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readRealPath, realPath, genTypeRealpath } from '../src/dts-realpath'

it('优先原生解析，缺少原生实现或其不可用时使用标准实现', () => {
  const regular = vi.fn((_file: string) => '/real/standard')
  const native = vi.fn(() => '/real/native')
  const reader = { realpathSync: Object.assign(regular, { native }) }
  expect(readRealPath(reader, '/link')).toBe('/real/native')
  expect(regular).not.toHaveBeenCalled()
  native.mockImplementationOnce(() => { throw Error('native unavailable') })
  expect(readRealPath(reader, '/link')).toBe('/real/standard')
  const standardOnly = { realpathSync: (file: string) => regular(file) }
  expect(readRealPath(standardOnly, '/link')).toBe('/real/standard')
  regular.mockImplementationOnce(() => { throw Error('missing path') })
  expect(() => readRealPath(standardOnly, '/missing')).toThrow('missing path')
  native.mockClear(); regular.mockClear()
  expect(readRealPath(reader, 'C:/' + 'x'.repeat(260), 'win32')).toBe('/real/standard')
  expect(native).not.toHaveBeenCalled()
})

it('父进程与生成子进程都观察同路径链接换目标和断链，不复用旧目标', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-realpath-'))
  try {
    const left = path.join(root, '中文-left'), right = path.join(root, 'right'), link = path.join(root, 'link')
    fs.mkdirSync(left); fs.mkdirSync(right); fs.symlinkSync(left, link, 'dir')
    const generated = new Function('fs', genTypeRealpath() + '\nreturn realpath;')(fs) as (file: string) => string
    expect(realPath(link)).toBe(fs.realpathSync(left))
    expect(generated(link)).toBe(realPath(link))
    fs.unlinkSync(link); fs.symlinkSync(right, link, 'dir')
    expect(realPath(link)).toBe(fs.realpathSync(right))
    expect(generated(link)).toBe(realPath(link))
    fs.rmdirSync(right)
    expect(() => realPath(link)).toThrow()
    expect(() => generated(link)).toThrow()
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
