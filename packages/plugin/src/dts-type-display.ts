/**
 * 在公开声明中生成可展开的数据合同视图；业务消费方仍直接 import type。
 * 用提供方自己的 TypeChecker 确认对象形态，原始声明和组件签名不改。
 * 可调用/可构造、泛型、数组/元组、类品牌和多态 this 等类型保持原样。
 */
import path from 'node:path'
import type * as TS from 'typescript'

type TsModule = typeof TS

export function displayPublicDataTypes(
  ts: TsModule,
  files: Map<string, string>,
  entries: Iterable<string>,
  root: string,
  compilerOptions: TS.CompilerOptions = {},
): void {
  const base = path.join(root, '.fulgurjs-types-display')
  const paths = new Map([...files].map(([rel, text]) => [path.resolve(base, rel), text]))
  const entryPaths = [...new Set(entries)].map(rel => path.resolve(base, rel))
  // 默认组件/普通值导出不需要额外的类型分析。
  const needsDisplay = entryPaths.filter(file => {
    const source = ts.createSourceFile(file, paths.get(file)!, ts.ScriptTarget.Latest, true)
    return source.statements.some(s => (ts.isExportDeclaration(s)
      && (!s.exportClause || (ts.isNamedExports(s.exportClause) && s.exportClause.elements.length > 0)))
      || ((ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s))
        && s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)))
  })
  if (needsDisplay.length === 0) return
  const options: TS.CompilerOptions = {
    ...compilerOptions, noEmit: true,
    target: compilerOptions.target ?? ts.ScriptTarget.ESNext,
    module: compilerOptions.module ?? ts.ModuleKind.ESNext,
    moduleResolution: compilerOptions.moduleResolution ?? ts.ModuleResolutionKind.Bundler ?? ts.ModuleResolutionKind.NodeJs,
    skipLibCheck: true, types: [], allowArbitraryExtensions: true,
  }
  const directories = new Set<string>()
  for (const file of paths.keys()) {
    for (let dir = path.dirname(file); dir.startsWith(base); dir = path.dirname(dir)) directories.add(dir)
  }
  const host = ts.createCompilerHost(options, true)
  const readFile = (file: string): string | undefined => paths.get(path.resolve(file)) ?? ts.sys.readFile(file)
  host.readFile = readFile
  host.fileExists = file => paths.has(path.resolve(file)) || ts.sys.fileExists(file)
  host.directoryExists = dir => directories.has(path.resolve(dir)) || (ts.sys.directoryExists?.(dir) ?? false)
  host.realpath = file => paths.has(path.resolve(file)) ? file : (ts.sys.realpath?.(file) ?? file)
  host.getCurrentDirectory = () => root
  host.getSourceFile = (file, languageVersion) => {
    const text = readFile(file)
    return text === undefined ? undefined : ts.createSourceFile(file, text, languageVersion, true)
  }
  const program = ts.createProgram(needsDisplay, options, host)
  const checker = program.getTypeChecker()

  const plainData = (symbol: TS.Symbol): boolean => {
    if (!(symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias))
      || symbol.flags & (ts.SymbolFlags.Value | ts.SymbolFlags.Namespace)) return false
    if (symbol.declarations?.some(d => (ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d)) && d.typeParameters?.length)) return false
    const type = checker.getDeclaredTypeOfSymbol(symbol)
    if (!(type.flags & ts.TypeFlags.Object) || type.getCallSignatures().length || type.getConstructSignatures().length
      || checker.isArrayType(type) || checker.isTupleType(type)) return false
    const hasThis = (node: TS.Node): boolean => ts.isThisTypeNode(node) || (ts.forEachChild(node, hasThis) ?? false)
    const visited = new Set<TS.Type>()
    const specialBase = (value: TS.Type): boolean => {
      if (visited.has(value)) return false
      visited.add(value)
      if (!(value.flags & ts.TypeFlags.Object)) return true
      const object = value as TS.ObjectType
      const target = (object as TS.TypeReference).target ?? object
      if ((object.objectFlags | target.objectFlags) & ts.ObjectFlags.Class) return true
      if (value.symbol?.declarations?.some(hasThis)) return true
      // 无法确认的祖先不能猜成普通数据对象，例如未进入类型包的环境声明。
      if (value.symbol?.declarations?.some(d => ts.isInterfaceDeclaration(d)
        && d.heritageClauses?.some(clause => clause.types.some(base =>
          checker.getTypeAtLocation(base).flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter))))) return true
      return !!((object.objectFlags & ts.ObjectFlags.Interface)
        && checker.getBaseTypes(object as TS.InterfaceType)?.some(specialBase))
    }
    if (specialBase(type)) return false
    const properties = type.getProperties()
    if (properties.length === 0) return false
    return properties.every(property => !property.name.startsWith('__@') && property.declarations?.every(d =>
      !hasThis(d) && !ts.isMethodSignature(d) && !ts.isMethodDeclaration(d)
      && !ts.isGetAccessorDeclaration(d) && !ts.isSetAccessorDeclaration(d)
      && !(ts.getCombinedModifierFlags(d as TS.Declaration) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected))
      && !('name' in d && d.name && ts.isPrivateIdentifier(d.name as TS.Node))))
  }

  for (const file of needsDisplay) {
    const source = program.getSourceFile(file)
    const moduleSymbol = source && checker.getSymbolAtLocation(source)
    if (!source || !moduleSymbol) continue
    const original = paths.get(file)!
    const identifiers = new Set<string>()
    const collect = (node: TS.Node): void => { if (ts.isIdentifier(node)) identifiers.add(node.text); ts.forEachChild(node, collect) }
    collect(source)
    const unique = (stem: string): string => {
      let name = stem
      for (let n = 2; identifiers.has(name); n++) name = `${stem}${n}`
      identifiers.add(name)
      return name
    }
    const views: Array<{ name: string; expression: string; doc: string }> = []
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const name = exported.name
      if (name === 'default' || !/^[$_\p{ID_Start}][$_\p{ID_Continue}]*$/u.test(name)) continue
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      if (!plainData(target)) continue
      let expression: string | undefined
      for (const statement of source.statements) {
        if ((ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.name.text === name && checker.getSymbolAtLocation(statement.name) === target) {
          expression = name
          break
        }
        if (!ts.isExportDeclaration(statement)) continue
        // 不丢失 resolution-mode 等导入/导出属性；这类合同保留原声明。
        if (statement.attributes || statement.assertClause) continue
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          const member = statement.exportClause.elements.find(e => e.name.text === name)
          if (member) {
            const local = member.propertyName ?? member.name
            if (!ts.isIdentifier(local)) break
            expression = statement.moduleSpecifier
              ? `import(${statement.moduleSpecifier.getText(source)}).${local.text}` : local.text
            break
          }
        } else if (!statement.exportClause && statement.moduleSpecifier) {
          const from = checker.getSymbolAtLocation(statement.moduleSpecifier)
          if (from && checker.getExportsOfModule(from).some(e => e.name === name)) {
            expression = `import(${statement.moduleSpecifier.getText(source)}).${name}`
            break
          }
        }
      }
      if (!expression) continue
      const docs = exported.getDocumentationComment(checker)
      const description = ts.displayPartsToString(docs.length ? docs : target.getDocumentationComment(checker))
      const tags = target.getJsDocTags(checker).map(tag => `@${tag.name}${tag.text ? ` ${ts.displayPartsToString(tag.text)}` : ''}`)
      views.push({ name, expression, doc: [description, ...tags].filter(Boolean).join('\n').replace(/\*\//g, '* /') })
    }
    if (views.length === 0) continue
    const names = new Set(views.map(view => view.name))
    const edits: Array<{ start: number; end: number; text: string }> = []
    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const remaining = statement.exportClause.elements.filter(e => !names.has(e.name.text))
        if (remaining.length === statement.exportClause.elements.length) continue
        edits.push(remaining.length
          ? { start: statement.exportClause.getStart(source), end: statement.exportClause.end,
            text: `{ ${remaining.map(e => e.getText(source)).join(', ')} }` }
          : { start: statement.getStart(source), end: statement.end, text: '' })
      } else if ((ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && names.has(statement.name.text)
        && !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) {
        const modifier = statement.modifiers?.find(m => m.kind === ts.SyntaxKind.ExportKeyword)
        if (modifier) edits.push({ start: modifier.getStart(source), end: modifier.end, text: '' })
      }
    }
    let output = original
    for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end)
    const display = unique('__FgDataView')
    output += `\n// 自动生成的字段视图；原合同及组件签名保留，消费方无需自行映射。\ntype ${display}<T> = { [K in keyof T]: T[K] } & {};\n`
    for (const view of views.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const alias = unique(`__FgData_${view.name}`)
      if (view.doc) output += `/**\n${view.doc.split('\n').map(line => ` * ${line}`).join('\n')}\n */\n`
      output += `type ${alias} = ${display}<${view.expression}>;\nexport type { ${alias} as ${view.name} };\n`
    }
    files.set(path.relative(base, file).split(path.sep).join('/'), output)
  }
}
