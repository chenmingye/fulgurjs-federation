import { describe, expect, it } from 'vitest'
import { normalizeOptions, type UnifedOptions } from '../src/options'
import { transformModule } from '../src/transform'
import { genBindingFacade } from '../src/virtual'

const ROOT = process.cwd()

function ctx(opts: UnifedOptions) {
  return { options: normalizeOptions(opts, ROOT, 'serve'), rewriteShared: true }
}

async function x(code: string, opts: UnifedOptions = { name: 'host', shared: { vue: '^3.4.0' } }) {
  return transformModule(code, '/src/a.ts', ctx(opts))
}

describe('transform: shared 导入改写（绑定门面）', () => {
  it('默认导入：specifier 换为绑定门面（default）', async () => {
    const r = await x(`import Vue from 'vue'\nconsole.log(Vue)\n`)
    expect(r?.code).toMatch(/import Vue from 'virtual:unifed-shared:vue(\?f=[\w-]+)?'/)
    expect(r?.code).not.toContain(`from 'vue'`)
  })

  it('命名导入 + 别名', async () => {
    const r = await x(`import { ref, computed as C } from 'vue'\nconst a = [ref, C]\n`)
    expect(r?.code).toContain('?f=')
    expect(r?.code).toContain('ref')
    expect(r?.code).toContain('computed as C')
    expect(r?.code).not.toContain(`from 'vue'`)
  })

  it('混合 default + 命名', async () => {
    const r = await x(`import Vue, { ref } from 'vue'\nconsole.log(Vue, ref)\n`)
    expect(r?.code).toContain('?f=')
  })

  it('命名空间导入 → TLA loadShare 兜底', async () => {
    const r = await x(`import * as Vue from 'vue'\nconsole.log(Vue)\n`)
    expect(r?.code).toContain('__unifed_loadShare("vue"')
    expect(r?.code).toContain('Vue = __unifed_m0')
  })

  it('副作用导入 → 无绑定门面（仅协商）', async () => {
    const r = await x(`import 'vue'\nconsole.log(1)\n`)
    expect(r?.code).toContain("import 'virtual:unifed-shared:vue'")
  })

  it('动态导入 → loadShare 表达式（保持 Promise 语义）', async () => {
    const r = await x(`const m = await import('vue')\nconsole.log(m)\n`)
    expect(r?.code).toContain(`await __unifed_loadShare("vue", {`)
    expect(r?.code).not.toContain(`import('vue')`)
  })

  it('export { x } from → 门面 specifier', async () => {
    const r = await x(`export { ref } from 'vue'\n`)
    expect(r?.code).toMatch(/export \{ ref \} from 'virtual:unifed-shared:vue(\?f=[\w-]+)?'/)
  })

  it('export { default as D } from → 门面 specifier（default）', async () => {
    const r = await x(`export { default as V } from 'vue'\n`)
    expect(r?.code).toMatch(/export \{ default as V \} from 'virtual:unifed-shared:vue(\?f=[\w-]+)?'/)
  })

  it('export * as N from → TLA 兜底 + re-export', async () => {
    const r = await x(`export * as N from 'vue'\n`)
    expect(r?.code).toContain('const N = await __unifed_loadShare')
    expect(r?.code).toContain('export { N };')
  })

  it('export * from shared → 明确报错（ESM 静态导出限制）', async () => {
    await expect(x(`export * from 'vue'\n`)).rejects.toThrow(/export \* from/)
  })

  it('import type 不改写', async () => {
    const r = await x(`import type { Ref } from 'vue'\nconst a: Ref<number> = { value: 1 }\n`)
    expect(r).toBeNull()
  })

  it('import 花括号内注释不破坏生成（jeecg useTitle 案例）', async () => {
    const r = await x(`import {\n  watch,\n  // FunctionalComponent, CSSProperties\n} from 'vue'\nconst a = watch\n`)
    expect(r?.code).toContain('?f=')
    // 语句形态保留：行内注释随原语句保留（合法 ESM）
    expect(r?.code).toContain('} from')
  })

  it('同一包多条导入各自独立门面（无重复声明）', async () => {
    const r = await x(`import { ref } from 'vue'\nimport { computed } from 'vue'\nconst a = [ref, computed]\n`)
    expect(r?.code).not.toContain(`from 'vue'`)
    expect((r?.code.match(/\?f=/g) || []).length).toBe(2)
  })

  it('非 shared 导入不受影响', async () => {
    const r = await x(`import { something } from 'not-shared'\nconsole.log(something)\n`)
    expect(r).toBeNull()
  })

  it('绑定门面内容：singleton 进入 loadShare 参数 + 绑定转发', async () => {
    const opts = { name: 'h', shared: { vue: { singleton: true, requiredVersion: '^3.4.0' } } }
    const normalized = normalizeOptions(opts, ROOT, 'serve')
    const content = genBindingFacade(
      normalized.shared[0],
      ['ref'],
      `loadShare("vue", { shareScope: "default", shareKey: "vue", requiredVersion: "^3.4.0", singleton: true, fallback: () => import("vue") })`,
    )
    expect(content).toContain('singleton: true')
    expect(content).toContain('export const ref = __unifed_m.ref;')
    expect(content).toContain('export default __unifedU(__unifed_m);')
  })
})

