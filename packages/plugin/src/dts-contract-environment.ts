/**
 * 开发合同的独立 ambient 环境：按公开签名中的名字和模块引用选择声明。
 * 不把整个业务 tsconfig 的 .d.ts 列表作为 Program 根；模板专用全局组件登记
 * 不参与已擦除模板的合同检查。自定义实例增强、全局 DTO 和显式引用仍保留。
 */
import type * as TS from 'typescript'

export interface ContractAmbientSource { original: string; text: string }

/**
 * 只读声明索引，不解析被登记组件的业务实现。选择过程迭代至依赖稳定；
 * 用保守的标识符集合允许多选声明，避免按猜测丢失公开合同所需的全局类型。
 */
export function selectContractEnvironment(
  ts: typeof TS,
  candidates: string[],
  contracts: string[],
  read: (file: string) => string | undefined,
): Record<string, ContractAmbientSource> {
  const used = new Set<string>(), modules = new Set<string>(['vue', 'react'])
  const scan = (text: string): void => {
    const source = ts.createSourceFile('contract.ts', text, ts.ScriptTarget.Latest, false)
    const visit = (node: TS.Node): void => {
      if (ts.isIdentifier(node)) used.add(node.text)
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) modules.add(node.argument.literal.text)
      ts.forEachChild(node, visit)
    }
    // parent=false 时不能通过父节点定位模块引用。
    for (const statement of source.statements) if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) modules.add(statement.moduleSpecifier.text)
    visit(source)
  }
  for (const text of contracts) scan(text)
  const printer = ts.createPrinter({ removeComments: false })
  const entries = candidates.map(file => {
    const original = read(file)
    return original === undefined ? undefined : { file, original, source: ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true) }
  }).filter((entry): entry is NonNullable<typeof entry> => !!entry)
  const result: Record<string, ContractAmbientSource> = {}
  const moduleMatches = (name: string): boolean => [...modules].some(spec => name === spec
    || (name.includes('*') && spec.startsWith(name.slice(0, name.indexOf('*'))) && spec.endsWith(name.slice(name.indexOf('*') + 1))))
  for (;;) {
    let changed = false
    for (const entry of entries) {
      const { source } = entry
      const external = ts.isExternalModule(source)
      const choose = (statement: TS.Statement, inGlobal = true): TS.Statement | undefined => {
        if (ts.isModuleDeclaration(statement)) {
          const global = !!(statement.flags & ts.NodeFlags.GlobalAugmentation)
          const selected = global || (ts.isStringLiteral(statement.name) ? external || moduleMatches(statement.name.text) : used.has(statement.name.text))
          if (!selected || !statement.body || !ts.isModuleBlock(statement.body)) return undefined
          const body = statement.body.statements.map(s => choose(s, global || !ts.isStringLiteral(statement.name))).filter((s): s is TS.Statement => !!s)
          if (!body.length) return undefined
          return ts.factory.updateModuleDeclaration(statement, statement.modifiers, statement.name, ts.factory.updateModuleBlock(statement.body, body))
        }
        if (ts.isExportDeclaration(statement)) return inGlobal ? undefined : statement
        if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) return undefined
        const name = 'name' in statement ? (statement as TS.Statement & { name?: TS.Node }).name : undefined
        // GlobalComponents 仅用于模板标签解析；合同显式使用它时必须完整保留。
        if (ts.isInterfaceDeclaration(statement) && statement.name.text === 'GlobalComponents' && !used.has('GlobalComponents')) return undefined
        if (inGlobal) {
          if (ts.isVariableStatement(statement)) {
            const declarations = statement.declarationList.declarations.filter(d => ts.isIdentifier(d.name) && used.has(d.name.text))
            return declarations.length ? ts.factory.updateVariableStatement(statement, statement.modifiers, ts.factory.updateVariableDeclarationList(statement.declarationList, declarations)) : undefined
          }
          return name && ts.isIdentifier(name) && used.has(name.text) ? statement : undefined
        }
        // 被请求模块的导出和实例增强保留，间接依赖随后加入闭包。
        return statement
      }
      const selected = source.statements.map(s => choose(s)).filter((s): s is TS.Statement => !!s)
      if (!selected.length) continue
      const body = selected.map(s => printer.printNode(ts.EmitHint.Unspecified, s, source)).join('\n')
      const identifiers = new Set<string>()
      const visit = (node: TS.Node): void => { if (ts.isIdentifier(node)) identifiers.add(node.text); ts.forEachChild(node, visit) }
      selected.forEach(visit)
      const imports = source.statements.filter(ts.isImportDeclaration).map(statement => {
        const clause = statement.importClause
        if (!clause) return statement // 明确增强依赖，不能静默擦除。
        const name = clause.name && identifiers.has(clause.name.text) ? clause.name : undefined
        let bindings = clause.namedBindings
        if (bindings && ts.isNamedImports(bindings)) {
          const elements = bindings.elements.filter(e => identifiers.has(e.name.text))
          bindings = elements.length ? ts.factory.updateNamedImports(bindings, elements) : undefined
        } else if (bindings && !identifiers.has(bindings.name.text)) bindings = undefined
        return name || bindings ? ts.factory.updateImportDeclaration(statement, statement.modifiers,
          ts.factory.updateImportClause(clause, clause.isTypeOnly, name, bindings), statement.moduleSpecifier, statement.attributes) : undefined
      }).filter((s): s is TS.ImportDeclaration => !!s)
      const text = imports.map(s => printer.printNode(ts.EmitHint.Unspecified, s, source)).join('\n') + '\n' + body + (external ? '\nexport {};\n' : '\n')
      if (result[entry.file]?.text === text) continue
      result[entry.file] = { original: entry.original, text }
      scan(text)
      changed = true
    }
    if (!changed) break
  }
  return result
}
