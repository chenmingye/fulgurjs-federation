// 自动生成：fulgurjs-federation 远程类型（remote: vue-remote，来源: /vue-remote/fulgurjs-remoteEntry.js，revision: b2f4ac147bf28b93）。
// 本文件由插件管理（dev 自动同步 / npx @fulgurjs/federation types），手动修改会被覆盖。
// 外部类型依赖（宿主需可解析）：@fulgurjs/federation, vue。
declare module "vue-remote/__internal/src/ChildLayout" {
  const _default: import("vue").DefineComponent<{}, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
  export default _default;
}

declare module "vue-remote/bridge" {
  const _default: import("@fulgurjs/federation/vue").BridgeApp & {
      __fgBridgeProps?: Record<string, unknown> | undefined;
  };
  export default _default;
}

declare module "vue-remote/__internal/src/child-bus" {
  /**
   * examples/templates/showcase/vue-remote/src/child-bus.ts — 子应用 → 宿主观测台上报总线。
   * 宿主经 appProps 传入稳定回调 onChildEvent；本模块持有该引用并维护挂载计数。
   * 单页单实例假设：同一宿主页同时只挂一个本子应用实例（路由同步前缀互斥的常规形态）。
   */
  export type DemoChildNavAction = 'push' | 'replace' | 'go' | 'init';
  export type DemoChildEvent = {
      type: 'mounted';
      mountCount: number;
  } | {
      type: 'nav';
      source: string;
      action: DemoChildNavAction;
      detail: string;
  };
  export type DemoChildReporter = (event: DemoChildEvent) => void;
  /** 桥接工厂内调用：从 props 快照中取出宿主回调，并上报本次挂载计数 */
  export function bindReporter(props: Record<string, unknown> | undefined): void;
  /** 导航来源上报（子应用 Link / 子应用 push·replace / 子应用 go / 子应用初始化） */
  export function reportNav(source: string, action: DemoChildNavAction, detail: string): void;
  export function getMountCount(): number;
}

declare module "vue-remote/__internal/src/pages/Locked" {
  const _default: import("vue").DefineComponent<{}, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
  export default _default;
}

declare module "vue-remote/__internal/src/pages/OrderDetail" {
  const _default: import("vue").DefineComponent<{}, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
  export default _default;
}

declare module "vue-remote/__internal/src/pages/OrderList" {
  const _default: import("vue").DefineComponent<{}, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
  export default _default;
}

declare module "vue-remote/__internal/src/pages/Settings" {
  const _default: import("vue").DefineComponent<{}, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
  export default _default;
}

declare module "vue-remote/__internal/src/settings-store" {
  export interface SettingsState {
      nickname: string;
      notifyEnabled: boolean;
      theme: 'light' | 'dark';
  }
  export const settingsState: {
      nickname: string;
      notifyEnabled: boolean;
      theme: "light" | "dark";
  };
}
