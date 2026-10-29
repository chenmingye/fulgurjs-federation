// 自动生成：fulgurjs-federation 远程类型（remote: vue-remote，来源: /vue-remote/fulgurjs-remoteEntry.js，revision: 05c9ba85d9cc6a0a）。
// 本文件由插件管理（dev 自动同步 / npx @fulgurjs/federation types），手动修改会被覆盖。
// 外部类型依赖（宿主需可解析）：vue。
declare module "vue-remote/pages/DetailPage" {
  type __VLS_Props = {
      id?: string;
      tab?: string;
  };
  const _default: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
  type __FgOriginalComponent = typeof _default;
  /** 远程 Vue 组件 PagesDetailPage。
   * Props: { id?: string; tab?: string; }
   * 完整组件签名继承原声明；嵌套字段请查看对应 props 类型。
   */
  interface PagesDetailPage extends __FgOriginalComponent {}
  /** 远程 Vue 组件 PagesDetailPage。
   * Props: { id?: string; tab?: string; }
   * 完整组件签名继承原声明；嵌套字段请查看对应 props 类型。
   */
  const __fgNamedComponent: PagesDetailPage;
  export default __fgNamedComponent;
}

declare module "vue-remote/pages/HomePage" {
  const _default: import("vue").DefineComponent<{}, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
  type __FgOriginalComponent = typeof _default;
  /** 远程 Vue 组件 PagesHomePage。
   * Props: {}
   * 完整组件签名继承原声明；嵌套字段请查看对应 props 类型。
   */
  interface PagesHomePage extends __FgOriginalComponent {}
  /** 远程 Vue 组件 PagesHomePage。
   * Props: {}
   * 完整组件签名继承原声明；嵌套字段请查看对应 props 类型。
   */
  const __fgNamedComponent: PagesHomePage;
  export default __fgNamedComponent;
}

declare module "vue-remote/utils" {
  /** 普通 TS 工具模块：演示跨应用函数/常量消费（不含任何组件） */
  export const DEMO_ANSWER = 42;
  export function sumNumbers(...numbers: number[]): number;
  export function formatPrice(yuan: number): string;
}

declare module "vue-remote/ClickButton" {
  const _default: import("vue").DefineComponent<{}, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
  type __FgOriginalComponent = typeof _default;
  /** 远程 Vue 组件 ClickButton。
   * Props: {}
   * 完整组件签名继承原声明；嵌套字段请查看对应 props 类型。
   */
  interface ClickButton extends __FgOriginalComponent {}
  /** 远程 Vue 组件 ClickButton。
   * Props: {}
   * 完整组件签名继承原声明；嵌套字段请查看对应 props 类型。
   */
  const __fgNamedComponent: ClickButton;
  export default __fgNamedComponent;
}
