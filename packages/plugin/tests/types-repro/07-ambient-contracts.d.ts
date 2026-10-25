/**
 * 全局脚本 d.ts（无顶层 import/export——与 dts-ambient 生成的 modules.d.ts 同形态）：
 * 环境模块声明在这里是真正的 ambient 声明（在 module 文件里写 declare module 只会
 * 被当成增强，未解析目标时静默失效）。FgVueRemoteProps 的命名合同保留沿此验证。
 */
declare module 'demo-host/__internal/contracts' {
  /** 审批上下文（业务标识字符串，可选字段与真实声明同形） */
  export interface ProcessFormContext {
    id: string
    toEdit?: string
    disabled?: boolean
  }
  /** CUSTOM 表单必须同时指定单据与组件路径 */
  export interface CustomFormParams extends ProcessFormContext {
    name: string
  }
}
