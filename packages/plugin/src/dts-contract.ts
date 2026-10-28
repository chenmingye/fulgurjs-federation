/**
 * 公开合同投影：仅供开发期类型分发，不替代业务实现检查。
 *
 * TS/TSX 使用提供方 TypeScript 的 isolatedDeclarations 诊断裁决；不能独立生成
 * 精确声明时保留原源码。Vue 只处理显式、非泛型的 script-setup 参数/事件合同，
 * 声明仍由官方 Vue Program 生成；expose/model/slots/选项式组件等走原路径。
 * 投影只存在于编译器读取视图，不写源码、不改变 Vite 的运行时代码。
 */
import type * as TS from 'typescript'

/** 父进程和隔离 Vue 编译进程使用同一实现，避免两次建立不同的依赖图。 */
export function genContractProjection(): string {
  return String.raw`
function projectContract(file, text) {
  if (typeof text !== 'string' || /(?:^|[/\\])node_modules(?:[/\\]|$)/.test(file)
      || /\.d\.[cm]?ts$/.test(file)) return text;
  if (/\.[cm]?tsx?$/.test(file)) {
    if (typeof ts.transpileDeclaration !== 'function') return text;
    try {
      const result = ts.transpileDeclaration(text, { fileName: file, reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, removeComments: false } });
      return result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error) ? text : result.outputText;
    } catch { return text; }
  }
  if (!file.endsWith('.vue') || !parseVue) return text;
  try {
    const parsed = parseVue(text);
    if (parsed.errors?.length) return text;
    const d = parsed.descriptor;
    const setup = d.scriptSetup;
    if (!setup || setup.lang !== 'ts' || setup.src || setup.attrs.generic || d.script?.src
        || (d.script && d.script.lang !== 'ts') || d.template?.lang || d.template?.src
        || d.customBlocks?.length || d.styles?.some(s=>s.module)
        || /<\/?slot\b|\bv-slot\b/.test(d.template?.content || '')) return text;
    const read = source => ts.createSourceFile(file + '.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const main = d.script ? read(d.script.content) : undefined;
    const source = read(setup.content);
    const unsupported = new Set(['defineExpose','defineSlots','defineModel','defineOptions']);
    let unsafe = false;
    const scan = node => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && unsupported.has(node.expression.text)) unsafe = true;
      if (ts.isIdentifier(node) && ['defineProps','defineEmits','withDefaults'].includes(node.text)
          && (ts.isVariableDeclaration(node.parent) || ts.isFunctionDeclaration(node.parent)
            || ts.isParameter(node.parent) || ts.isImportSpecifier(node.parent))) unsafe = true;
      ts.forEachChild(node, scan);
    };
    scan(source);
    if (source.statements.some(s => ts.isModuleDeclaration(s)
        || (s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)
          && !ts.isInterfaceDeclaration(s) && !ts.isTypeAliasDeclaration(s)))) unsafe = true;
    if (unsafe || source.parseDiagnostics.length || main?.parseDiagnostics.length) return text;
    const typeStatement = s => ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)
      || ts.isImportDeclaration(s) || (ts.isExportDeclaration(s) && (s.isTypeOnly
        || (s.exportClause && ts.isNamedExports(s.exportClause) && s.exportClause.elements.every(e=>e.isTypeOnly))));
    // 普通 script 的值导出/默认选项可能改变组件公共实例，不猜测其合同。
    if (main?.statements.some(s => !typeStatement(s) && !ts.isEmptyStatement(s))) return text;
    const safeDefault = node => {
      if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || [ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind)) return true;
      if (ts.isPrefixUnaryExpression(node)) return safeDefault(node.operand);
      if (ts.isArrayLiteralExpression(node)) return node.elements.every(safeDefault);
      if (ts.isObjectLiteralExpression(node)) return node.properties.every(p=>ts.isPropertyAssignment(p)
        && !ts.isComputedPropertyName(p.name) && safeDefault(p.initializer));
      return ts.isIdentifier(node) && node.text === 'undefined';
    };
    const macro = call => {
      if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return false;
      const name = call.expression.text;
      if (name === 'defineProps' || name === 'defineEmits') return call.typeArguments?.length === 1 && call.arguments.length === 0;
      return name === 'withDefaults' && call.arguments.length === 2
        && macro(call.arguments[0]) && call.arguments[0].expression.text === 'defineProps' && safeDefault(call.arguments[1]);
    };
    const keep = [];
    for (const s of source.statements) {
      if (typeStatement(s)) { keep.push(s); continue; }
      if (ts.isExpressionStatement(s) && macro(s.expression)) { keep.push(s); continue; }
      if (ts.isVariableStatement(s) && s.declarationList.declarations.length === 1) {
        const v = s.declarationList.declarations[0];
        if (ts.isIdentifier(v.name) && v.initializer && macro(v.initializer)) keep.push(s);
      }
    }
    const macroCount = nodes => {
      let count = 0;
      const visit = n => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)
            && ['defineProps','defineEmits','withDefaults'].includes(n.expression.text)) count++;
        ts.forEachChild(n,visit);
      };
      for (const n of nodes) visit(n);
      return count;
    };
    // 一个宏不能被投影，整份SFC回退；不能只留下emits却丢掉运行时props/解构默认值。
    if (macroCount(source.statements) !== macroCount(keep)) return text;
    // 没有可证明的显式宏合同就使用官方完整路径，包括运行时 props。
    if (!keep.some(s => !ts.isImportDeclaration(s) && !ts.isInterfaceDeclaration(s) && !ts.isTypeAliasDeclaration(s))) return text;
    // 类型依赖仍完整保留；只剔除从未用于合同的值/类型导入。
    const used = new Set();
    const identifiers = node => { if (ts.isIdentifier(node)) used.add(node.text); ts.forEachChild(node, identifiers); };
    for (const s of keep) if (!ts.isImportDeclaration(s)) identifiers(s);
    if (main) for (const s of main.statements) if (!ts.isImportDeclaration(s)) identifiers(s);
    const printer = ts.createPrinter({ removeComments: false });
    const render = (statements, sf) => statements.map(s => {
      if (!ts.isImportDeclaration(s)) return printer.printNode(ts.EmitHint.Unspecified, s, sf);
      const clause = s.importClause;
      // 显式副作用导入可能提供全局/模块增强，是合同的一部分，不能因没有绑定名而删除。
      if (!clause) return printer.printNode(ts.EmitHint.Unspecified,s,sf);
      const defaultName = clause.name && used.has(clause.name.text) ? clause.name : undefined;
      let bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        const elements = bindings.elements.filter(e=>used.has(e.name.text));
        bindings = elements.length ? ts.factory.updateNamedImports(bindings,
          elements.map(e=>ts.factory.updateImportSpecifier(e,false,e.propertyName,e.name))) : undefined;
      } else if (bindings && !used.has(bindings.name.text)) bindings=undefined;
      if (!defaultName && !bindings) return '';
      const next = ts.factory.updateImportDeclaration(s,s.modifiers,
        ts.factory.updateImportClause(clause,true,defaultName,bindings),s.moduleSpecifier,s.attributes);
      return printer.printNode(ts.EmitHint.Unspecified,next,sf);
    }).join('\n');
    const replacements = [{start:setup.loc.start.offset,end:setup.loc.end.offset,text:render(keep,source)}];
    if (main) replacements.push({start:d.script.loc.start.offset,end:d.script.loc.end.offset,text:render([...main.statements],main)});
    if (d.template) replacements.push({start:d.template.loc.start.offset,end:d.template.loc.end.offset,text:''});
    let result=text;
    for (const edit of replacements.sort((a,b)=>b.start-a.start)) result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
    return result;
  } catch { return text; }
}
`
}

export function createContractProjection(ts: typeof TS, parseVue?: (text: string) => unknown): (file: string, text: string | undefined) => string | undefined {
  return new Function('ts', 'parseVue', `${genContractProjection()}; return projectContract;`)(ts, parseVue)
}
