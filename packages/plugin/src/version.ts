/**
 * 版本只取package.json这一处；命名转出让构建器仅保留version字符串，
 * 不把整份包元数据带入浏览器。体积门禁与运行时同源回归共同验证产物。
 */
export { version as RUNTIME_VERSION } from '../package.json'
