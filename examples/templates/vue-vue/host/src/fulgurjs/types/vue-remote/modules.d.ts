// 自动生成：fulgurjs-federation 远程类型（remote: vue-remote，来源: /vue-remote/fulgurjs-remoteEntry.js，revision: 0198caec0fd611b1）。
// 本文件由插件管理（dev 自动同步 / npx @fulgurjs/federation types），手动修改会被覆盖。
// 外部类型依赖（宿主需可解析）：vue。
declare module "vue-remote/ClickButton" {
  const _default: import("vue").DefineComponent<{}, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
  export default _default;
}

declare module "vue-remote/pages/DetailPage" {
  type __VLS_Props = {
      id?: string;
      tab?: string;
  };
  const _default: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
  export default _default;
}

declare module "vue-remote/pages/HomePage" {
  const _default: import("vue").DefineComponent<{}, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
  export default _default;
}

declare module "vue-remote/utils" {
  /** 普通 TS 工具模块：演示跨应用函数/常量消费（不含任何组件） */
  export const DEMO_ANSWER = 42;
  export function sumNumbers(...numbers: number[]): number;
  export function formatPrice(yuan: number): string;
}
