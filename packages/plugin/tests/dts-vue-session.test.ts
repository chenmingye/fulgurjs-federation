import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createVueCompilerSession } from '../src/dts-vue-session'

function project() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fg-vue-session-'))
  fs.mkdirSync(path.join(root,'node_modules'))
  fs.symlinkSync(path.resolve(__dirname,'../node_modules/typescript'),path.join(root,'node_modules/typescript'),'dir')
  return root
}
it('预载只启动一个自有进程，实际请求接管同一PID；未编译就关闭也会退出', async () => {
  const root = project(), session = createVueCompilerSession()
  try {
    const pid = session.prime(root)
    expect(pid).toBeDefined()
    expect(session.prime(root)).toBeUndefined()
    const result = await session.run({ root, script: 'process.stdout.write(String(process.pid))', args: [], nodeArgs: [], timeout: 10000 })
    expect(result.err).toBeNull()
    expect(Number(result.stdout)).toBe(pid)
    session.dispose()
    await vi.waitFor(() => expect(() => process.kill(pid!, 0)).toThrow())
    expect(session.prime(root)).toBeUndefined()
    const unused = createVueCompilerSession(), unusedPid = unused.prime(root)
    unused.dispose()
    await vi.waitFor(() => expect(() => process.kill(unusedPid!, 0)).toThrow())
  } finally { session.dispose(); fs.rmSync(root, { recursive: true, force: true }) }
}, 15000)
it('同一服务串行复用进程，收集中文诊断且失败后可恢复',async()=>{
  const root=project(),session=createVueCompilerSession()
  const script=`__fulgurjsProgramState.count=(__fulgurjsProgramState.count||0)+1;process.stdout.write(JSON.stringify({pid:process.pid,count:__fulgurjsProgramState.count}));if(process.argv[1]==='bad'){process.stderr.write('真实中文诊断');process.exitCode=1;}`
  const run=(name:string)=>session.run({root,script,args:[name],nodeArgs:[],timeout:10000})
  try {
    const first=await run('ok'),bad=await run('bad'),recovered=await run('ok')
    expect(first.err).toBeNull();expect(bad.err?.code).toBe(1);expect(bad.stderr).toContain('真实中文诊断');expect(recovered.err).toBeNull()
    const a=JSON.parse(first.stdout),b=JSON.parse(recovered.stdout)
    expect(b.pid).toBe(a.pid);expect(b.count).toBe(3)
  }finally{session.dispose();fs.rmSync(root,{recursive:true,force:true})}
},15000)
it('取消等待到自有进程退出；关闭后不能重启',async()=>{
  const root=project(),session=createVueCompilerSession(),controller=new AbortController()
  try{
    const request=session.run({root,script:'while(true){}',args:[],nodeArgs:[],timeout:10000,signal:controller.signal})
    controller.abort()
    expect((await request).err?.code).toBe('ABORT_ERR')
    session.dispose()
    expect((await session.run({root,script:'',args:[],nodeArgs:[],timeout:1000})).err?.code).toBe('ABORT_ERR')
  }finally{session.dispose();fs.rmSync(root,{recursive:true,force:true})}
},15000)
it('超时终止进程后可重新创建，不留下执行中的请求',async()=>{
  const root=project(),session=createVueCompilerSession()
  try{
    const timed=await session.run({root,script:'while(true){}',args:[],nodeArgs:[],timeout:100})
    expect(timed.err?.killed).toBe(true)
    const recovered=await session.run({root,script:"process.stdout.write('恢复')",args:[],nodeArgs:[],timeout:10000})
    expect(recovered.err).toBeNull();expect(recovered.stdout).toBe('恢复')
  }finally{session.dispose();fs.rmSync(root,{recursive:true,force:true})}
},15000)

it('快速完成与取消竞争后立即开始下一轮，不复用正在退出的进程',async()=>{
  const root=project(),session=createVueCompilerSession()
  const script="process.stdout.write('ready')"
  try{
    for(let i=0;i<15;i++){
      const warm=await session.run({root,script,args:[],nodeArgs:[],timeout:10000});expect(warm.err).toBeNull()
      const controller=new AbortController();const pending=session.run({root,script,args:[],nodeArgs:[],timeout:10000,signal:controller.signal});const timer=setTimeout(()=>controller.abort(),i%3)
      await pending;clearTimeout(timer)
      const next=await session.run({root,script,args:[],nodeArgs:[],timeout:10000});expect(next.err).toBeNull();expect(next.stdout).toBe('ready')
    }
  }finally{session.dispose();fs.rmSync(root,{recursive:true,force:true})}
},30000)

it('并发重检请求排队执行，而不是把合法并发判成“必须串行”',async()=>{
  const root=project(),session=createVueCompilerSession()
  const script=`__fulgurjsProgramState.count=(__fulgurjsProgramState.count||0)+1;process.stdout.write(JSON.stringify({pid:process.pid,count:__fulgurjsProgramState.count}))`
  const request=()=>session.run({root,script,args:[],nodeArgs:[],timeout:10000})
  try{
    const [a,b]=await Promise.all([request(),request()])
    expect(a.err).toBeNull();expect(b.err).toBeNull()
    const pa=JSON.parse(a.stdout),pb=JSON.parse(b.stdout)
    expect(pb.pid).toBe(pa.pid)
    expect(Math.max(pa.count,pb.count)).toBe(2)
  }finally{session.dispose();fs.rmSync(root,{recursive:true,force:true})}
},15000)
