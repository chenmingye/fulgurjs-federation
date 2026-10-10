// 自动生成：fulgurjs-federation 远程类型（remote: bridge-vue-remote，来源: /bridge-vue-remote/fulgurjs-remoteEntry.js，revision: 05c2086d5a0a1c0a）。
// 本文件由插件管理（dev 自动同步 / npx @fulgurjs/federation types），手动修改会被覆盖。
// 外部类型依赖（宿主需可解析）：@fulgurjs/federation。
declare module "bridge-vue-remote/bridge" {
  /** props 类型：appProps 由宿主传入（label + 稳定回调 onReady） */
  export interface BridgeVueProps {
      label?: string;
      onReady?: () => void;
  }
  declare const _default: import("@fulgurjs/federation/vue").BridgeApp & {
      __fgBridgeProps?: Record<string, unknown> | undefined;
  };
  export default _default;
}
