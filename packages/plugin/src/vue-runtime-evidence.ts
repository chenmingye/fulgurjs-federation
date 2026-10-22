import MagicString from 'magic-string'

interface ParsedNode {
  type: string
  start: number
  end: number
  source?: { value: unknown }
  specifiers?: Array<{ type: string; imported?: { name?: string }; local: { name: string } }>
  declaration?: { type: string; start: number; end: number }
}

/**
 * Attach non-enumerable evidence from a compiled SFC's actual Vue binding.
 * No new Vue import, shared lookup, evaluation or component wrapper is introduced.
 * Unsupported syntax/bindings remain unknown rather than inferring identity from a global scope.
 */
export function tagVueRuntime(code: string, parse: (code: string) => unknown) {
  if (code.includes('fulgurjs.vue-runtime')) return null
  let body: ParsedNode[]
  try { body = (parse(code) as { body: ParsedNode[] }).body } catch { return null }
  const supported = new Set(['ref', 'openBlock', 'createVNode', 'createElementVNode', 'defineComponent', 'h'])
  const binding = body.flatMap(node => {
    const source = node.source?.value
    if (node.type !== 'ImportDeclaration' || typeof source !== 'string' ||
      !(source === 'vue' || (source.startsWith('virtual:fulgurjs-') && source.includes('vue')))) return []
    return (node.specifiers ?? []).filter(s => s.type === 'ImportSpecifier' && supported.has(s.imported?.name ?? ''))
  })[0]
  const declaration = body.find(n => n.type === 'ExportDefaultDeclaration')?.declaration
  if (!binding || !declaration || declaration.type.endsWith('Declaration')) return null
  const s = new MagicString(code)
  // The pure call keeps unused SFC modules tree-shakeable; the original component identity is kept.
  const before = '/*#__PURE__*/((c)=>{if(c&&Object.isExtensible(c)&&!Object.hasOwn(c,Symbol.for("fulgurjs.vue-runtime")))Object.defineProperty(c,Symbol.for("fulgurjs.vue-runtime"),{value:{key:' +
    JSON.stringify(binding.imported!.name) + ',value:' + binding.local.name + '}});return c})('
  s.appendLeft(declaration.start, before)
  s.appendRight(declaration.end, ')')
  return { code: s.toString(), map: s.generateMap({ hires: true }) }
}
