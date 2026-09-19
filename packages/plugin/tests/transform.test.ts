import { describe, expect, it } from 'vitest'
import { federation } from '../src/index'
import { normalizeOptions, type FulgurjsOptions } from '../src/options'
import { transformModule, isExposeTargetFile, staticRuntimeImportError } from '../src/transform'
import { genBindingFacade, genBuildRemoteEntry, genDevRemoteEntry } from '../src/virtual'

const ROOT = process.cwd()

function ctx(opts: FulgurjsOptions) {
  return { options: normalizeOptions(opts, ROOT, 'serve'), rewriteShared: true }
}

async function x(code: string, opts: FulgurjsOptions = { name: 'host', shared: { vue: '^3.4.0' } }) {
  return transformModule(code, '/src/a.ts', ctx(opts))
}

describe('transform: shared 导入改写（绑定门面）', () => {
  it('默认导入：specifier 换为绑定门面（default）', async () => {
    const r = await x(`import Vue from 'vue'\nconsole.log(Vue)\n`)
    expect(r?.code).toMatch(/import Vue from 'virtual:fulgurjs-shared:vue(\?f=[\w-]+)?'/)
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
    expect(r?.code).toContain('__fulgurjs_loadShare("vue"')
    expect(r?.code).toContain('Vue = __fulgurjs_m0')
  })

  it('副作用导入 → 无绑定门面（仅协商）', async () => {
    const r = await x(`import 'vue'\nconsole.log(1)\n`)
    expect(r?.code).toContain("import 'virtual:fulgurjs-shared:vue'")
  })

  it('动态导入 → loadShare 表达式（保持 Promise 语义）', async () => {
    const r = await x(`const m = await import('vue')\nconsole.log(m)\n`)
    expect(r?.code).toContain(`await __fulgurjs_loadShare("vue", {`)
    expect(r?.code).not.toContain(`import('vue')`)
  })

  it('export { x } from → 门面 specifier', async () => {
    const r = await x(`export { ref } from 'vue'\n`)
    expect(r?.code).toMatch(/export \{ ref \} from 'virtual:fulgurjs-shared:vue(\?f=[\w-]+)?'/)
  })

  it('export { default as D } from → 门面 specifier（default）', async () => {
    const r = await x(`export { default as V } from 'vue'\n`)
    expect(r?.code).toMatch(/export \{ default as V \} from 'virtual:fulgurjs-shared:vue(\?f=[\w-]+)?'/)
  })

  it('export * as N from → TLA 兜底 + re-export', async () => {
    const r = await x(`export * as N from 'vue'\n`)
    expect(r?.code).toContain('const N = await __fulgurjs_loadShare')
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
    expect(content).toContain('export const ref = __fulgurjs_m.ref;')
    expect(content).toContain('export default __fulgurjsU(__fulgurjs_m);')
  })
})

