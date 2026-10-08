import type { GlobEnvConfig } from '/#/config';

import { warn } from '/@/utils/log';
import pkg from '../../package.json';
import { getConfigFileName } from '../../build/getConfigFileName';
import { getGlobal } from "@/qiankun/micro";

// 子应用环境快照兜底（跨框架宿主支持）：_app.config.js 只在本实例独立 index.html
// 加载；作为桥接子应用在非 Jeecg 宿主页（如 react-host）内初始化时，window 上没有
// 本实例的 __PRODUCTION__<SHORT_NAME>__CONF__ 全局，getAppEnvConfig() 解构即抛错。
// 守卫必须放在本模块顶层（本模块是全部调用方的依赖，求值先于任何 getAppEnvConfig
// 调用）：全局缺失时用构建期 .env 内联的同源快照补齐；宿主页面自己加载过
// _app.config.js 时以宿主侧为准，兜底不生效。dev 构建直接读 import.meta.env，无需兜底。
const __bridgeEnvName = getConfigFileName(import.meta.env);
const __bridgeGlobal = getGlobal() as unknown as Record<string, unknown>;
if (import.meta.env.PROD && __bridgeGlobal[__bridgeEnvName] === undefined) {
  __bridgeGlobal[__bridgeEnvName] = {
    VITE_GLOB_APP_TITLE: import.meta.env.VITE_GLOB_APP_TITLE,
    VITE_GLOB_API_URL: import.meta.env.VITE_GLOB_API_URL,
    VITE_USE_MOCK: import.meta.env.VITE_USE_MOCK,
    VITE_GLOB_APP_SHORT_NAME: import.meta.env.VITE_GLOB_APP_SHORT_NAME,
    VITE_GLOB_API_URL_PREFIX: import.meta.env.VITE_GLOB_API_URL_PREFIX,
    VITE_GLOB_APP_OPEN_SSO: import.meta.env.VITE_GLOB_APP_OPEN_SSO,
    VITE_GLOB_APP_OPEN_QIANKUN: import.meta.env.VITE_GLOB_APP_OPEN_QIANKUN,
    VITE_GLOB_APP_CAS_BASE_URL: import.meta.env.VITE_GLOB_APP_CAS_BASE_URL,
    VITE_GLOB_DOMAIN_URL: import.meta.env.VITE_GLOB_DOMAIN_URL,
    VITE_GLOB_ONLINE_VIEW_URL: import.meta.env.VITE_GLOB_ONLINE_VIEW_URL,
    VITE_GLOB_HIDE_LAYOUT_TYPES: import.meta.env.VITE_GLOB_HIDE_LAYOUT_TYPES,
    VITE_GLOB_RUN_PLATFORM: import.meta.env.VITE_GLOB_RUN_PLATFORM,
    VITE_GLOB_QIANKUN_MICRO_APP_NAME: import.meta.env.VITE_GLOB_QIANKUN_MICRO_APP_NAME,
    VITE_GLOB_QIANKUN_MICRO_APP_ENTRY: import.meta.env.VITE_GLOB_QIANKUN_MICRO_APP_ENTRY,
    VITE_GLOB_ONLINE_DOCUMENT_VERSION: import.meta.env.VITE_GLOB_ONLINE_DOCUMENT_VERSION,
  };
}

export function getCommonStoragePrefix() {
  const { VITE_GLOB_APP_SHORT_NAME } = getAppEnvConfig();
  return `${VITE_GLOB_APP_SHORT_NAME}__${getEnv()}`.toUpperCase();
}

// Generate cache key according to version
export function getStorageShortName() {
  return `${getCommonStoragePrefix()}${`__${pkg.version}`}__`.toUpperCase();
}

