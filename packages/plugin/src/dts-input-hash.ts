/**
 * 同步声明首行记录来源/revision，仅为插件账本，不参与TS语义或业务JSDoc。
 * 忽略这条已知元数据行，避免上游ABI未变时仅因URL/版本注释刷新而重新编译。
 * 其余字节（含业务注释）保持原样；输出声明的分发摘要仍计算完整内容。
 */
export function typeInputBytes(file: string, bytes: Buffer): Buffer {
  const name = file.slice(Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1)
  const prefix = name === 'modules.d.ts' ? '// 自动生成：fulgurjs-federation 远程类型（remote:'
    : name === 'registry.d.ts' ? '// 自动生成：远程类型注册表（remote:' : undefined
  if (!prefix) return bytes
  const newline = bytes.indexOf(10)
  if (newline < 0 || !bytes.subarray(0, newline).toString('utf8').startsWith(prefix)) return bytes
  return bytes.subarray(newline + 1)
}
/** 纯函数无外部依赖，供隔离编译脚本复用同一输入摘要规则。 */
export function genTypeInputBytes(): string { return `const typeInputBytes = ${typeInputBytes.toString()};\n` }
