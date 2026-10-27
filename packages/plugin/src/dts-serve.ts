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
 * 重启可恢复经过输入/摘要校验的成功产物；关闭只清理服务独占的编译临时目录。
 */
import type { NormalizedOptions } from './options'
import path from 'node:path'
import fs from 'node:fs'
import { createVueCompilerSession } from './dts-vue-session'
import { createRequire } from 'node:module'
import { generateTypesBundle, type DtsGenerateResult } from './dts-generate'
import { createTypesCacheWorker, type TypesCacheHandle } from './dts-cache-worker-client'

/**
 * 只响应可能改变声明的源码和配置。Vite watcher 同时观察日志、截图和文档；
 * 把这些事件排进 vue-tsc 会让一次耗时生成结束后立即再跑一轮。
 * JSON 仍是输入（resolveJsonModule 可从数据推导类型），不能一并过滤。
 * 不逐文件观察类型输出：临时配置和宿主同步声明必须排除；上游新代次完整同步
 * 后由显式回调统一 invalidate，避免写入过程和未变化轮询触发生成自循环。
 */
export function isTypesInputChange(root: string, id: string, outputDir: string): boolean {
  const relative = path.relative(root, id)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false
  if (relative.split(path.sep).some(part => part === 'node_modules' || part === '.vite')) return false
  if (path.basename(id).startsWith('.fulgurjs-types-tsconfig-')) return false
  const outputRelative = path.relative(outputDir, id)
  if (!(outputRelative.startsWith(`..${path.sep}`) || path.isAbsolute(outputRelative))) return false
  return /\.(?:[cm]?[jt]sx?|vue|json)$/i.test(id)
}

export interface ServedTypesFile {
  body: string
  contentType: string
}

export interface DevTypesServer {
  /** 当前 bundle revision（未就绪为 null——manifest 省略 types 字段） */
  revision(): string | null
  /** 服务一个已剥离 base 的路径；命中返回内容，未就绪/未知返回 null（404） */
  servePath(strippedPath: string): ServedTypesFile | null
  /** 检查输入并更新声明；未变化可复用成功缓存，生成中触发会合并排队。 */
  invalidate(): void
  /** 文件事件到达时立即标记，防止防抖期间发布旧结果。 */
  markInputChanged(): void
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
  const vueCompiler = createVueCompilerSession()
  let files: Map<string, string> | null = null
  let revision: string | null = null
  let generating: Promise<void> | null = null
  let pendingInvalidate = false
  let disposed = false
  let lastErrorKey: string | null = null
  let incrementalDir: string | undefined

  const clearCache = (): void => {
    if (incrementalDir) fs.rmSync(incrementalDir, { recursive: true, force: true })
    incrementalDir = undefined
  }

  const publicExposes = options.exposes
    .filter((e) => !e.internal)
    .map((e) => ({ name: e.name, import: e.import }))

