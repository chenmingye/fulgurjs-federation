/**
 * 为提供 createProgram 的 vue-tsc 生成隔离进程脚本。
 *
 * 使用提供方自己的官方 SFC 类型映射；只对公开声明闭包请求诊断和 emit。
 * CLI 的全程序检查会额外检查运行时动态装配的全部业务页面，既耗时，也会让
 * 某些工具版本的增量诊断失去文件位置。这里不改源码、不抹掉类型、不改编译器。
 */
export function genVueDeclarationProgram(): string {
  return String.raw`
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const ts = req('typescript');
const vue = req('vue-tsc');
const configFile = process.argv[1];
const closure = new Set(JSON.parse(process.argv[2]).map(file => path.resolve(file)));
const raw = ts.readConfigFile(configFile, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, path.dirname(configFile), undefined, configFile, undefined, [
  { extension: '.vue', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred },
]);
// 不把 Vue 的映射后诊断序列化到 TS buildinfo；有损的位置不能用于闭包门禁。
parsed.options.incremental = false;
delete parsed.options.tsBuildInfoFile;
const formatHost = {
  getCurrentDirectory: () => process.cwd(),
  getCanonicalFileName: file => file,
  getNewLine: () => '\n',
};
const diagnostics = [...(raw.error ? [raw.error] : []), ...parsed.errors];
if (!diagnostics.length) {
  const program = vue.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host: ts.createCompilerHost(parsed.options),
  });
  diagnostics.push(...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics());
  const sources = program.getSourceFiles().filter(file => {
    const original = file.fileName.replace(/(\.vue)\.[cm]?[jt]sx?$/, '$1');
    return closure.has(path.resolve(original));
  });
  for (const file of sources) {
    diagnostics.push(...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file));
    if (!file.isDeclarationFile) {
      // 官方 emit 保留真实 props、重载和推导结果，绝不以手写接口或 any 代替。
      const emitted = program.emit(file, undefined, undefined, true);
      diagnostics.push(...emitted.diagnostics);
      if (emitted.emitSkipped) diagnostics.push({
        category: ts.DiagnosticCategory.Error, code: 90001,
        messageText: '暴露模块声明 emit 被编译器跳过：' + file.fileName,
      });
    }
  }
}
const errors = diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
if (errors.length) {
  process.stdout.write(ts.formatDiagnostics(errors, formatHost));
  process.exitCode = 1;
}
`
}
