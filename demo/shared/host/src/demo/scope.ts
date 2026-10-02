/**
 * shareScopeMap 快照工具（演示卡片②）。
 *
 * ShareEntry.get 是函数、value 是模块命名空间——直接 JSON.stringify 会丢掉函数，
 * 且 value（如 vue 模块命名空间）可能包含循环引用导致 stringify 抛错。
 * 这里把注册表裁剪成纯协商元数据（from/version/loaded/eager/hasValue）再序列化。
 */
import type { ShareScopeMap } from '@fulgurjs/federation/runtime'

export interface ScopeSnapshot {
  [scope: string]: {
    [shareKey: string]: {
      [version: string]: {
        from: string
        loaded: boolean
        eager: boolean
        hasValue: boolean
      }
    }
  }
}

export function snapshotScopeMap(map: ShareScopeMap): ScopeSnapshot {
  const out: ScopeSnapshot = {}
  for (const [scopeName, names] of Object.entries(map)) {
    out[scopeName] = {}
    for (const [shareKey, versions] of Object.entries(names)) {
      out[scopeName][shareKey] = {}
      for (const [version, entry] of Object.entries(versions)) {
        out[scopeName][shareKey][version] = {
          from: entry.from,
          loaded: !!entry.loaded,
          eager: !!entry.eager,
          hasValue: entry.value !== undefined,
        }
      }
    }
  }
  return out
}

export function formatScope(map: ShareScopeMap): string {
  return JSON.stringify(snapshotScopeMap(map), null, 2)
}
