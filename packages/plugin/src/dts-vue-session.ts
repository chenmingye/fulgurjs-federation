/**
 * 单个dev服务独占的类型编译进程（Vue及纯TS合同生成共用隔离协议）。
 * 请求串行，现代Vue保留官方Program的内存状态；
 * 关闭/取消直接终止自有子进程，CLI/build不使用本会话。
 */
import { spawn, type ChildProcess, type ExecFileException } from 'node:child_process'
export interface VueCompileResult { err: ExecFileException | null; stdout: string; stderr: string }
export interface VueCompileRequest { root: string; script: string; args: string[]; nodeArgs: string[]; timeout: number; signal?: AbortSignal }
export interface VueCompilerSession {
  /** 冷路径并行载入提供方工具，不编译源码；已有进程或已关闭时不启动。 */
  prime(root: string): number | undefined
  run(request: VueCompileRequest): Promise<VueCompileResult>
  dispose(): void
}

const bootstrap = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const ts = req('typescript');
try { req('vue-tsc'); } catch { /* 实际生成路径负责报告工具缺失/加载错误 */ }
const sys = {...ts.sys};
const state = {};
const same = (a,b) => a.ctimeMs===b.ctimeMs && a.mtimeMs===b.mtimeMs && a.ino===b.ino && a.size===b.size;
let tools = new Map(Object.keys(require.cache).flatMap(file=>{try{return [[file,fs.statSync(file)]]}catch{return []}}));
process.on('disconnect', () => process.exit(0));
process.on('message', message => {
  // require.cache中的已加载代码不会因磁盘变化而热替换；必须换进程。
  for (const [file,before] of tools) {
    try { if (same(before,fs.statSync(file))) continue; } catch {}
    process.send({id:message.id,restart:true}); return;
  }
  Object.assign(ts.sys,sys);
  process.argv=[process.execPath,...message.args];
  process.exitCode=undefined;
  let stdout='',stderr='',bytes=0,error;
  const originals=[process.stdout.write,process.stderr.write];
  const capture = target => (chunk,encoding,callback) => {
    const text=typeof chunk==='string'?chunk:chunk.toString(typeof encoding==='string'?encoding:'utf8');
    bytes+=Buffer.byteLength(text); if(bytes>64*1024*1024)throw Error('类型编译输出超过64MB');
    if(target==='stdout')stdout+=text;else stderr+=text;
    const done=typeof encoding==='function'?encoding:callback;if(done)queueMicrotask(done);
    return true;
  };
  process.stdout.write=capture('stdout');process.stderr.write=capture('stderr');
  try { new Function('require','__fulgurjsProgramState',message.script)(require,state); }
  catch (e) { error=e.stack||String(e); }
  finally {
    process.stdout.write=originals[0];process.stderr.write=originals[1];
    Object.assign(ts.sys,sys);
  }
  tools=new Map();
  for(const file of Object.keys(require.cache)){try{tools.set(file,fs.statSync(file))}catch{}}
  const code=error?1:Number(process.exitCode||0);process.exitCode=undefined;
  process.send({id:message.id,code,stdout,stderr:stderr+(error?'\n'+error:''),reusable:state.reusable!==false});
});
`

export function createVueCompilerSession(): VueCompilerSession {
  let child: ChildProcess | null = null
  let identity = ''
  let startupOut = '', startupErr = ''
  let disposed = false
  let reusable = true
  let serial = 0
  let active: { id: number; resolve(result: VueCompileResult): void; stdout: string; stderr: string; aborted: boolean; timedOut: boolean; toolChanged?: boolean; cleanup(): void } | null = null
  // 同一服务只允许一个编译子进程；并发请求排队而不是把合法重检变成 TYP-001。
  let idleWaiters: (() => void)[] = []
  const notifyIdle = (): void => { const waiters = idleWaiters; idleWaiters = []; for (const wake of waiters) wake() }
  const finish = (result: VueCompileResult): void => { const request = active; active = null; if (request) { request.cleanup(); request.resolve(result) } notifyIdle() }
  const startChild = (root: string, nodeArgs: string[]): ChildProcess => {
    const running = spawn(process.execPath, [...nodeArgs, '--eval', bootstrap], { cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    child = running
    startupOut = ''; startupErr = ''
    reusable = true
    running.stdout!.setEncoding('utf8').on('data', (value: string) => { if (child === running) { if (active) active.stdout += value; else startupOut += value } })
    running.stderr!.setEncoding('utf8').on('data', (value: string) => { if (child === running) { if (active) active.stderr += value; else startupErr += value } })
    running.on('message', (message: { id: number; restart?: boolean; code?: number; stdout?: string; stderr?: string; reusable?: boolean }) => {
      if (child !== running || active?.id !== message.id) return
      // 取消/超时后可能仍有已排队的完成消息；必须等close再释放会话，
      // 否则下一轮会向正在退出的进程发送请求。
      if (active.aborted || active.timedOut) return
      if (message.restart) {
        // 标记为受控失败，生成器下一次尝试会以新进程加载工具。
        reusable = false
        active.toolChanged = true
        running.kill('SIGTERM')
        return
      }
      reusable = message.reusable !== false
      const err = message.code ? Object.assign(new Error('Vue声明编译失败'), { code: message.code }) as ExecFileException : null
      finish({ err, stdout: active.stdout + (message.stdout ?? ''), stderr: active.stderr + (message.stderr ?? '') })
    })
    running.on('error', error => { if (child === running) { child = null; finish({ err: error as ExecFileException, stdout: active?.stdout ?? '', stderr: active?.stderr ?? '' }) } })
    running.on('close', (code, signal) => {
      if (child !== running) return
      child = null
      if (!active) return
      const err = Object.assign(new Error(active.aborted ? 'Vue声明编译已取消' : active.timedOut ? 'Vue声明编译超时' : 'Vue编译进程已退出'), {
        code: active.aborted ? 'ABORT_ERR' : active.toolChanged ? 'FG_COMPILER_TOOL_CHANGED' : code ?? undefined, signal, killed: active.aborted || active.timedOut,
      }) as ExecFileException
      finish({ err, stdout: active.stdout, stderr: active.stderr })
    })
    return running
  }
  const runRequest = (request: VueCompileRequest): Promise<VueCompileResult> => {
      if (disposed || request.signal?.aborted) return Promise.resolve({ err: Object.assign(new Error('Vue编译会话已取消'), { code: 'ABORT_ERR' }), stdout: '', stderr: '' })
      // 排队：调用方在上一轮取消/超时后立即重检属于正常生命周期，不能变成“必须串行”编译失败。
      if (active) {
        return new Promise<VueCompileResult>((resolve) => {
          const start = (): void => {
            if (disposed || request.signal?.aborted) resolve({ err: Object.assign(new Error('Vue编译会话已取消'), { code: 'ABORT_ERR' }), stdout: '', stderr: '' })
            else resolve(runRequest(request))
          }
          idleWaiters.push(start)
        })
      }
      const key = JSON.stringify([request.root, request.nodeArgs, request.script])
      if (child && ((key !== identity && identity !== JSON.stringify([request.root, request.nodeArgs, ''])) || !reusable)) { child.kill('SIGKILL'); child = null }
      identity = key
      if (!child) startChild(request.root, request.nodeArgs)
      return new Promise(resolve => {
        const id = ++serial
        const running = child!
        const abort = (): void => { if (active?.id === id) { active.aborted = true; running.kill('SIGKILL') } }
        const timer = setTimeout(() => { if (active?.id === id) { active.timedOut = true; running.kill('SIGTERM') } }, request.timeout)
        active = { id, resolve, stdout: startupOut, stderr: startupErr, aborted: false, timedOut: false, cleanup() { clearTimeout(timer); request.signal?.removeEventListener('abort', abort) } }
        startupOut = ''; startupErr = ''
        request.signal?.addEventListener('abort', abort, { once: true })
        if (request.signal?.aborted) { abort(); return }
        running.send({ id, script: request.script, args: request.args }, error => { if (error && active?.id === id) {
          if (active.aborted || active.timedOut) return
          running.kill('SIGKILL'); child = null; finish({ err: error as ExecFileException, stdout: active.stdout, stderr: active.stderr })
        } })
      })
  }
  return {
    prime(root) {
      if (disposed || child || active) return undefined
      identity = JSON.stringify([root, [], ''])
      return startChild(root, []).pid
    },
    run: runRequest,
    dispose() { if (disposed) return; disposed = true; if (active) active.aborted = true; child?.kill('SIGKILL'); notifyIdle() },
  }
}