export function getAppEnvConfig() {
  const ENV_NAME = getConfigFileName(import.meta.env);

  const global = getGlobal();

  const ENV = (import.meta.env.DEV
    ? // Get the global configuration (the configuration will be extracted independently when packaging)
      (import.meta.env as unknown as GlobEnvConfig)
    : global[ENV_NAME as any]) as unknown as GlobEnvConfig;

  const {
    VITE_GLOB_APP_TITLE,
    VITE_GLOB_API_URL,
    VITE_USE_MOCK,
    VITE_GLOB_APP_SHORT_NAME,
    VITE_GLOB_API_URL_PREFIX,
    VITE_GLOB_APP_OPEN_SSO,
    VITE_GLOB_APP_OPEN_QIANKUN,
    VITE_GLOB_APP_CAS_BASE_URL,
    VITE_GLOB_DOMAIN_URL,
    VITE_GLOB_ONLINE_VIEW_URL,
    // 全局隐藏哪些布局，多个用逗号隔开
    VITE_GLOB_HIDE_LAYOUT_TYPES,
    // 当前运行在什么平台
    VITE_GLOB_RUN_PLATFORM,

    // 【JEECG作为乾坤子应用】
    VITE_GLOB_QIANKUN_MICRO_APP_NAME,
    VITE_GLOB_QIANKUN_MICRO_APP_ENTRY,
    
    //在线文档编辑版本。可选属性：wps, onlyoffice
    VITE_GLOB_ONLINE_DOCUMENT_VERSION,
  } = ENV;

  // if (!/^[a-zA-Z\_]*$/.test(VITE_GLOB_APP_SHORT_NAME)) {
  //   warn(
  //     `VITE_GLOB_APP_SHORT_NAME 变量只能是字符/下划线，请在环境变量中修改并重新运行.`
  //   );
  // }

  return {
    VITE_GLOB_APP_TITLE,
    VITE_GLOB_API_URL,
    VITE_USE_MOCK,
    VITE_GLOB_APP_SHORT_NAME,
    VITE_GLOB_API_URL_PREFIX,
    VITE_GLOB_APP_OPEN_SSO,
    VITE_GLOB_APP_OPEN_QIANKUN,
    VITE_GLOB_APP_CAS_BASE_URL,
    VITE_GLOB_DOMAIN_URL,
    VITE_GLOB_ONLINE_VIEW_URL,
    VITE_GLOB_HIDE_LAYOUT_TYPES,
    VITE_GLOB_RUN_PLATFORM,

    // 【JEECG作为乾坤子应用】
    VITE_GLOB_QIANKUN_MICRO_APP_NAME,
    VITE_GLOB_QIANKUN_MICRO_APP_ENTRY,

    //在线文档编辑版本。可选属性：wps, onlyoffice
    VITE_GLOB_ONLINE_DOCUMENT_VERSION
  };
}

/**
 * @description: Development mode
 */
export const devMode = 'development';

/**
 * @description: Production mode
 */
export const prodMode = 'production';

/**
 * @description: Get environment variables
 * @returns:
 * @example:
 */
export function getEnv(): string {
  return import.meta.env.MODE;
}

/**
 * @description: Is it a development mode
 * @returns:
 * @example:
 */
export function isDevMode(): boolean {
  return import.meta.env.DEV;
}

/**
 * @description: Is it a production mode
 * @returns:
 * @example:
 */
export function isProdMode(): boolean {
  return import.meta.env.PROD;
}

export function getHideLayoutTypes(): string[] {
  const {VITE_GLOB_HIDE_LAYOUT_TYPES} = getAppEnvConfig();
  if (typeof VITE_GLOB_HIDE_LAYOUT_TYPES !== 'string') {
    return [];
  }
  return VITE_GLOB_HIDE_LAYOUT_TYPES.split(',');
}

/**
 * 获取在线文档版本号
 */
export function getOnlineDocumentVersion(): string {
  const { VITE_GLOB_ONLINE_DOCUMENT_VERSION } = getAppEnvConfig();
  if (typeof VITE_GLOB_ONLINE_DOCUMENT_VERSION !== 'string') {
    return 'wps';
  }
  return VITE_GLOB_ONLINE_DOCUMENT_VERSION;
}
