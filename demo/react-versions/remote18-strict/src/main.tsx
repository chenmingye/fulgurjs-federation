import bridge from './bridge'
// 独立入口使用同一挂载契约，避免另外创建未使用的 root。
bridge.mount(document.getElementById('root')!, {})
