/** 声明编译失败只展示公开闭包内的完整诊断，避免业务错误的续行挤掉真正文件位置。 */
import path from 'node:path'

export function formatDeclarationDiagnostics(
  stdout: string, stderr: string, fallback: string, root: string, closure: Set<string>,
): string {
  const groups: string[][] = []
  let current: string[] | undefined
  // 即使调用方环境强制颜色，也保持文件路径可识别。
  const clean = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '')
  for (const line of clean(`${stdout}\n${stderr}`).split(/\r?\n/)) {
    const file = line.match(/^(.+)\(\d+,\d+\): error TS\d+:/)
    const global = /^(?:error )?TS\d+:/.test(line)
    if (file || global) {
      current = global || (file && closure.has(path.resolve(root, file[1]!.trim()))) ? [line] : undefined
      if (current) groups.push(current)
    } else if (current && line.trim()) {
      current.push(line)
    }
  }
  if (!groups.length) return clean(stderr || stdout || fallback).split(/\r?\n/).slice(0, 40).join('\n')
  // 每项保留定位行；只截自己的长详情，不截到最后一堆无文件名的续行。
  const shown = groups.slice(0, 5).flatMap(group => group.slice(0, 8))
  if (groups.length > 5) shown.push(`另有 ${groups.length - 5} 项公开声明诊断，请运行提供方类型检查查看。`)
  return shown.join('\n')
}