describe('transform: remote 导入改写', () => {
  const OPTS: FulgurjsOptions = {
    name: 'host',
    remotes: { 'remote-a': 'http://localhost:5101' },
  }

  it('静态默认导入 → 远程绑定门面', async () => {
    const r = await transformModule(
      `import Btn from 'remote-a/Button'\nconsole.log(Btn)\n`,
      '/src/a.ts',
      ctx(OPTS),
    )
    expect(r?.code).toMatch(/import Btn from 'virtual:fulgurjs-shared:__remote__remote-a\/\.\/Button(\?f=[\w-]+)?'/)
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
    expect(r?.code).toContain(`await __fulgurjs_loadRemote("remote-a/./Button")`)
  })

  it('命名空间导入 → TLA 兜底', async () => {
    const r = await transformModule(
      `import * as RA from 'remote-a/Button'\nconsole.log(RA)\n`,
      '/src/a.ts',
      ctx(OPTS),
    )
    expect(r?.code).toContain('__fulgurjs_loadRemote("remote-a/./Button")')
    expect(r?.code).toContain('RA = __fulgurjs_m0')
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
        runtime: '/@id/__x00__virtual:fulgurjs-runtime?import',
        namespaceFacade: (k) => `/@id/__x00__virtual:fulgurjs-shared:${k}?import`,
        bindingFacade: (id) => `/@id/__x00__${id}&import`,
      },
    })
    expect(r?.code).toMatch(/from "\/@id\/__x00__virtual:fulgurjs-shared:vue\?f=[\w-]+&import"/)
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

describe('transform: 门面签名确定性（回归：进程内序号导致重启后 404）', () => {
  it('同一模块重复转换/不同转换顺序下签名一致', async () => {
    const code = `import { ref, computed as C } from 'vue'\nconst a = [ref, C]\n`
    const r1 = await x(code)
    const r2 = await x(`import { other } from './other'\nconst q = other\n`)
    const r3 = await x(code)
    const sig1 = r1?.code.match(/\?f=([\w-]+)/)?.[1]
    const sig3 = r3?.code.match(/\?f=([\w-]+)/)?.[1]
    expect(sig1).toBeTruthy()
    expect(sig1).toBe(sig3)
  })

  it('不同绑定集签名不同', async () => {
    const r1 = await x(`import { ref } from 'vue'\nconst a = ref\n`)
    const r2 = await x(`import { ref, computed } from 'vue'\nconst a = [ref, computed]\n`)
    const sig1 = r1?.code.match(/\?f=([\w-]+)/)?.[1]
    const sig2 = r2?.code.match(/\?f=([\w-]+)/)?.[1]
    expect(sig1).not.toBe(sig2)
  })
})

describe('dev 容器入口：注册自身 remotes（回归：双向联邦 MFU-008）', () => {
  it('有 remotes 时容器入口顶层 registerRemotes', () => {
    const entry = genDevRemoteEntry(
      normalizeOptions(
        {
          name: 'remote-a',
          exposes: { './TaskCard': './src/TaskCard.vue' },
          remotes: { 'host-remote': { dev: 'http://localhost:5100/main', prod: '/main' } },
          shared: { vue: '^3.4.0' },
        },
        ROOT,
        'serve',
      ),
      '/flowable/',
    )
    expect(entry).toContain('registerRemotes(')
    expect(entry).toContain('"name":"host-remote"')
    expect(entry).toContain('http://localhost:5100/main/@fulgurjs-entry.js')
    expect(entry).toContain('@id/virtual:fulgurjs-runtime')
  })

  it('无 remotes 时不生成 registerRemotes', () => {
    const entry = genDevRemoteEntry(
      normalizeOptions({ name: 'remote-a', exposes: { './Button': './src/Button.vue' }, shared: { vue: '^3.4.0' } }, ROOT, 'serve'),
      '/remote-a/',
    )
    expect(entry).not.toContain('registerRemotes(')
  })
})

describe('prod 容器入口：注册自身 remotes（回归：双向联邦 prod MFU-008）', () => {
  it('有 remotes 时顶层 registerRemotes（external 自报名）', () => {
    const entry = genBuildRemoteEntry(
      normalizeOptions(
        {
          name: 'remote-a',
          exposes: { './TaskCard': './src/TaskCard.vue' },
          remotes: { 'host-remote': { external: 'host-app@http://localhost:5101/main', prod: '/main' } },
          shared: { vue: '^3.4.0' },
        },
        ROOT,
        'build',
      ),
      {},
    )
    expect(entry).toContain('registerRemotes(')
    expect(entry).toContain('"name":"host-app"')
    expect(entry).toContain('/main/fulgurjs-remoteEntry.js')
    expect(entry).toContain('virtual:fulgurjs-runtime')
  })

  it('无 remotes 时不生成 registerRemotes', () => {
    const entry = genBuildRemoteEntry(
      normalizeOptions({ name: 'remote-a', exposes: { './Button': './src/Button.vue' }, shared: { vue: '^3.4.0' } }, ROOT, 'build'),
      {},
    )
    expect(entry).not.toContain('registerRemotes(')
  })
})

describe('build 改写门禁：node_modules 依赖进管线（回归：双向联邦 prod 双 vue）', () => {
  // 依赖包源码形态：element-plus 等对 shared（vue）的导入必须被门面化，否则
  // prod 依赖 chunk 内联本地 vue → 双实例（'ce' 错误）；dev 走 devSharedSelf 判定所以通
  const DEP_ID = '/proj/node_modules/element-plus/es/index.mjs'
  const DEP_CODE = `import { ref } from 'vue'\nexport const a = ref\n`

  /** 走真实插件 hook（config 初始化 normalized 后调 pre.transform）验证 build 门禁判定 */
  async function buildPreTransform(opts: FulgurjsOptions, id: string, code = DEP_CODE) {
    const [pre] = federation({ ...opts })
    await (pre.config as NonNullable<typeof pre.config>)({}, { command: 'build' } as never)
    return (pre.transform as NonNullable<typeof pre.transform>)(code, id)
  }

  it('双向联邦（exposes + remotes + devSharedSelf: true）：node_modules 依赖被门面化', async () => {
    const r = await buildPreTransform(
      {
        name: 'remote-a',
        exposes: { './TaskCard': './src/TaskCard.vue' },
        remotes: { 'host-remote': { dev: 'http://localhost:5100/main', prod: '/main' } },
        devSharedSelf: true,
        shared: { vue: '^3.4.0' },
      },
      DEP_ID,
    )
    expect(r?.code).toMatch(/virtual:fulgurjs-shared:vue(\?f=[\w-]+)?/)
    expect(r?.code).not.toContain(`from 'vue'`)
  })

  it('双向联邦默认 devSharedSelf: false：保持宿主行为，node_modules 不进管线', async () => {
    const r = await buildPreTransform(
      {
        name: 'remote-a',
        exposes: { './TaskCard': './src/TaskCard.vue' },
        remotes: { 'host-remote': { dev: 'http://localhost:5100/main', prod: '/main' } },
        shared: { vue: '^3.4.0' },
      },
      DEP_ID,
    )
    expect(r).toBeNull()
  })

  it('纯 remote（exposes 有、remotes 无）：node_modules 依赖被门面化（旧行为保持）', async () => {
    const r = await buildPreTransform(
      { name: 'mes-lowcode', exposes: { './DesignPage': './src/DesignPage.vue' }, shared: { vue: '^3.4.0' } },
      DEP_ID,
    )
    expect(r?.code).toMatch(/virtual:fulgurjs-shared:vue/)
  })

  it('双向联邦下 .vue?type=script 子请求走同一门禁（build pre 分支）', async () => {
    const r = await buildPreTransform(
      {
        name: 'remote-a',
        exposes: { './TaskCard': './src/TaskCard.vue' },
        remotes: { 'host-remote': { dev: 'http://localhost:5100/main', prod: '/main' } },
        devSharedSelf: true,
        shared: { vue: '^3.4.0' },
      },
      '/proj/src/TaskCard.vue?vue&type=script&setup=true&lang.ts',
    )
    expect(r?.code).toMatch(/virtual:fulgurjs-shared:vue/)
  })
})

describe('D.1 守卫：exposes 目标文件静态导入虚拟运行时', () => {
  const exposes = [
    { name: './pages/detail', import: './src/views/detail/index.vue' },
    { name: './federatedBoot', import: './src/fulgurjs-exposes/federatedBoot.ts' },
  ]
  const root = '/proj'

  it('exposes 主请求路径命中', () => {
    expect(isExposeTargetFile('/proj/src/views/detail/index.vue', root, exposes)).toBe(true)
  })

  it('exposes 无扩展名声明按候选扩展名命中', () => {
    const noExt = [{ name: './boot', import: './src/boot' }]
    expect(isExposeTargetFile('/proj/src/boot.ts', root, noExt)).toBe(true)
    expect(isExposeTargetFile('/proj/src/boot.vue', root, noExt)).toBe(true)
  })

  it('宿主侧非 expose 文件（demo 页/路由表）不命中', () => {
    expect(isExposeTargetFile('/proj/src/views/fulgurjs/FulgurjsDemo.vue', root, exposes)).toBe(false)
    expect(isExposeTargetFile('/proj/src/qiankun/fulgurjsPages.ts', root, exposes)).toBe(false)
  })

  it('非本项目路径不命中', () => {
    expect(isExposeTargetFile('/other/proj/src/views/detail/index.vue', root, exposes)).toBe(false)
  })

})
