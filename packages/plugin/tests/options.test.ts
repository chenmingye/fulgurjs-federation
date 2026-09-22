import { describe, expect, it } from 'vitest'
import { normalizeOptions, type FederationOptions } from '../src/options'

const ROOT = process.cwd()

function norm(opts: FederationOptions) {
  return normalizeOptions(opts, ROOT, 'build')
}

describe('options: remotes 解析（webpack 语法 + 单地址自动切换）', () => {
  it('name@url 语法解析 + 自报名提取', () => {
    const n = norm({
      name: 'host',
      remotes: { checkout: 'shop@http://localhost:3001/remoteEntry.js' },
    })
    expect(n.remotes[0].key).toBe('checkout')
    expect(n.remotes[0].name).toBe('shop')
    expect(n.remotes[0].prodEntry).toBe('http://localhost:3001/remoteEntry.js')
  })

  it('键重命名语义（checkout: shop@...）', () => {
    const n = norm({
      name: 'host',
      remotes: { checkout: 'shop@http://localhost:3001/fulgurjs-remoteEntry.js' },
    })
    expect(n.remotes[0].key).toBe('checkout')
    expect(n.remotes[0].name).toBe('shop')
  })

  it('单个 base 地址自动切换 dev/prod', () => {
    const n = norm({ name: 'host', remotes: { 'remote-a': 'http://localhost:5101' } })
    expect(n.remotes[0].devEntry).toBe('http://localhost:5101/@fulgurjs-entry.js')
    expect(n.remotes[0].prodEntry).toBe('http://localhost:5101/fulgurjs-remoteEntry.js')
  })

  it('带路径 base（微前端子应用场景）', () => {
    const n = norm({ name: 'host', remotes: { bpm: 'http://localhost:5101/bpm' } })
    expect(n.remotes[0].devEntry).toBe('http://localhost:5101/bpm/@fulgurjs-entry.js')
    expect(n.remotes[0].prodEntry).toBe('http://localhost:5101/bpm/fulgurjs-remoteEntry.js')
  })

  it('dev/prod 显式拆分', () => {
    const n = norm({
      name: 'host',
      remotes: {
        'remote-a': { dev: 'http://localhost:5101', prod: 'https://cdn.example.com/ra/' },
      },
    })
    expect(n.remotes[0].devEntry).toBe('http://localhost:5101/@fulgurjs-entry.js')
    expect(n.remotes[0].prodEntry).toBe('https://cdn.example.com/ra/fulgurjs-remoteEntry.js')
  })

  it('@ 位置非法 → 抛错（对齐 webpack Invalid request）', () => {
    expect(() => norm({ name: 'h', remotes: { a: '@http://x' } })).toThrow('misplaced')
    expect(() => norm({ name: 'h', remotes: { a: 'http://x@' } })).toThrow('misplaced')
  })

  it('promise-based remote 标记', () => {
    const n = norm({ name: 'h', remotes: { dyn: (() => Promise.resolve({})) as any } })
    expect(n.remotes[0].promise).toBe(true)
  })
})

describe('options: shared 三种形式 + 默认值规则', () => {
  it('数组形式：requiredVersion 从 package.json 推断', () => {
    const n = norm({ name: 'h', shared: ['es-module-lexer'] }) // 本包自身依赖里有版本
    const item = n.shared[0]
    expect(item.configKey).toBe('es-module-lexer')
    expect(item.requiredVersion).toMatch(/^\^?\d/)
  })

  it('semver 简写形式', () => {
    const n = norm({ name: 'h', shared: { vue: '^3.4.0' } })
    expect(n.shared[0].requiredVersion).toBe('^3.4.0')
    expect(n.shared[0].shareKey).toBe('vue')
    expect(n.shared[0].singleton).toBe(false)
  })

  it('完整 hint：strictVersion 默认值对齐 webpack（有本地副本且非 singleton → true）', () => {
    const n = norm({
      name: 'h',
      shared: {
        vue: { singleton: true, requiredVersion: '^3.4.0' },
        lodash: { requiredVersion: '^4.0.0' },
      },
    })
    expect(n.shared.find((s) => s.shareKey === 'vue')!.strictVersion).toBe(false) // singleton → false
    expect(n.shared.find((s) => s.shareKey === 'lodash')!.strictVersion).toBe(true) // 有副本非 singleton → true
  })

  it('shareKey 重命名 + 尾部斜杠全子路径共享', () => {
    const n = norm({
      name: 'h',
      shared: { 'my-vue': { import: 'vue', shareKey: 'shared-vue', version: '1.2.3', requiredVersion: '^1.0.0' } },
    })
    expect(n.shared[0].shareKey).toBe('shared-vue')
    expect(n.shared[0].import).toBe('vue')
    expect(n.shared[0].version).toBe('1.2.3')
  })

  it('shareScope 默认值级联（顶级 → 项级）', () => {
    const n = norm({
      name: 'h',
      shareScope: 'tenant-x',
      shared: { vue: '^3.4.0' },
    })
    expect(n.shared[0].shareScope).toBe('tenant-x')
  })
})

