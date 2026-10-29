/**
 * 使用提供方的官方Vue映射生成隔离声明程序。
 *
 * 使用提供方自己的官方 SFC 类型映射；静态闭包保留诊断门禁，仅对公开声明依赖请求emit。
 * CLI 的全程序检查会额外检查运行时动态装配的全部业务页面，既耗时，也会让
 * 某些工具版本的增量诊断失去文件位置。这里不改源码、不抹掉类型、不改编译器。
 */
import { genTypesInputRecorder } from './dts-input-recorder'
import { genContractProjection } from './dts-contract'

export function genVueDeclarationProgram(): string {
  return String.raw`
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const __fgTimingsOn = !!process.env.FG_DTS_TIMINGS;
const __fgTimingStart = performance.now();
const __fgTimings = {};
const __fgMark = name => { if (__fgTimingsOn) __fgTimings[name] = Math.round(performance.now() - __fgTimingStart); };
const req = createRequire(path.join(process.cwd(), 'package.json'));
const ts = req('typescript');
const configFile = process.argv[1];
const generationInput = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const vue = generationInput.vue === false ? {createProgram:request=>ts.createProgram(request)} : req('vue-tsc');
const closure = new Set(generationInput.closure.map(file => path.resolve(file)));
${genTypesInputRecorder()}
const parseVue=generationInput.projectVue?req('vue/compiler-sfc').parse:undefined;
${genContractProjection()}
const projectedFiles=new Set();
// 投影只改变隔离声明程序的读取；输入记录器仍读取/校验真实源码。
if (generationInput.contractOnly) {
  const original = ts.sys.readFile;
  const projectedReads=new Map();
  ts.sys.readFile = (file,...args) => {
    const text = original(file,...args);
    const previous=projectedReads.get(file);
    if(previous&&previous.text===text)return previous.next;
    // 从本次真实读取投影；不能把父进程预扫时的旧文本覆盖到新源码上。
    const next=projectContract(file,text);
    projectedReads.set(file,{text,next});
    if(next!==text)projectedFiles.add(path.resolve(file));
    return next;
  };
}
const raw = ts.readConfigFile(configFile, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, path.dirname(configFile), undefined, configFile, undefined, [
  { extension: '.vue', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred },
]);
// 不把 Vue 的映射后诊断序列化到 TS buildinfo；有损的位置不能用于闭包门禁。
parsed.options.incremental = false;
// 允许已由Vue语言插件识别的非TS根文件；映射和诊断仍交给官方工具。
parsed.options.allowNonTsExtensions = true;
delete parsed.options.tsBuildInfoFile;
const formatHost = {
  getCurrentDirectory: () => process.cwd(),
  getCanonicalFileName: file => file,
  getNewLine: () => '\n',
};
const diagnostics = [...(raw.error ? [raw.error] : []), ...parsed.errors];
__fgMark('config');
if (!diagnostics.length) {
  const legacyProgram = typeof vue.createProgram === 'function';
  const reusableState = !legacyProgram && typeof __fulgurjsProgramState === 'object' ? __fulgurjsProgramState : undefined;
  let factory = vue.createProgram;
  let vueOptions, core, volar;
  if (!legacyProgram) {
    const toolReq = createRequire(req.resolve('vue-tsc'));
    volar = toolReq('@volar/typescript'); core = toolReq('@vue/language-core');
    vueOptions = core.createParsedCommandLine(ts, ts.sys, configFile).vueOptions;
    if (vueOptions.plugins?.length || vueOptions.hooks?.length) { traceValid = false; if(reusableState)reusableState.reusable=false; }
  }
  let state = reusableState;
  if (state) {
    if(state.packageInputs)for(const [file,before]of state.packageInputs){try{const now=fs.statSync(file);if(now.ctimeMs===before.ctime&&now.mtimeMs===before.mtime&&now.size===before.size&&now.ino===before.ino)continue}catch{}state.key=undefined;break;}
    const packages = Object.entries(parentInputs.files).filter(([file]) => path.basename(file)==='package.json' || /(?:lock|workspace)\.(?:json|ya?ml|lock)$/.test(file)).map(([file,value])=>[file,value.hash]);
    const key = JSON.stringify([parsed.options,vueOptions,parsed.fileNames,generationInput.closure,generationInput.contractOnly,generationInput.contractSources,parentInputs.links,packages]);
    if (state.key !== key) { state.key=key;state.files=new Map();state.program=undefined;state.packageInputs=undefined;state.factory=undefined;state.host=undefined;state.resolution=undefined;state.options=undefined; }
    else state.resolution?.clear();
    parsed.options = state.options ?? parsed.options;
    state.options = parsed.options;
  }
  if (!factory) {
    factory = state?.factory ?? volar.proxyCreateProgram(ts, ts.createProgram, (ts, options) => ({
      languagePlugins: [core.createVueLanguagePlugin(ts, options.options, vueOptions, id => id)],
    }));
    if (state) state.factory=factory;
  }
  const freshHost = ts.createCompilerHost(parsed.options);
  const host = state?.host ?? freshHost;
  if (state) { Object.assign(host,freshHost);state.host=host; }
  const readSource = host.getSourceFile;
  // TS官方增量主机也使用ParseForTypeErrors。这里只用于第三方声明文件：
  // 保留正确类型诊断所需的JSDoc，业务源码、JS、SFC和公开声明展示仍完整解析文档。
  // 自定义Vue编译扩展可能依赖额外注释信息，保持其原始解析路径。
  if (!legacyProgram && !vueOptions.plugins?.length && !vueOptions.hooks?.length
    && typeof ts.JSDocParsingMode?.ParseForTypeErrors === 'number') {
    host.getSourceFile = (file, language, ...args) => {
      const declaration = /\.d\.[cm]?ts$/.test(file) && file.replace(/\\/g, '/').includes('/node_modules/');
      const mode = declaration ? { ...(typeof language === 'object' ? language : { languageVersion: language }),
        jsDocParsingMode: ts.JSDocParsingMode.ParseForTypeErrors } : language;
      return readSource(file, mode, ...args);
    };
  }
  const baseGetSourceFile=host.getSourceFile;
  const stampEqual=(a,b)=>a.ctimeMs===b.ctimeMs&&a.mtimeMs===b.mtimeMs&&a.size===b.size&&a.ino===b.ino;
  if (state) {
    // 缓存原始AST；Volar仍负责生成/更新SFC映射，诊断不跨进程序列化。
    host.getSourceFile=(file,...args)=>{
      const key=path.resolve(file);let before;
      try{before=fs.statSync(file)}catch{state.files.delete(key);return baseGetSourceFile(file,...args)}
      const cached=state.files.get(key);
      if(cached&&stampEqual(cached.stat,before)&&cached.real===realpath(file)){
        if(cached.input)snapshot.files[key]={...cached.input};
        snapshot.links[key]=cached.real;
        return cached.source;
      }
      const source=baseGetSourceFile(file,...args);
      if(source){
        source.version=crypto.createHash('sha256').update(source.text).digest('hex');
        try{const after=fs.statSync(file);if(stampEqual(before,after))state.files.set(key,{source,stat:after,real:realpath(file),input:snapshot.files[key]});else state.files.delete(key)}catch{state.files.delete(key)}
      }
      return source;
    };
    // 每轮重新裁决解析，不能因AST复用忽略新出现的优先文件或package.json变化。
    host.hasInvalidatedResolutions=()=>true;
  }
  const writeFile = host.writeFile;
  host.writeFile = (fileName, text, ...args) => {
    const sources = args[2];
    if (sources?.length === 1 && sources[0].fileName.endsWith('.vue') && fileName.endsWith('.d.ts') && !fileName.endsWith('.vue.d.ts')) fileName=fileName.slice(0,-5)+'.vue.d.ts';
    return writeFile(fileName,text,...args);
  };
  const request={rootNames:parsed.fileNames,options:parsed.options,host,...(state?.program?{oldProgram:state.program}:{})};
  __fgMark('beforeProgram');
  const program=factory(request);
  if(projectedFiles.size)process.stderr.write('FG_DTS_CONTRACT '+projectedFiles.size+'\n');
  __fgMark('program');
  if(state){
    state.program=program;state.resolution=request.host.getModuleResolutionCache?.();
    const packageInputs=new Map(state.packageInputs||[]);
    for(const [file,value]of packageInputs)if(!snapshot.files[file])snapshot.files[file]={...value};
    for(const [file,value]of Object.entries(snapshot.files))if(path.basename(file)==='package.json')packageInputs.set(file,value);
    state.packageInputs=packageInputs;
  }
  diagnostics.push(...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics());
  __fgMark('globals');
  const sources = program.getSourceFiles().filter(file => {
    const original = file.fileName.replace(/(\.vue)\.[cm]?[jt]sx?$/, '$1');
    return closure.has(path.resolve(original));
  });
  if (__fgTimingsOn) process.stderr.write('FG_DTS_GRAPH ' + JSON.stringify({programFiles:program.getSourceFiles().length,
    checkedFiles:sources.length,projectedFiles:projectedFiles.size,
    declarationFiles:program.getSourceFiles().filter(f=>f.isDeclarationFile).length,
    vueFiles:program.getSourceFiles().filter(f=>/\.vue(?:\.[cm]?[jt]sx?)?$/.test(f.fileName)).length}) + '\n');
  // 诊断门禁仍覆盖完整静态闭包；只把公开声明实际引用的文件送入emit。
  for (const file of sources) {
    diagnostics.push(...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file));
  }
  __fgMark('diagnostics');
  const normalize = file => path.resolve(file.replace(/(\.vue)\.[cm]?[jt]sx?$/, '$1'));
  const sourceMap = new Map(sources.map(source => [normalize(source.fileName), source]));
  const pending = legacyProgram ? [...sourceMap.keys()] : generationInput.entries.map(normalize);
  const emittedFiles = new Set();
  const resolutionHost = { ...ts.sys, fileExists: file => ts.sys.fileExists(file) || (file.endsWith('.vue.ts') && ts.sys.fileExists(file.slice(0, -3))) };
  const follow = (specifier, from) => {
    const resolved = ts.resolveModuleName(specifier, from, parsed.options, resolutionHost).resolvedModule?.resolvedFileName;
    if (resolved && sourceMap.has(normalize(resolved))) pending.push(normalize(resolved));
  };
  while (pending.length) {
    const name = pending.pop();
    if (emittedFiles.has(name)) continue;
    emittedFiles.add(name);
    const file = sourceMap.get(name);
    if (!file || file.fileName.endsWith('.json')) continue;
    if (file.isDeclarationFile) {
      for (const imported of ts.preProcessFile(file.text, true, true).importedFiles) follow(imported.fileName, name);
      continue;
    }
    const emitted = program.emit(file, legacyProgram ? undefined : (out, text, ...args) => {
      host.writeFile(out, text, ...args);
      if (!out.endsWith('.d.ts')) return;
      const info = ts.preProcessFile(text, true, true);
      for (const imported of info.importedFiles) follow(imported.fileName, name);
      for (const ref of info.referencedFiles) {
        const source = path.resolve(path.dirname(name), ref.fileName);
        if (sourceMap.has(source)) pending.push(source);
      }
    }, undefined, true);
    diagnostics.push(...emitted.diagnostics);
    if (emitted.emitSkipped) diagnostics.push({ category: ts.DiagnosticCategory.Error, code: 90001,
      messageText: '暴露模块声明 emit 被编译器跳过：' + file.fileName });
  }

}
__fgMark('emit');
const errors = diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
// 读取视图下的诊断也须校验输入；失败记录只用于监听与重检，不会成为成功缓存。
if (!errors.length || generationInput.cacheCompilerReads) finishInputTrace();
__fgMark('trace');
if (__fgTimingsOn) process.stderr.write('FG_DTS_TIMINGS ' + JSON.stringify(__fgTimings) + '\n');
if (typeof __fulgurjsProgramState === 'object' && traceFile && !fs.existsSync(traceFile)) __fulgurjsProgramState.reusable=false;
if (errors.length) {
  process.stdout.write(ts.formatDiagnostics(errors, formatHost));
  process.exitCode = 1;
}
`
}
