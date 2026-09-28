/** 慢加载模块：顶层 await 延迟 300ms（N04 适配层 timeout 的真实慢源） */
await new Promise((r) => setTimeout(r, 300))

export default function SlowPayload() {
  return <p data-testid="slow-payload-ok">slow payload ready</p>
}