describe('options: exposes / 其余选项', () => {
  it('exposes 键自动补 ./ 并告警', () => {
    const n = norm({ name: 'h', exposes: { Button: './src/Button.vue' } })
    expect(n.exposes[0].name).toBe('./Button')
    expect(n.warnings.some((w) => w.includes('normalized to'))).toBe(true)
  })

  it('exposes 对象形式保留稳定 chunk 名', () => {
    const n = norm({ name: 'h', exposes: { './Button': { import: './src/Button.vue', name: 'button-chunk' } } })
    expect(n.exposes[0].chunkName).toBe('button-chunk')
  })

  it('remoteType 非 module → 告警并回退（P3）', () => {
    const n = norm({ name: 'h', remoteType: 'script' })
    expect(n.remoteType).toBe('module')
    expect(n.warnings.some((w) => w.includes('P3'))).toBe(true)
  })

  it('filename 默认值', () => {
    expect(norm({ name: 'h' }).filename).toBe('fulgurjs-remoteEntry.js')
    expect(norm({ name: 'h', filename: 'customEntry.js' }).filename).toBe('customEntry.js')
  })
})

describe('配置校验（DX：清晰报错）', () => {
  it('name 缺失 → 报错含 got/expected/example 三段', () => {
    try {
      norm({} as any)
      throw new Error('should throw')
    } catch (e: any) {
      expect(e.message).toContain('`name` is required')
      expect(e.message).toContain('got:')
      expect(e.message).toContain('expected:')
      expect(e.message).toContain('example:')
    }
  })

  it('name 非法字符 → 报错并给出示例', () => {
    expect(() => norm({ name: 'my app!' })).toThrow(/must match/)
  })

  it('remote 地址全空 → 报错给出三种地址形态示例', () => {
    expect(() => norm({ name: 'h', remotes: { 'remote-a': { } as any } })).toThrow(/no address/)
    try {
      norm({ name: 'h', remotes: { 'remote-a': { dev: '', prod: '' } as any } })
      throw new Error('should throw')
    } catch (e: any) {
      expect(e.message).toContain('remotes["remote-a"]')
      expect(e.message).toContain("remotes: { 'remote-a': 'http://localhost:5101' }")
    }
  })

  it('remotes 键含 @ 或 / → 报错', () => {
    expect(() => norm({ name: 'h', remotes: { 'a/b': 'http://x' } })).toThrow(/invalid characters/)
    expect(() => norm({ name: 'h', remotes: { 'a@b': 'http://x' } })).toThrow(/invalid characters/)
  })

  it('exposes.import 缺失 → 报错', () => {
    expect(() => norm({ name: 'h', exposes: { './Button': {} as any } })).toThrow(/\.import is missing/)
  })

  it('remotes 类型错误 → 报错', () => {
    expect(() => norm({ name: 'h', remotes: 123 as any })).toThrow(/`remotes` must be an object/)
  })

  it('exposes 与 remotes 均空 → 警告（不阻断）', () => {
    const n = norm({ name: 'h' })
    expect(n.warnings.some((w) => w.includes('neither `exposes` nor `remotes`'))).toBe(true)
  })

  it('纯 host（只有 remotes）→ 警告不阻断', () => {
    const n = norm({ name: 'h', remotes: { 'remote-a': 'http://localhost:5101' } })
    expect(n.warnings.some((w) => w.includes('pure host'))).toBe(true)
  })

  it('合法最小配置不被误杀：host + remote 双形态', () => {
    const host = norm({ name: 'h', remotes: { r: { dev: 'http://localhost:5101', prod: '/r' } } })
    expect(host.remotes[0].devEntry).toContain('@fulgurjs-entry.js')
    const remote = norm({ name: 'r', exposes: { './Button': './src/Button.vue' } })
    expect(remote.exposes[0].name).toBe('./Button')
  })
})

describe('W5/CFG-007: remotes 对象形式误用 name@ 前缀（2026-09-17 testbed 实踩）', () => {
  it('对象形式 dev/prod 槽位带 name@ 前缀 → 配置期显式报错', () => {
    expect(() =>
      norm({
        name: 'host',
        remotes: { bpm: { dev: 'bpm@http://localhost:5101/bpm', prod: '/flowable' } },
      }),
    ).toThrow(/CFG-007/)
    expect(() =>
      norm({
        name: 'host',
        remotes: { bpm: { dev: 'http://localhost:5101/checkout', prod: 'shop@/checkout' } },
      }),
    ).toThrow(/name@/)
  })

  it('字符串 external 的 name@ 前缀仍受支持（webpack 重命名语义）', () => {
    const n = norm({ name: 'host', remotes: { checkout: 'shop@http://localhost:3001' } })
    expect(n.remotes[0].name).toBe('shop')
  })

  it('URL 认证信息 user@host 不误报（http:// 前缀整段豁免）', () => {
    const n = norm({ name: 'host', remotes: { r: { dev: 'http://user@localhost:5101', prod: '/r' } } })
    expect(n.remotes[0].devEntry).toContain('user@localhost')
  })
})

describe('W5/CFG-008: shared 非法组合', () => {
  it('eager + import:false → 报错', () => {
    expect(() =>
      norm({ name: 'r', exposes: { './A': './src/A.vue' }, shared: { vue: { eager: true, import: false } } }),
    ).toThrow(/CFG-008/)
  })

  it('同 shareKey + shareScope 重复声明 → 报错', () => {
    expect(() =>
      norm({
        name: 'r',
        exposes: { './A': './src/A.vue' },
        shared: {
          vue: { singleton: true },
          'vue-demi': { shareKey: 'vue', singleton: true },
        },
      }),
    ).toThrow(/declared twice/)
  })

  it('不同 shareKey 同名包合法（vue 与 vue2 键并存）', () => {
    const n = norm({
      name: 'r',
      exposes: { './A': './src/A.vue' },
      shared: { vue: { singleton: true }, 'vue-demi': { shareKey: 'vue-demi' } },
    })
    expect(n.shared).toHaveLength(2)
  })
})
