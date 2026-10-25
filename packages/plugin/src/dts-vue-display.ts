/**
 * 给具体 Vue SFC 声明保留一个可读的组件名称。
 * 接口继承原组件的全部签名，而不是重建 props/slots/实例，避免 tooltip 优化丢失能力。
 * 泛型函数组件等非具体 DefineComponent 声明原样保留；不猜测或压平其类型。
 */
import type * as TS from 'typescript'

export function nameVueDeclaration(ts: typeof TS, text: string, expose: string): string {
  const source = ts.createSourceFile('component.d.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const assignment = source.statements.find((s): s is TS.ExportAssignment => ts.isExportAssignment(s) && !s.isExportEquals)
  if (!assignment || !ts.isIdentifier(assignment.expression)) return text
  const declarations = new Map<string, TS.VariableDeclaration>()
  const identifiers = new Set<string>()
  const visit = (node: TS.Node) => {
    if (ts.isIdentifier(node)) identifiers.add(node.text)
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  let declaration = declarations.get(assignment.expression.text)
  const seen = new Set<string>()
  while (declaration?.type && ts.isTypeQueryNode(declaration.type) && ts.isIdentifier(declaration.type.exprName)) {
    const name = declaration.type.exprName.text
    if (seen.has(name)) return text
    seen.add(name)
    declaration = declarations.get(name)
  }
  const type = declaration?.type
  if (!type || !ts.isImportTypeNode(type) || type.qualifier?.getText(source) !== 'DefineComponent'
      || !ts.isLiteralTypeNode(type.argument) || !ts.isStringLiteral(type.argument.literal)
      || type.argument.literal.text !== 'vue' || type.typeArguments?.[0]?.kind === ts.SyntaxKind.AnyKeyword) return text

  const unique = (candidate: string) => {
    let name = candidate
    for (let n = 2; identifiers.has(name); n++) name = `${candidate}${n}`
    identifiers.add(name)
    return name
  }
  const stem = expose.replace(/^\.\//, '').split(/[^a-zA-Z0-9_$]+/).filter(Boolean)
    .map(part => part[0]!.toUpperCase() + part.slice(1)).join('') || 'RemoteComponent'
  const component = unique(/^[a-zA-Z_$]/.test(stem) ? stem : `Remote${stem}`)
  const original = unique('__FgOriginalComponent')
  const value = unique('__fgNamedComponent')
  // 仅用于提示的 props 摘要；真实检查继续来自完整原始类型，不从该文本重建合同。
  const propsNode = type.typeArguments?.[0]
  let summaryNode: TS.TypeNode | undefined = propsNode
  if (propsNode && ts.isTypeReferenceNode(propsNode) && ts.isIdentifier(propsNode.typeName)) {
    const name = propsNode.typeName.text
    const alias = source.statements.find((s): s is TS.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === name)
    if (alias) summaryNode = alias.type
  }
  const summary = summaryNode
    ? ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, summaryNode, source)
      .replace(/\r?\n\s*/g, ' ').trim().slice(0, 600)
    : '{}'
  const doc = `/** 远程 Vue 组件 ${component}。\n * Props: ${summary.replace(/\*\//g, '* /')}\n * 完整组件签名继承原声明；嵌套字段请查看对应 props 类型。\n */`
  const replacement = `type ${original} = typeof ${assignment.expression.text};\n${doc}\ninterface ${component} extends ${original} {}\n${doc}\ndeclare const ${value}: ${component};\nexport default ${value};`
  return text.slice(0, assignment.getStart(source)) + replacement + text.slice(assignment.end)
}
