/**
 * 卡 4 故障注入：模块顶层 throw——模块求值期即失败，宿主 loadRemote 的
 * container.get() 拒绝（错误被运行时包装为 MFU-001，底层原因保留原始 throw），
 * remoteComponent 据此进默认错误占位（含「重试加载 / 刷新页面重试」）。
 *
 * 用 if 包裹而非裸 throw：语义等价（模块求值必然抛出），且不产生
 * 「不可达代码」的编译期噪音。
 */
const INJECT_FAIL = true

if (INJECT_FAIL) {
  throw new Error('module-error 故障注入：模块顶层 throw（err-good，demo/errors 卡 4）')
}

export {}
