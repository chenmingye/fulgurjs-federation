/**
 * WP5：dev 跨源访问策略（devCorsOrigins 选项的纯函数面）。
 *
 * 背景：跨 dev-server 协作需要 CORS；此前插件端点（@fulgurjs-entry.js / manifest）硬编码
 * Access-Control-Allow-Origin: *。devCorsOrigins 把同一来源策略应用到插件端点与
 * server.cors（用户显式配置的 server.cors 永远优先）。
 */
export type DevCorsOrigins = string[] | '*' | undefined

/** 校验并归一 devCorsOrigins：'*' 原样；数组须非空且每项是 http(s) 来源（无路径） */
export function normalizeDevCorsOrigins(input: DevCorsOrigins): { ok: true; value: DevCorsOrigins } | { ok: false; reason: string } {
  if (input === undefined || input === '*') return { ok: true, value: input }
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, reason: '必须是 "*" 或非空数组' }
  }
  for (const item of input) {
    if (typeof item !== 'string' || !/^https?:\/\/[^/]+$/i.test(item)) {
      return { ok: false, reason: `来源必须是 http(s)://host[:port] 形态（无路径），got: ${JSON.stringify(item)}` }
    }
  }
  return { ok: true, value: input }
}

/** 插件端点的 CORS 响应头：'*' 保持现状；数组按 Origin 反射匹配（不匹配则省略头=浏览器拒绝跨源读） */
export function corsHeadersFor(origin: string | undefined, allowed: DevCorsOrigins): Record<string, string> {
  if (allowed === undefined || allowed === '*') {
    return { 'Access-Control-Allow-Origin': '*' }
  }
  if (!origin || !allowed.includes(origin)) return {}
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
}

/** 是否非 loopback 监听（通配 CORS / fsRoot 暴露的告警判据；host 未配置视为 loopback） */
export function isNonLoopbackHost(host: string | boolean | undefined): boolean {
  if (host === undefined || host === false) return false
  const h = host === true ? '0.0.0.0' : String(host)
  return !['localhost', '127.0.0.1', '::1', '[::1]'].includes(h.toLowerCase())
}
