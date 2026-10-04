/** 普通 TS 工具模块：演示跨应用函数/常量消费（不含任何组件） */
export const DEMO_ANSWER = 42

export function sumNumbers(...numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0)
}

export function formatPrice(yuan: number): string {
  return `¥${yuan.toFixed(2)}`
}