  const cacheInput = { root: options.root, exposes: publicExposes, pluginVersion: options.pluginVersion, dts: options.dts }
  // 现代Vue工具能够直接记录真实输入，无需在编译前跑第二套依赖分析。
  let compilerTracesInputs = false
  if (publicExposes.some(entry => entry.import.endsWith('.vue'))) {
    try { const req = createRequire(path.join(options.root, 'package.json')); compilerTracesInputs = Number(String(req('vue-tsc/package.json').version).split('.')[0]) >= 2 } catch { /* 缺失工具走既有诊断 */ }
  }
  let cacheUnavailableAnnounced = false
  let inputEpoch = 0
  const cache = createTypesCacheWorker()
  const changed = (): void => { inputEpoch++; void ensure() }
  const queueRecheck = (reason?: string): void => {
    pendingInvalidate = true
    log(`[fulgurjs] 类型输入在校验/生成期间变化${reason ? `（${reason}）` : ''}，已排队重检；本轮结果不发布到缓存。`)
  }
  const run = async (): Promise<void> => {
    await new Promise<void>(resolve => setImmediate(resolve))
    if (disposed) return
    const epoch = inputEpoch
    const started = performance.now()
    let handle: TypesCacheHandle | null = null
    try {
      try {
        const cached = await cache.read(cacheInput)
        if (disposed) return
        if (cached) {
          handle = cached
          cache.watch(cached, changed)
          // 外部输入监听安装后再次校验，封闭监听建立前的窗口。
          const reason = await cache.validate(cacheInput, cached, false)
          if (disposed) return
          if (epoch !== inputEpoch || pendingInvalidate) { queueRecheck(); return }
          if (!reason) {
            files = cached.result.files
            revision = cached.result.index.revision
            lastErrorKey = null
            log(`[fulgurjs] 类型缓存命中（后台输入与声明摘要校验 ${Math.round(performance.now() - started)}ms，${cached.result.fileCount} 个声明文件，revision ${revision}），无需重新编译。`)
            return
          }
          // 有效旧快照不代表输入仍有效；失效后必须进入冷生成，不能反复读取同一旧快照。
          await cache.release(cacheInput, cached)
          handle = null
        }
        if (!compilerTracesInputs) handle = await cache.capture(cacheInput)
        if (disposed) return
        if (handle) cache.watch(handle, changed)
        else if (!compilerTracesInputs && !cacheUnavailableAnnounced) {
          cacheUnavailableAnnounced = true
          log('[fulgurjs] 类型缓存：无法建立完整输入快照，使用正常编译；自定义编译插件、外部模板或工具不可读取时不复用持久缓存。')
        }
      } catch (error) {
        if (disposed) return
        if (handle) await cache.release(cacheInput, handle).catch(() => {})
        handle = null
        if (!cacheUnavailableAnnounced) {
          cacheUnavailableAnnounced = true
          warn(`[fulgurjs] 类型缓存后台检查不可用：${(error as Error).message}；已回到正常生成。请检查插件安装及缓存目录权限。`)
        }
      }
      let result: DtsGenerateResult
      try {
        if (!incrementalDir) {
          const cacheRoot = path.join(options.root, 'node_modules')
          fs.mkdirSync(cacheRoot, { recursive: true })
          incrementalDir = fs.mkdtempSync(path.join(cacheRoot, '.fulgurjs-types-cache-'))
        }
        result = await generateTypesBundle({ root: options.root, exposes: publicExposes,
          pluginVersion: options.pluginVersion, signal: controller.signal, incrementalDir, vueCompiler })
      } catch (e) {
        result = { ok: false, diagnostics: [`声明生成发生未预期异常（已拦截）：${(e as Error).stack ?? (e as Error).message}`] }
      }
      if (disposed) return
      if (result.ok) for (const notice of result.notices) warn(`[fulgurjs] 类型生成提示：${notice}`)
      if (result.ok && result.cacheTraceFile && !handle) {
        try {
          handle = await cache.capture(cacheInput, result.cacheTraceFile)
          if (handle) cache.watch(handle, changed)
        } catch (error) {
          if (disposed) return
          if ((error as Error).message.startsWith('输入已变化：')) { queueRecheck((error as Error).message); return }
          warn(`[fulgurjs] 编译输入记录不可用：${(error as Error).message}；本轮不写持久缓存。`)
        }
      }
      if (result.ok && compilerTracesInputs && !handle && !cacheUnavailableAnnounced) {
        cacheUnavailableAnnounced = true
        log('[fulgurjs] 类型声明已生成，但未建立可验证的编译输入记录，本轮不保存跨重启缓存；自定义Vue编译插件、外部模板或记录不可写时使用正常生成。')
      }
      let changedDuringGeneration = pendingInvalidate || epoch !== inputEpoch
      if (handle) {
        try { const reason = await cache.validate(cacheInput, handle, true); if (reason) { queueRecheck(reason); return } }
        catch (error) {
          if (disposed) return
          warn(`[fulgurjs] 类型缓存校验失败：${(error as Error).message}；本轮不写持久缓存。`)
          await cache.release(cacheInput, handle).catch(() => {})
          handle = null
        }
      }
      if (disposed) return
      if (changedDuringGeneration || pendingInvalidate || epoch !== inputEpoch) { queueRecheck(); return }
      if (result.ok) {
        if (handle) {
          try { if (!await cache.write(cacheInput, handle, result)) { queueRecheck(); return } }
          catch (error) {
            if (disposed) return
            warn(`[fulgurjs] 类型缓存写入失败：${(error as Error).message}；本轮声明正常提供，下次可能重新编译。请检查 node_modules/.cache/fulgurjs 的写入权限。`)
          }
        }
        if (disposed) return
        if (pendingInvalidate || epoch !== inputEpoch) { queueRecheck(); return }
        files = result.files
        revision = result.index.revision
        lastErrorKey = null
        log(`[fulgurjs] 类型资源已生成（${result.tool}，${result.fileCount} 个声明文件，revision ${revision}）`
          + `${result.index.externals.length > 0 ? `；外部类型依赖：${result.index.externals.join(', ')}` : ''}。宿主将自动同步。`)
      } else {
        files = null
        revision = null
        const key = result.diagnostics.join('\n')
        if (key !== lastErrorKey) {
          lastErrorKey = key
          warn(`[fulgurjs] TYP-001 远程类型资源生成失败（manifest 不携带 types，宿主类型同步将提示未提供）：\n${key}`)
        }
      }
    } finally {
      if (handle) await cache.release(cacheInput, handle).catch(() => {})
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
        if (disposed) clearCache()
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
      inputEpoch++
      void ensure()
    },
    markInputChanged(): void { if (!disposed) inputEpoch++ },
    isGenerating: () => generating !== null,
    dispose(): void {
      disposed = true
      controller.abort()
      vueCompiler.dispose()
      cache.dispose()
      if (!generating) clearCache()
    },
  }
}
