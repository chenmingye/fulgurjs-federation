// 自动生成：fulgurjs-federation 远程类型（remote: react-remote，来源: /react-remote/fulgurjs-remoteEntry.js，revision: 38ad9fa42144e844）。
// 本文件由插件管理（dev 自动同步 / npx @fulgurjs/federation types），手动修改会被覆盖。
// 外部类型依赖（宿主需可解析）：react。
declare module "react-remote/ClickButton" {
  /** 可点击计数按钮：本地 state 保存在远程组件内部（宿主消费时运行在宿主页面的 React 上） */
  export default function ClickButton(): import("react").JSX.Element;
}

declare module "react-remote/pages/DetailPage" {
  /** 联邦参数页：宿主路由的 params + query 作为 props 传入 */
  export default function DetailPage({ id, tab }: {
      id?: string;
      tab?: string;
  }): import("react").JSX.Element;
}

declare module "react-remote/pages/HomePage" {
  /** 联邦页面：渲染在宿主的路由出口内 */
  export default function HomePage(): import("react").JSX.Element;
}

declare module "react-remote/utils" {
  /** 普通 TS 工具模块：演示跨应用函数/常量消费（不含任何组件） */
  export const DEMO_ANSWER = 42;
  export function sumNumbers(...numbers: number[]): number;
  export function formatPrice(yuan: number): string;
}
