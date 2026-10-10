// 自动生成：fulgurjs-federation 远程类型（remote: react-remote，来源: /react-remote/fulgurjs-remoteEntry.js，revision: a614927c5da16a52）。
// 本文件由插件管理（dev 自动同步 / npx @fulgurjs/federation types），手动修改会被覆盖。
// 外部类型依赖（宿主需可解析）：@fulgurjs/federation, react。
declare module "react-remote/__internal/src/ChildLayout" {
  import type { ReactElement } from 'react';
  export default function ChildLayout(): ReactElement;
}

declare module "react-remote/bridge" {
  const _default: import("@fulgurjs/federation/react").BridgeApp & {
      __fgBridgeProps?: Record<string, unknown> | undefined;
  };
  export default _default;
}

declare module "react-remote/__internal/src/child-bus" {
  /**
   * examples/templates/showcase/react-remote/src/child-bus.ts — 子应用 → 宿主观测台上报总线。
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

declare module "react-remote/__internal/src/pages/Locked" {
  /**
   * examples/templates/showcase/react-remote/src/pages/Locked.tsx — 锁定页（守卫放行后才可见）。
   * 前往本页的导航会被宿主守卫（Vue：异步 beforeEach；React：useBlocker）拦截，等待「继续/取消」。
   */
  import type { ReactElement } from 'react';
  export default function Locked(): ReactElement;
}

declare module "react-remote/__internal/src/pages/OrderDetail" {
  /**
   * examples/templates/showcase/react-remote/src/pages/OrderDetail.tsx — 工单详情页（路径参数 /orders/:id）。
   * 「返回列表」走 go(-1)（委托宿主浏览器历史）；「回列表」走 push（经通道写宿主 URL）。
   */
  import type { ReactElement } from 'react';
  export default function OrderDetail(): ReactElement;
}

declare module "react-remote/__internal/src/pages/OrderList" {
  import type { ReactElement } from 'react';
  export default function OrderList(): ReactElement;
}

declare module "react-remote/__internal/src/pages/Settings" {
  import type { ReactElement } from 'react';
  export default function Settings(): ReactElement;
}

declare module "react-remote/__internal/src/settings-store" {
  /**
   * examples/templates/showcase/react-remote/src/settings-store.ts — 设置页本地状态（模块级对象，刻意不写入 URL）。
   * 子应用 root 不重挂 → 模块不重建：路由往返后设置仍保留，佐证「内部状态跨路由保留」。
   */
  export interface SettingsState {
      nickname: string;
      notifyEnabled: boolean;
      theme: 'light' | 'dark';
  }
  export const settingsState: SettingsState;
}
