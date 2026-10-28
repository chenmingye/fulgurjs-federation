/**
 * 类型输入通常位于较深的pnpm目录。优先使用Node原生真实路径解析，避免反复在JS中
 * 遍历全部祖先；原生实现不可用（例如部分容器环境）时保留标准解析路径。
 * 不缓存结果，链接替换仍由每次调用和发布前校验观察。
 */
import fs from 'node:fs'

interface PathReader {
  realpathSync: ((file: string) => string) & { native?: (file: string) => string }
}

// 无外部闭包，生成的编译子进程使用同一实现，避免两套链接语义漂移。
export function readRealPath(reader: PathReader, file: string, platform = process.platform): string {
  // 与TypeScript主机一致：Windows长路径走标准实现，避免原生路径前缀与模块身份不一致。
  if (reader.realpathSync.native && !(platform === 'win32' && file.length >= 260)) {
    try { return reader.realpathSync.native(file) } catch { /* 标准实现决定最终错误 */ }
  }
  return reader.realpathSync(file)
}

export const realPath = (file: string): string => readRealPath(fs, file)
export const genTypeRealpath = (): string => `const realpath = (${readRealPath.toString()}).bind(null, fs);`
