// 慢模块真实异步求值：用于浏览器验证请求被后续 spec 切换淘汰。
await new Promise((resolve) => setTimeout(resolve, 600))
export const value = 'slow-A'
