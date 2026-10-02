/**
 * 卡 6 故障注入：默认导出不是合法桥接契约（缺函数类型的 mount/unmount）。
 * 宿主 createVueBridgeApp 挂载本 expose 时得到 MFU-015 默认占位；
 * 恢复（切换 err-good/bridge-good）后同页重建挂载。
 * 注入手法与 fixtures/remote-react/src/bridge-broken.tsx（BN01）一致。
 */
export default {}
