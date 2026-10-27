/**
 * 使用提供方的官方Vue映射生成隔离声明程序。
 *
 * 使用提供方自己的官方 SFC 类型映射；静态闭包保留诊断门禁，仅对公开声明依赖请求emit。
 * CLI 的全程序检查会额外检查运行时动态装配的全部业务页面，既耗时，也会让
 * 某些工具版本的增量诊断失去文件位置。这里不改源码、不抹掉类型、不改编译器。
 */
import { genTypesInputRecorder } from './dts-input-recorder'

export function genVueDeclarationProgram(): string {
  return String.raw`
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const ts = req('typescript');
const vue = req('vue-tsc');
const configFile = process.argv[1];
const generationInput = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const closure = new Set(generationInput.closure.map(file => path.resolve(file)));
${genTypesInputRecorder()}
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
if (!diagnostics.length) {
  // vue-tsc 2/3使用同一官方Vue语言插件与Volar公开Program代理，仍保留原始诊断映射。
  const createProgram = typeof vue.createProgram === 'function' ? vue.createProgram : (() => {
    const toolReq = createRequire(req.resolve('vue-tsc'));
    const { proxyCreateProgram } = toolReq('@volar/typescript');
    const core = toolReq('@vue/language-core');
    return proxyCreateProgram(ts, ts.createProgram, (ts, options) => {
      const vueOptions = core.createParsedCommandLine(ts, ts.sys, configFile).vueOptions;
      if (vueOptions.plugins?.length || vueOptions.hooks?.length) traceValid = false;
      return { languagePlugins: [core.createVueLanguagePlugin(ts, options.options, vueOptions, id => id)] };
    });
  })();
  const host = ts.createCompilerHost(parsed.options);
  const writeFile = host.writeFile;
  host.writeFile = (fileName, text, ...args) => {
    const sources = args[2];
    if (sources?.length === 1 && sources[0].fileName.endsWith('.vue') && fileName.endsWith('.d.ts') && !fileName.endsWith('.vue.d.ts')) {
      fileName = fileName.slice(0, -5) + '.vue.d.ts';
    }
    return writeFile(fileName, text, ...args);
  };
  const program = createProgram({ rootNames: parsed.fileNames, options: parsed.options, host });
  diagnostics.push(...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics());
  const sources = program.getSourceFiles().filter(file => {
    const original = file.fileName.replace(/(\.vue)\.[cm]?[jt]sx?$/, '$1');
    return closure.has(path.resolve(original));
  });
  // 诊断门禁仍覆盖完整静态闭包；只把公开声明实际引用的文件送入emit。
  for (const file of sources) {
    diagnostics.push(...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file));
  }
  const normalize = file => path.resolve(file.replace(/(\.vue)\.[cm]?[jt]sx?$/, '$1'));
  const sourceMap = new Map(sources.map(source => [normalize(source.fileName), source]));
  const legacyProgram = typeof vue.createProgram === 'function';
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
const errors = diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
if (!errors.length) finishInputTrace();
if (errors.length) {
  process.stdout.write(ts.formatDiagnostics(errors, formatHost));
  process.exitCode = 1;
}
`
}
