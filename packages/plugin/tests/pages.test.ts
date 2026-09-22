/**
 * D.2 definePages 校验规则单测：R1 剥参收敛 / R2 spec 重复 / R3 存在性 /
 * R4 遮蔽 / R5 name 重复 / 聚合报错与 strict 降级 / 防误报（真实 27 页表形态）。
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { definePages, validatePages } from '../src/pages'

afterEach(() => vi.restoreAllMocks())

describe('D.2 R1：带参路由剥参收敛冲突', () => {
  const pages = [
    { route: '/flowable/bpm/manager/model', name: 'BpmModel' },
    { route: '/flowable/bpm/manager/model/:type/:id', name: 'BpmModelUpdate' },
  ]

  it('缺省推导命中冲突（事故形态）', () => {
    const v = validatePages(pages)
    expect(v.some((x) => x.rule === 'R1' && x.level === 'error')).toBe(true)
  })

  it('显式 spec 后放行', () => {
    const fixed = [
      pages[0],
      { ...pages[1], spec: 'pages/bpm/manager/model/update' },
    ]
    expect(validatePages(fixed).some((x) => x.rule === 'R1')).toBe(false)
  })

  it('无参路由互不误报', () => {
    expect(
      validatePages([
        { route: '/flowable/a/list' },
        { route: '/flowable/a/detail' },
      ]).some((x) => x.rule === 'R1'),
    ).toBe(false)
  })

  it('自定义 deriveSpec 参与冲突判定', () => {
    // 与 testbed 真实 exposeKeyOfRoute 同款：pages/ 前缀 + 去远程前缀 + 剥 :参 段
    const v = validatePages(pages, {
      deriveSpec: (r) =>
        'pages/' +
        r
          .replace(/^\/flowable\//, '')
          .split('/')
          .filter((seg) => !seg.startsWith(':'))
          .join('/'),
    })
    expect(v.some((x) => x.rule === 'R1')).toBe(true)
  })
})

describe('D.2 R2/R4/R5', () => {
  it('R2：有效 spec 重复给 WARN', () => {
    const v = validatePages([
      { route: '/a/list', spec: 'pages/a/list' },
      { route: '/a/list-alias', spec: 'pages/a/list' },
    ])
    expect(v.some((x) => x.rule === 'R2' && x.level === 'warn')).toBe(true)
  })

  it('R4：带参路由在前遮蔽静态路由（ERROR）', () => {
    const v = validatePages([
      { route: '/a/x/:type' },
      { route: '/a/x/create' },
    ])
    expect(v.some((x) => x.rule === 'R4' && x.level === 'error')).toBe(true)
  })

  it('R4：静态在前、带参在后不报（合法顺序）', () => {
    const v = validatePages([
      { route: '/a/x/create' },
      { route: '/a/x/:type' },
    ])
    expect(v.some((x) => x.rule === 'R4')).toBe(false)
  })

  it('R4：路由完全重复（ERROR）', () => {
    const v = validatePages([{ route: '/a/b' }, { route: '/a/b' }])
    expect(v.some((x) => x.rule === 'R4' && x.message.includes('完全重复'))).toBe(true)
  })

  it('R5：name 重复给 WARN', () => {
    const v = validatePages([
      { route: '/a/one', name: 'Same' },
      { route: '/a/two', name: 'Same' },
    ])
    expect(v.some((x) => x.rule === 'R5')).toBe(true)
  })
})

describe('D.2 R3：spec 存在性（schema）', () => {
  const schema = {
    'mes-a': { exposes: ['./pages/a/list', './pages/a/detail'], exists: true },
    'mes-dead': { exposes: [], exists: false },
  }
  const remotes = { '/a/': 'mes-a', '/dead/': 'mes-dead' }

  it('存在：放行（含 ./ 前缀归一化）', () => {
    const v = validatePages([{ route: '/a/list', spec: './pages/a/list' }], { schema, remotes })
    expect(v.some((x) => x.rule === 'R3')).toBe(false)
  })

  it('缺失：ERROR 并列出实际 exposes', () => {
    const v = validatePages([{ route: '/a/list', spec: 'pages/a/listX' }], { schema, remotes })
    const r3 = v.find((x) => x.rule === 'R3')
    expect(r3?.level).toBe('error')
    expect(r3?.message).toContain('pages/a/listX')
  })

  it('exists=false 的 remote 诚实跳过', () => {
    const v = validatePages([{ route: '/dead/whatever' }], { schema, remotes })
    expect(v.some((x) => x.rule === 'R3')).toBe(false)
  })

  it('schema 缺省整条跳过', () => {
    const v = validatePages([{ route: '/a/list' }])
    expect(v.some((x) => x.rule === 'R3')).toBe(false)
  })
})

describe('D.2 聚合与 strict', () => {
  it('ERROR 默认 throw，聚合多条', () => {
    expect(() =>
      definePages([
        { route: '/a/x/:type' },
        { route: '/a/x/create' },
        { route: '/a/x/:type' },
      ]),
    ).toThrowError(/路由表校验失败/)
  })

  it('strict:false 降级 console.error 不 throw', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = definePages(
      [
        { route: '/a/x/:type' },
        { route: '/a/x/create' },
      ],
      { strict: false },
    )
    expect(out).toHaveLength(2)
    expect(err).toHaveBeenCalled()
  })
})

describe('D.2 防误报：真实 27 页表形态零违例', () => {
  it('testbed fulgurjsPages 表（含显式 spec 的带参条目）零 ERROR', () => {
    const table = [
      { route: '/flowable/bpm/task/todo', name: 'BpmTodoTask', title: '待办任务' },
      { route: '/flowable/bpm/manager/model', name: 'BpmModel', title: '流程模型' },
      { route: '/flowable/bpm/manager/model/create', name: 'BpmModelCreate', title: '创建流程' },
      {
        route: '/flowable/bpm/manager/model/:type/:id',
        name: 'BpmModelUpdate',
        spec: 'pages/bpm/manager/model/update',
        title: '修改流程',
      },
      { route: '/flowable/bpm/manager/form/edit', name: 'BpmFormEditor', title: '表单设计' },
      { route: '/lowcode/lowdev/reportTest/:code', name: 'ReportTest', title: '报表功能测试' },
      { route: '/lowcode/form/external/:type/:id', name: 'formExternal', title: '外部表单' },
    ]
    const errors = validatePages(table, {
      deriveSpec: (route) =>
        'pages/' +
        route
          .replace(/^\/(flowable|lowcode)\//, '')
          .split('/')
          .filter((seg) => !seg.startsWith(':'))
          .join('/'),
    }).filter((x) => x.level === 'error')
    expect(errors).toEqual([])
  })
})
