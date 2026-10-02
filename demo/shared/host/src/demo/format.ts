/** 错误展示工具：优先带出 fulgurjs 统一错误码（如 MFU-003 / MFU-008） */
export function formatError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null
  const msg = e?.message ?? String(err)
  return e?.code ? `[${e.code}] ${msg}` : msg
}

/** 领域错误摘要：卡片展示 code + name + 完整 message（三段式文案） */
export function errorSummary(err: unknown): { code: string; name: string; message: string } {
  const e = err as { code?: string; name?: string; message?: string } | null
  return {
    code: e?.code ?? '（无错误码）',
    name: e?.name ?? 'Error',
    message: e?.message ?? String(err),
  }
}
