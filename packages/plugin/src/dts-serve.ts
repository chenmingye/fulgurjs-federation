/**
 * 提供方 dev 类型服务（6.5.0 远程类型自动生成）。
 *
 * dev server 启动后后台生成声明 bundle（单飞：并发触发只跑一次；vue-tsc 子进程可
 * 中止），内存持有产物并由远程端点中间件对外服务：
 *   GET <base>/@fulgurjs-types/index.json   类型清单（协议见 dts-shared）
 *   GET <base>/@fulgurjs-types/files/...    声明闭包（只服务清单登记过的键）
 *
 * genDevManifest 的 types.revision 取自这里（bundle 未就绪时 manifest 省略 types，
 * 宿主轮询重试）。源码变化由调用方（index.ts watcher）触发 invalidate 防抖重生成；
 * 失败经 WARN 输出一次（按错误签名去重），manifest 不带 types——绝不标记成功。
 */
import type { NormalizedOptions } from './options'
import { generateTypesBundle, type DtsGenerateResult } from './dts-generate'

export interface ServedTypesFile {
  body: string
  contentType: string
}

export interface DevTypesServer {
  /** 当前 bundle revision（未就绪为 null——manifest 省略 types 字段） */
  revision(): string | null
  /** 服务一个已剥离 base 的路径；命中返回内容，未就绪/未知返回 null（404） */
  servePath(strippedPath: string): ServedTypesFile | null
  /** 触发重生成（防抖由调用方控制；生成中重复调用合并为一次排队） */
  invalidate(): void
  /** 是否正在生成（诊断用） */
  isGenerating(): boolean
  /** 停止：中止进行中的生成并拒绝后续 invalidate */
  dispose(): void
}

export function createDevTypesServer(
  options: NormalizedOptions,
  hooks: { warn?: (message: string) => void; log?: (message: string) => void } = {},
): DevTypesServer {
  const warn = hooks.warn ?? ((m: string) => console.warn(m))
  const log = hooks.log ?? ((m: string) => console.log(m))
  const controller = new AbortController()
  let files: Map<string, string> | null = null
  let revision: string | null = null
  let generating: Promise<void> | null = null
  let pendingInvalidate = false
  let disposed = false
  let lastErrorKey: string | null = null

  const publicExposes = options.exposes
    .filter((e) => !e.internal)
    .map((e) => ({ name: e.name, import: e.import }))

  const run = async (): Promise<void> => {
    if (disposed) return
    let result: DtsGenerateResult
    try {
      result = await generateTypesBundle({
        root: options.root,
        exposes: publicExposes,
        pluginVersion: options.pluginVersion,
        signal: controller.signal,
      })
    } catch (e) {
      result = { ok: false, diagnostics: [`声明生成发生未预期异常（已拦截）：${(e as Error).stack ?? (e as Error).message}`] }
    }
    if (disposed) return
    if (result.ok) {
      files = result.files
      revision = result.index.revision
      lastErrorKey = null
      log(
        `[fulgurjs] 类型资源已生成（${result.tool}，${result.fileCount} 个声明文件，revision ${result.index.revision}）` +
          `${result.index.externals.length > 0 ? `；外部类型依赖：${result.index.externals.join(', ')}` : ''}。宿主将自动同步。`,
      )
    } else {
      files = null
      revision = null
      const key = result.diagnostics.join('\n')
      if (key !== lastErrorKey) {
        lastErrorKey = key
        warn(`[fulgurjs] TYP-001 远程类型资源生成失败（manifest 不携带 types，宿主类型同步将提示未提供）：\n${key}`)
      }
    }
  }

  const ensure = async (): Promise<void> => {
    if (generating) {
      pendingInvalidate = true
      await generating
      return
    }
    // 单飞：进行中再触发的 invalidate 在当前轮结束后补跑一轮
    for (;;) {
      pendingInvalidate = false
      generating = run()
      try {
        await generating
      } finally {
        generating = null
      }
      if (!pendingInvalidate || disposed) return
    }
  }

  void ensure()

  return {
    revision: () => revision,
    servePath(strippedPath: string): ServedTypesFile | null {
      if (!files) return null
      if (strippedPath === '/@fulgurjs-types/index.json') {
        return { body: files.get('index.json') ?? '', contentType: 'application/json; charset=utf-8' }
      }
      if (strippedPath.startsWith('/@fulgurjs-types/')) {
        // 只服务清单登记过的 bundle 键（内存 Map 精确匹配——无路径解析，无越界面）
        const rel = strippedPath.slice('/@fulgurjs-types/'.length)
        const body = files.get(rel)
        if (body === undefined) return null
        return { body, contentType: 'text/plain; charset=utf-8' }
      }
      return null
    },
    invalidate(): void {
      if (disposed) return
      void ensure()
    },
    isGenerating: () => generating !== null,
    dispose(): void {
      disposed = true
      controller.abort()
    },
  }
}
