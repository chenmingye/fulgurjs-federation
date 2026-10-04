/**
 * 演示场景元数据：端口表、各端 nanostores 声明版本、运行时注册远程用的入口地址表。
 * 声明版本必须与各工程 package.json 人工保持一致（remote-b 固定旧版本用于协商演示）。
 */
export const REMOTE_ENTRY_BASES: Record<string, string> = {
  'sh-remote-a': 'http://localhost:5343',
  'sh-remote-b': 'http://localhost:5345',
}

export interface DeclaredVersion {
  app: string
  port: number
  version: string
  note: string
}

/** 各端 package.json 声明的 nanostores 版本（展示用，人工同步自各 package.json） */
export const DECLARED_NANOSTORES_VERSIONS: DeclaredVersion[] = [
  { app: 'sh-host（宿主）', port: 5344, version: '0.11.4', note: '最新 0.x' },
  { app: 'sh-remote-a', port: 5343, version: '0.11.4', note: '与宿主相同' },
  { app: 'sh-remote-b', port: 5345, version: '0.6.0', note: '旧版本（协商演示）' },
]