describe('transform: remote 导入改写', () => {
  const OPTS: UnifedOptions = {
    name: 'host',
    remotes: { 'remote-a': 'http://localhost:5101' },
  }

  it('静态默认导入 → 远程绑定门面', async () => {
    const r = await transformModule(
      `import Btn from 'remote-a/Button'\nconsole.log(Btn)\n`,
      '/src/a.ts',
      ctx(OPTS),
    )
    expect(r?.code).toMatch(/import Btn from 'virtual:unifed-shared:__remote__remote-a\/\.\/Button(\?f=[\w-]+)?'/)
  })

  it('无 ./ 前缀自动补齐', async () => {
    const r = await transformModule(
      `import { formatDate } from 'remote-a/utils/date'\nconsole.log(formatDate)\n`,
      '/src/a.ts',
      ctx(OPTS),
    )
    expect(r?.code).toContain('__remote__remote-a/./utils/date')
  })

  it('动态导入 → loadRemote（Promise 语义一致）', async () => {
    const r = await transformModule(
      `const m = await import('remote-a/Button')\nconsole.log(m)\n`,
      '/src/a.ts',
      ctx(OPTS),
    )
    expect(r?.code).toContain(`await __unifed_loadRemote("remote-a/./Button")`)
  })

  it('命名空间导入 → TLA 兜底', async () => {
    const r = await transformModule(
      `import * as RA from 'remote-a/Button'\nconsole.log(RA)\n`,
      '/src/a.ts',
      ctx(OPTS),
    )
    expect(r?.code).toContain('__unifed_loadRemote("remote-a/./Button")')
    expect(r?.code).toContain('RA = __unifed_m0')
  })

  it('非远程导入不受影响', async () => {
    const r = await transformModule(`import x from 'other-remote/Thing'\n`, '/src/a.ts', ctx(OPTS))
    expect(r).toBeNull()
  })
})

describe('transform: dev .vue post 阶段（依赖 URL 重映射）', () => {
  it('预构建 URL 映射回包名后换门面', async () => {
    const code = `import { ref } from "/node_modules/.vite/deps/vue.js?v=abc123"\nconst a = ref\n`
    const r = await transformModule(code, '/src/Comp.vue', {
      options: ctx({ name: 'h', shared: { vue: '^3.4.0' } }).options,
      rewriteShared: true,
      remapSpecifier: (spec) => spec.match(/deps\/([^/?]+)\.js/)?.[1] ?? null,
      devUrls: {
        runtime: '/@id/__x00__virtual:unifed-runtime?import',
        namespaceFacade: (k) => `/@id/__x00__virtual:unifed-shared:${k}?import`,
        bindingFacade: (id) => `/@id/__x00__${id}&import`,
      },
    })
    expect(r?.code).toMatch(/from "\/@id\/__x00__virtual:unifed-shared:vue\?f=[\w-]+&import"/)
    expect(r?.code).not.toContain('/node_modules/.vite/deps/vue.js')
  })

  it('dev 宿主 rewriteShared=false：shared 导入保留', async () => {
    const code = `import { ref } from 'vue'\nconst a = ref\n`
    const r = await transformModule(code, '/src/Comp.vue', {
      options: ctx({ name: 'h', shared: { vue: '^3.4.0' } }).options,
      rewriteShared: false,
    })
    expect(r).toBeNull()
  })
})
