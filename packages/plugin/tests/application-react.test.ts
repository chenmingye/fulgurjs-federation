// @vitest-environment jsdom
/**
 * defineApplication（/react 统一装配）生命周期单测。
 * 覆盖：同步工厂 start、首次根提交语义（start 不等异步 loader）、首次提交前渲染错误传播、
 * renderer 动态 import 前取消、root 创建后首次提交前取消（均释放资源）、
 * dispose 失败可观察并封锁容器、独立与桥接共用装配、多容器隔离、旧 handle 代次保护。
 */
import { describe, expect, it } from 'vitest'
import { createElement as h, useState, useEffect } from 'react'
import { defineApplication } from '../src/bridge-app-react'

function newEl(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('defineApplication：React 启动语义', () => {
  it('B1/B3 同步工厂：start 等首次根提交；独立与桥接同一装配（mode 区分）', async () => {
    const modes: string[] = []
    const application = defineApplication<{ label: string }>((props, ctx) => {
      modes.push(ctx.mode)
      return h('p', null, `${props.label}-${ctx.mode}`)
    })
    const el = newEl()
    const handle = await application.start(el, { label: 'L' })
    expect(el.textContent).toContain('L-standalone')
    expect(modes).toEqual(['standalone'])
    handle.unmount()
    expect(el.textContent).toBe('')
    const elBridge = newEl()
    await application.mount(elBridge, { label: 'B' })
    expect(modes).toEqual(['standalone', 'bridge'])
    expect(elBridge.textContent).toContain('B-bridge')
    application.unmount(elBridge)
  })

  it('B14 start 只代表首次根提交：组件内异步 effect 不阻塞 start resolve', async () => {
    let effectDone = false
    function AsyncChild() {
      const [text, setText] = useState('loading')
      useEffect(() => {
        const timer = setTimeout(() => { effectDone = true; setText('loaded') }, 30)
        return () => clearTimeout(timer)
      }, [])
      return h('p', null, text)
    }
    const application = defineApplication(() => h(AsyncChild))
    const el = newEl()
    await application.start(el)
    expect(el.textContent).toBe('loading')
    expect(effectDone, '异步 effect 未完成时 start 已 resolve').toBe(false)
    await new Promise(r => setTimeout(r, 60))
    expect(el.textContent).toBe('loaded')
  })

  it('B2 首次提交前渲染错误：start 拒绝并清理 root；容器随后可复用', async () => {
    function Boom() { throw new Error('render exploded') }
    const application = defineApplication<{ fail: boolean }>(props =>
      props.fail ? h(Boom) : h('p', null, 'recovered'))
    const el = newEl()
    await expect(application.start(el, { fail: true })).rejects.toThrowError('render exploded')
    expect(el.textContent, '失败后容器为空').toBe('')
    const handle = await application.start(el, { fail: false })
    expect(el.textContent).toBe('recovered')
    handle.unmount()
  })

  it('B12 dispose 失败真实传播；封锁容器不能重挂', async () => {
    const application = defineApplication((_props, ctx) => ({
      element: h('p', null, 'x'),
      dispose: () => { if (ctx.mode === 'standalone') throw new Error('dispose exploded') },
    }))
    const el = newEl()
    const handle = await application.start(el)
    expect(() => handle.unmount(), 'dispose 失败真实传播').toThrowError('dispose exploded')
    await expect(application.start(el), '封锁后不可重挂').rejects.toThrowError(/卸载失败/)
  })

  it('B5 多容器隔离；B7 旧 handle 不能卸载新代次', async () => {
    const application = defineApplication<{ n: number }>(props => h('p', null, `n${props.n}`))
    const elA = newEl(), elB = newEl()
    const hA = await application.start(elA, { n: 1 })
    const hB = await application.start(elB, { n: 2 })
    expect(elA.textContent).toContain('n1')
    expect(elB.textContent).toContain('n2')
    hA.unmount()
    expect(elB.textContent, 'A 卸载不影响 B').toContain('n2')
    hB.unmount()
    const old = await application.start(elA, { n: 3 })
    old.unmount()
    await application.start(elA, { n: 4 })
    expect(elA.textContent).toContain('n4')
    old.unmount()
    expect(elA.textContent, '旧 handle 不停新代次').toContain('n4')
  })

  it('B6 应用定义 A 不能卸载应用定义 B 的实例', async () => {
    const appA = defineApplication(() => h('p', null, 'a'))
    const appB = defineApplication(() => h('p', null, 'b'))
    const el = newEl()
    await appB.start(el)
    expect(() => appA.unmount(el)).not.toThrow()
    expect(el.textContent, 'B 实例仍在').toContain('b')
  })

  it('B8 场景一：renderer 动态 import 未完成时取消（同步窗口内 unmount）', async () => {
    const application = defineApplication(() => h('p', null, 'late'))
    const el = newEl()
    const pending = application.start(el)
    // start 同步段启动 createRoot 的 dynamic import；此刻 import promise 尚未 settle
    application.unmount(el)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await new Promise(r => setTimeout(r, 20))
    expect(el.textContent, '迟到的 createRoot 不产生挂载').toBe('')
    const handle = await application.start(el)
    expect(el.textContent, '容器随后正常可用').toContain('late')
    handle.unmount()
  })

  it('B8 场景二：root 已创建、首次提交未完成时取消，资源被释放', async () => {
    const application = defineApplication(() => h('p', null, 'never-committed'))
    const el = newEl()
    const pending = application.start(el)
    // 1 个 microtask 后：react-dom/client 已 import、root 已创建（status=live），
    // 但 React 18 的 render 由 scheduler 排队，尚未提交
    await Promise.resolve()
    application.unmount(el)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await new Promise(r => setTimeout(r, 30))
    expect(el.textContent, '被取消的 root 不再提交内容').toBe('')
    const handle = await application.start(el)
    expect(el.textContent, '容器随后正常可用').toContain('never-committed')
    handle.unmount()
  })
})
