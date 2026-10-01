/**
 * BN01 故障注入：默认导出不是合法契约（缺 unmount 且 mount 非函数）。
 * 宿主加载本 expose 应得 MFU-015 占位，恢复（换 spec）后可重试。
 */
export default {
  mount: 'not-a-function',
}
